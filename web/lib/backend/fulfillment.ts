import crypto from 'crypto';
import { assertSafeUrl } from './ssrf';
import { sendUsdc, sendXlm } from './xlm-sender';
import { bizEvent } from './logger';
import { recordWebhookDelivery } from './webhook-log';
import { SystemState } from './models/SystemState';
import { Order } from './models/Order';
import { WebhookQueue } from './models/WebhookQueue';
import connectToDatabase from './db';

export async function isFrozen() {
  await connectToDatabase();
  const state = await SystemState.findOne({ key: 'frozen' });
  return state?.value === '1';
}

export function redactCardFields(payload: any) {
  if (!payload || typeof payload !== 'object' || !payload.card) return payload;
  return {
    ...payload,
    card: {
      ...payload.card,
      number: null,
      cvv: null,
      expiry: null,
    },
  };
}

export const WEBHOOK_RETRY_DELAYS_MS = [30_000, 5 * 60_000, 30 * 60_000];
export const MAX_WEBHOOK_ATTEMPTS = 3;

const CB_THRESHOLD = 5;
const CB_WINDOW_MS = 60_000;
const CB_COOLDOWN_MS = 5 * 60_000;
export const circuitBreakerState = new Map();

function getOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function circuitIsOpen(origin: string) {
  const s = circuitBreakerState.get(origin);
  if (!s) return false;
  return Date.now() < s.openedUntil;
}

export function recordCircuitFailure(origin: string | null) {
  if (!origin) return;
  let s = circuitBreakerState.get(origin);
  if (!s) {
    s = { failures: [], openedUntil: 0 };
    circuitBreakerState.set(origin, s);
  }
  const now = Date.now();
  s.failures = s.failures.filter((ts: number) => now - ts < CB_WINDOW_MS);
  s.failures.push(now);
  if (s.failures.length >= CB_THRESHOLD) {
    s.openedUntil = now + CB_COOLDOWN_MS;
    bizEvent('webhook.circuit_opened', {
      origin,
      failures: s.failures.length,
      reopen_at: new Date(s.openedUntil).toISOString(),
    });
    s.failures = [];
  }
}

export function recordCircuitSuccess(origin: string | null) {
  if (!origin) return;
  const s = circuitBreakerState.get(origin);
  if (s) {
    s.failures = [];
    if (Date.now() >= s.openedUntil) {
      s.openedUntil = 0;
    }
  }
}

export async function fireWebhook(url: string, payload: any, webhookSecret: string | null, _log: any, context: any = {}) {
  const origin = getOrigin(url);
  if (origin && circuitIsOpen(origin)) {
    throw new Error(`webhook circuit open for ${origin}`);
  }

  await assertSafeUrl(url);
  const body = JSON.stringify(payload);
  const headers: any = { 'Content-Type': 'application/json' };

  let signatureHeader = null;
  if (webhookSecret) {
    const ts = String(Date.now());
    const sig = crypto.createHmac('sha256', webhookSecret).update(`${ts}.${body}`).digest('hex');
    headers['X-AgentCard-Signature'] = `sha256=${sig}`;
    headers['X-AgentCard-Timestamp'] = ts;
    signatureHeader = headers['X-AgentCard-Signature'];
  }

  const startedAt = Date.now();
  let responseStatus = null;
  let responseBodyText = null;
  let deliveryError = null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    responseStatus = res.status;
    try {
      responseBodyText = (await res.clone().text()).slice(0, 2000);
    } catch {}
    
    if (!res.ok) {
      recordCircuitFailure(origin);
      deliveryError = `HTTP ${res.status}`;
      throw new Error(`webhook HTTP ${res.status}`);
    }
    recordCircuitSuccess(origin);
  } catch (err: any) {
    if (!/circuit open/.test(err.message)) recordCircuitFailure(origin);
    deliveryError = deliveryError || err.message;
    throw err;
  } finally {
    recordWebhookDelivery({
      url,
      method: 'POST',
      requestBody: redactCardFields(payload),
      responseStatus: responseStatus ?? undefined,
      responseBody: responseBodyText ?? undefined,
      latencyMs: Date.now() - startedAt,
      error: deliveryError ?? undefined,
      signature: signatureHeader ?? undefined,
      dashboardId: context.dashboardId ?? undefined,
      apiKeyId: context.apiKeyId ?? undefined,
    });
  }
}

export async function enqueueWebhook(url: string, payload: any, webhookSecret: string | null) {
  let deliveryErr: any;
  try {
    await fireWebhook(url, payload, webhookSecret, null);
    return;
  } catch (err) {
    deliveryErr = err;
  }
  
  const nextAttempt = new Date(Date.now() + WEBHOOK_RETRY_DELAYS_MS[0]!);
  const errMessage = deliveryErr?.message || String(deliveryErr);
  
  try {
    await connectToDatabase();
    await WebhookQueue.create({
      url,
      payload: JSON.stringify(redactCardFields(payload)),
      secret: webhookSecret || undefined,
      attempts: 1,
      nextAttempt,
      lastError: errMessage,
    });
  } catch (insertErr: any) {
    bizEvent('webhook.queue_insert_failed', {
      url,
      original_delivery_error: errMessage,
      insert_error: insertErr?.message || String(insertErr),
    });
    console.error(`[webhook] failed to persist ${url} to webhook_queue after delivery error`);
  }
}

