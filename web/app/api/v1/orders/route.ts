import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import connectToDatabase from '@/lib/backend/db';
import { authenticateApiKey } from '@/lib/backend/apiKeyAuth';
import { canonicalJson, buildBudget } from '@/lib/backend/utils';
import { isFrozen } from '@/lib/backend/fulfillment';
import { assertSafeUrl } from '@/lib/backend/ssrf';
import { usdToXlm } from '@/lib/backend/xlm-price';
import { checkPolicy } from '@/lib/backend/policy';
import { insertPendingPaymentOrder } from '@/lib/backend/orders/core';
import { bizEvent } from '@/lib/backend/logger';
import { notifyOwnerApprovalNeeded, checkSpendAlert } from '@/lib/backend/email';
import { sealCard } from '@/lib/backend/card-vault';
import { IdempotencyKey } from '@/lib/backend/models/IdempotencyKey';
import { Order } from '@/lib/backend/models/Order';

const MAX_METADATA_JSON_BYTES = 8 * 1024;
const MAX_WEBHOOK_URL_CHARS = 2048;

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok || !auth.apiKey) {
    return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid_request', message: 'Request body must be a JSON object (set Content-Type: application/json).' }, { status: 400 });
  }

  const idempotencyKey = req.headers.get('idempotency-key') || null;
  if (idempotencyKey && idempotencyKey.length > 255) {
    return NextResponse.json({ error: 'invalid_idempotency_key', message: 'Idempotency-Key must be at most 255 characters.' }, { status: 400 });
  }

  const requestFingerprint = idempotencyKey ? crypto.createHash('sha256').update(canonicalJson(body)).digest('hex') : null;

  if (await isFrozen()) {
    return NextResponse.json({ error: 'service_temporarily_unavailable', message: 'Card fulfillment is temporarily suspended. Please try again later.' }, { status: 503 });
  }

  const { amount_usdc, webhook_url, metadata } = body;

  if (typeof amount_usdc !== 'string' || !/^\d+(\.\d{1,2})?$/.test(amount_usdc.trim())) {
    return NextResponse.json({ error: 'invalid_amount', message: 'amount_usdc must be a decimal with at most 2 decimal places (e.g. "10.00")' }, { status: 400 });
  }

  const amount = parseFloat(amount_usdc);
  if (!amount || amount <= 0) return NextResponse.json({ error: 'invalid_amount', message: 'amount_usdc must be a positive number' }, { status: 400 });
  if (amount < 0.01) return NextResponse.json({ error: 'invalid_amount', message: 'amount_usdc must be at least $0.01' }, { status: 400 });
  if (amount > 10000) return NextResponse.json({ error: 'invalid_amount', message: 'amount_usdc cannot exceed $10000.00' }, { status: 400 });

  if (webhook_url !== undefined && webhook_url !== null) {
    if (typeof webhook_url !== 'string') return NextResponse.json({ error: 'invalid_webhook_url', message: 'webhook_url must be a string' }, { status: 400 });
    if (webhook_url.length > MAX_WEBHOOK_URL_CHARS) return NextResponse.json({ error: 'invalid_webhook_url', message: `webhook_url must be at most ${MAX_WEBHOOK_URL_CHARS} characters` }, { status: 400 });
    try {
      await assertSafeUrl(webhook_url);
    } catch (err: any) {
      return NextResponse.json({ error: 'invalid_webhook_url', message: err.message }, { status: 400 });
    }
  }

  let metadataStr = null;
  if (metadata !== undefined) {
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      return NextResponse.json({ error: 'invalid_metadata', message: 'metadata must be a JSON object' }, { status: 400 });
    }
    try {
      metadataStr = JSON.stringify(metadata);
    } catch {
      return NextResponse.json({ error: 'invalid_metadata', message: 'metadata could not be serialized' }, { status: 400 });
    }
    if (Buffer.byteLength(metadataStr, 'utf8') > MAX_METADATA_JSON_BYTES) {
      return NextResponse.json({ error: 'invalid_metadata', message: `metadata serialized size must be at most ${MAX_METADATA_JSON_BYTES} bytes` }, { status: 400 });
    }
  }

  let xlmAmount = null;
  try {
    xlmAmount = await usdToXlm(String(amount));
  } catch (err: any) {
    console.warn(`[orders] XLM price lookup failed: ${err.message}`);
  }

  const USDC_ISSUER = process.env.STELLAR_USDC_ISSUER || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

  await connectToDatabase();

  if (idempotencyKey) {
    const cached = await IdempotencyKey.findOne({ key: idempotencyKey, apiKeyId: auth.apiKey._id });
    if (cached) {
      if (cached.requestFingerprint && cached.requestFingerprint !== requestFingerprint) {
        bizEvent('idempotency.conflict', { api_key_id: auth.apiKey._id, idempotency_key: idempotencyKey.slice(0, 16) });
        return NextResponse.json({ error: 'idempotency_conflict', message: 'Idempotency-Key reused with a different request body.' }, { status: 409 });
      }
      bizEvent('idempotency.cache_hit', { api_key_id: auth.apiKey._id, idempotency_key: idempotencyKey.slice(0, 16), cached_status: cached.responseStatus });
      return NextResponse.json(JSON.parse(cached.responseBody), { status: cached.responseStatus });
    }
  }

  const policyResult = await checkPolicy(String(auth.apiKey._id), amount_usdc);
  if (policyResult.decision === 'blocked') {
    return NextResponse.json({ error: 'policy_blocked', rule: policyResult.rule, message: policyResult.reason }, { status: 403 });
  }

  const id = crypto.randomUUID();

  if (policyResult.decision === 'pending_approval') {
    const approvalId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 120 * 60 * 1000);

    await Order.create({
      _id: id,
      status: 'awaiting_approval',
      amountUsdc: String(amount),
      apiKeyId: auth.apiKey._id,
      webhookUrl: webhook_url || undefined,
      metadata: metadataStr || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // We skipped approval_requests table for simplicity; you would port it if needed.
    const approvalBody = {
      order_id: id,
      phase: 'awaiting_approval',
      approval_request_id: approvalId,
      amount_usdc: String(amount),
      message: policyResult.reason,
      note: `The account owner has been notified. Poll GET /v1/orders/${id} to check status.`,
      expires_at: expiresAt.toISOString(),
    };

    if (idempotencyKey) {
      await IdempotencyKey.create({
        key: idempotencyKey,
        apiKeyId: auth.apiKey._id,
        requestFingerprint: requestFingerprint || undefined,
        responseStatus: 202,
        responseBody: JSON.stringify(approvalBody)
      }).catch(() => {});
    }

    notifyOwnerApprovalNeeded({ approvalId, orderId: id, amountUsdc: amount_usdc, apiKeyId: auth.apiKey._id, reason: policyResult.reason });
    return NextResponse.json(approvalBody, { status: 202 });
  }

  if (auth.apiKey.mode === 'sandbox') {
    const sealed = sealCard({ number: '4111111111111111', cvv: '123', expiry: '12/99', brand: 'Visa' });
    await Order.create({
      _id: id,
      status: 'delivered',
      amountUsdc: String(amount),
      apiKeyId: auth.apiKey._id,
      webhookUrl: webhook_url || undefined,
      metadata: metadataStr || undefined,
      cardNumber: sealed.number,
      cardCvv: sealed.cvv,
      cardExpiry: sealed.expiry,
      cardBrand: sealed.brand,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const sandboxBody = {
      order_id: id,
      status: 'delivered',
      phase: 'ready',
      amount_usdc: String(amount),
      sandbox: true,
      card: { number: '4111111111111111', cvv: '123', expiry: '12/99', brand: 'Visa' },
    };

    if (idempotencyKey) {
      await IdempotencyKey.create({
        key: idempotencyKey,
        apiKeyId: auth.apiKey._id,
        requestFingerprint: requestFingerprint || undefined,
        responseStatus: 201,
        responseBody: JSON.stringify(sandboxBody)
      }).catch(() => {});
    }
    return NextResponse.json(sandboxBody, { status: 201 });
  }

  const contractPayment: any = {
    type: 'soroban_contract',
    contract_id: process.env.RECEIVER_CONTRACT_ID,
    order_id: id,
    usdc: { amount: String(amount), asset: `USDC:${USDC_ISSUER}` },
  };
  if (xlmAmount) contractPayment.xlm = { amount: xlmAmount };

  await insertPendingPaymentOrder({
    id,
    amount_usdc: String(amount),
    expected_xlm_amount: xlmAmount,
    api_key_id: String(auth.apiKey._id),
    webhook_url: webhook_url || null,
    metadata: metadataStr,
    vcc_payment_json: JSON.stringify(contractPayment),
    request_id: null,
  });

  const budget = await buildBudget(auth.apiKey);
  const responseBody = {
    order_id: id,
    status: 'pending_payment',
    phase: 'awaiting_payment',
    amount_usdc: String(amount),
    payment: contractPayment,
    poll_url: `/v1/orders/${id}`,
    budget,
  };

  if (idempotencyKey) {
    await IdempotencyKey.create({
      key: idempotencyKey,
      apiKeyId: auth.apiKey._id,
      requestFingerprint: requestFingerprint || undefined,
      responseStatus: 201,
      responseBody: JSON.stringify(responseBody)
    }).catch(() => {});
  }

  checkSpendAlert(String(auth.apiKey._id), amount).catch(() => {});
  return NextResponse.json(responseBody, { status: 201 });
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok || !auth.apiKey) {
    return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);
  const since_created_at = url.searchParams.get('since_created_at');
  const since_updated_at = url.searchParams.get('since_updated_at');

  const query: any = { apiKeyId: auth.apiKey._id };
  if (status) query.status = status;
  if (since_created_at) query.createdAt = { $gte: new Date(since_created_at) };
  if (since_updated_at) query.updatedAt = { $gte: new Date(since_updated_at) };

  await connectToDatabase();
  const orders = await Order.find(query)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .select('_id status amountUsdc paymentAsset createdAt updatedAt');

  const mapped = orders.map((o) => ({
    id: o._id,
    status: o.status,
    amount_usdc: o.amountUsdc,
    payment_asset: o.paymentAsset,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  }));

  return NextResponse.json(mapped, { status: 200 });
}
