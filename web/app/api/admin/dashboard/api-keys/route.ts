import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/backend/db';
import { ApiKey } from '@/lib/backend/models/ApiKey';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session || !session.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dashboardId = session.user.id;
  await connectToDatabase();

  const keys = await ApiKey.find({ dashboardId }).sort({ createdAt: -1 });

  return NextResponse.json(keys.map(k => ({
    id: k._id,
    label: k.label,
    spend_limit_usdc: k.spendLimitUsdc,
    total_spent_usdc: k.totalSpentUsdc,
    default_webhook_url: k.defaultWebhookUrl,
    wallet_public_key: k.walletPublicKey,
    enabled: k.enabled,
    suspended: k.suspended,
    last_used_at: k.lastUsedAt,
    created_at: k.createdAt,
    policy_daily_limit_usdc: k.policyDailyLimitUsdc,
    policy_single_tx_limit_usdc: k.policySingleTxLimitUsdc,
    policy_require_approval_above_usdc: k.policyRequireApprovalAboveUsdc,
    policy_allowed_hours: k.policyAllowedHours,
    policy_allowed_days: k.policyAllowedDays,
    mode: k.mode,
    rate_limit_rpm: k.rateLimitRpm,
    expires_at: k.expiresAt,
    // Agent state logic omitted for brevity, fallback to db values
    agent_state: k.agentState,
    agent_state_at: k.agentStateAt,
    agent_state_detail: k.agentStateDetail
  })), { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session || !session.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dashboardId = session.user.id;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 });
  }

  const { spend_limit_usdc, default_webhook_url, wallet_public_key, label } = body;

  const rawKey = `AgentCard_${crypto.randomBytes(24).toString('hex')}`;
  const keyPrefix = rawKey.slice(10, 22);
  const keyHash = await bcrypt.hash(rawKey, 10);
  const webhookSecret = `whsec_${crypto.randomBytes(32).toString('hex')}`;

  // Generate a short-lived claim code (10 minutes). The agent CLI
  // redeems this for the actual API key — the raw key never leaves
  // the dashboard.
  const claimCode = `acard_${crypto.randomBytes(16).toString('hex')}`;
  const CLAIM_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const claimExpiresAt = new Date(Date.now() + CLAIM_TTL_MS);

  await connectToDatabase();

  const newKey = await ApiKey.create({
    dashboardId,
    keyHash,
    keyPrefix,
    label: label?.slice(0, 100) || undefined,
    spendLimitUsdc: spend_limit_usdc || undefined,
    webhookSecret,
    defaultWebhookUrl: default_webhook_url || undefined,
    walletPublicKey: wallet_public_key || undefined,
    enabled: true,
    suspended: false,
    claimCode,
    claimExpiresAt,
    temporaryRawKey: rawKey,
    agentState: 'minted',
    agentStateAt: new Date(),
  });

  return NextResponse.json({
    id: newKey._id,
    label: newKey.label,
    wallet_public_key: newKey.walletPublicKey,
    claim: {
      code: claimCode,
      expires_at: claimExpiresAt.toISOString(),
      ttl_ms: CLAIM_TTL_MS,
    },
  }, { status: 201 });
}