function isValidRefundAmount(amount: any) {
  if (amount === null || amount === undefined || amount === '') return false;
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return false;
  return parseFloat(s) > 0;
}

export function computeUsdcRefundAmount(amountUsdc: any, excessUsdc: any) {
  const toStroopsOrZero = (s: any) => {
    if (s === null || s === undefined || s === '') return BigInt(0);
    const str = String(s).trim();
    if (!/^\d+(\.\d+)?$/.test(str)) return BigInt(0);
    const [whole, frac = ''] = str.split('.');
    const paddedFrac = (frac + '0000000').slice(0, 7);
    return BigInt(whole || '0') * BigInt(10000000) + BigInt(paddedFrac || '0');
  };

  const quoted = toStroopsOrZero(amountUsdc);
  const excess = toStroopsOrZero(excessUsdc);
  
  const stroopsToDecimal = (stroops: bigint) => {
    const whole = stroops / BigInt(10000000);
    const frac = String(stroops % BigInt(10000000)).padStart(7, '0');
    return `${whole}.${frac}`;
  };

  return stroopsToDecimal(quoted + excess);
}

async function recordRefundSendFailure(orderId: string, asset: string, amount: string, err: any) {
  const txHash = err?.txHash || null;
  const stellarStatus = err?.stellarStatus || 'legacy';

  if (txHash) {
    await connectToDatabase();
    const order = await Order.findById(orderId);
    if (order) {
      order.refundStellarTxid = order.refundStellarTxid || txHash;
      order.updatedAt = new Date();
      await order.save();
    }
  }
  
  bizEvent('refund.send_failed', {
    order_id: orderId,
    asset,
    amount,
    stellar_status: stellarStatus,
    tx_hash: txHash,
    error: err?.message || String(err),
  });
  
  const reviewTag = stellarStatus === 'unknown' || stellarStatus === 'applied_failed' ? 'VERIFY_ON_CHAIN' : 'SAFE_TO_RETRY';
  console.log(`[refund] ${orderId}: ${asset} refund failed [${stellarStatus}] [${reviewTag}] txHash=${txHash || 'none'}: ${err?.message}`);
}

export async function scheduleRefund(orderId: string) {
  if (await isFrozen()) {
    bizEvent('refund.skipped_frozen', { order_id: orderId });
    return;
  }

  await connectToDatabase();
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: { $nin: ['refund_pending', 'refunded'] } },
    { status: 'refund_pending', updatedAt: new Date() },
    { new: true }
  );

  if (!order) {
    console.log(`[refund] ${orderId}: already refunding or refunded — skipping`);
    return;
  }

  if (!order.senderAddress) {
    console.log(`[refund] ${orderId}: no sender_address — left as refund_pending for manual action`);
    return;
  }

  const asset = order.paymentAsset;
  const isXlm = asset === 'xlm_soroban' || asset === 'xlm';
  const isUsdc = asset === 'usdc_soroban' || asset === 'usdc';
  
  if (!isXlm && !isUsdc) {
    bizEvent('refund.unknown_asset', { order_id: orderId, asset });
    return;
  }

  if (isXlm) {
    const xlmAmount = order.paymentXlmAmount;
    if (!isValidRefundAmount(xlmAmount)) return;
    
    try {
      const txHash = await sendXlm({
        destination: order.senderAddress,
        amount: xlmAmount!,
        memo: `refund:${orderId.slice(0, 18)}`,
      });
      order.status = 'refunded';
      order.refundStellarTxid = txHash;
      order.updatedAt = new Date();
      await order.save();
      bizEvent('refund.sent', { order_id: orderId, asset: 'xlm', amount: xlmAmount, txid: txHash });
    } catch (err) {
      await recordRefundSendFailure(orderId, 'xlm', xlmAmount!, err);
    }
  } else {
    if (!isValidRefundAmount(order.amountUsdc)) return;
    
    const refundAmount = computeUsdcRefundAmount(order.amountUsdc, order.excessUsdc);
    const amountToSend = isValidRefundAmount(refundAmount) ? refundAmount : order.amountUsdc;
    
    try {
      const txHash = await sendUsdc({
        destination: order.senderAddress,
        amount: amountToSend,
        memo: `refund:${orderId.slice(0, 18)}`,
      });
      order.status = 'refunded';
      order.refundStellarTxid = txHash;
      order.updatedAt = new Date();
      await order.save();
      bizEvent('refund.sent', { order_id: orderId, asset: 'usdc', amount: amountToSend, txid: txHash });
    } catch (err) {
      await recordRefundSendFailure(orderId, 'usdc', amountToSend, err);
    }
  }
}

export async function quarantineForManualRecovery(orderId: string, publicErrorMessage: string) {
  await connectToDatabase();
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: { $nin: ['delivered', 'failed', 'refunded', 'refund_pending', 'pending_manual_recovery'] } },
    { status: 'pending_manual_recovery', error: publicErrorMessage, updatedAt: new Date() },
    { new: true }
  );
  
  if (!order) return;
  
  bizEvent('order.quarantined', { order_id: orderId, reason: publicErrorMessage });
}

export async function refundOrQuarantine(orderId: string, publicErrorMessage: string) {
  await connectToDatabase();
  const order = await Order.findById(orderId).select('ctxStellarTxid');
  if (order?.ctxStellarTxid) {
    return quarantineForManualRecovery(orderId, publicErrorMessage);
  }
  return scheduleRefund(orderId);
}
