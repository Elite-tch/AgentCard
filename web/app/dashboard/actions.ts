// web/app/dashboard/actions.ts
'use server'

import { revalidateTag } from 'next/cache';
import connectToDatabase from '@/lib/backend/db';
import { CACHE_TAGS } from '@/lib/backend/cache-tags';
import { Order } from '@/lib/backend/models/Order';
import { ApiKey } from '@/lib/backend/models/ApiKey';
import { ApprovalRequest } from '@/lib/backend/models/ApprovalRequest';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');
  return session;
}

export async function createAgentAction(data: { label: string; spendLimitUsdc?: string }) {
  const session = await getSession();
  await connectToDatabase();

  const rawKey = `AgentCard_${crypto.randomBytes(24).toString('hex')}`;
  const keyPrefix = rawKey.slice(10, 22);
  const keyHash = await bcrypt.hash(rawKey, 10);
  const webhookSecret = `whsec_${crypto.randomBytes(32).toString('hex')}`;

  const claimCode = `acard_${crypto.randomBytes(16).toString('hex')}`;
  const CLAIM_TTL_MS = 10 * 60 * 1000;
  const claimExpiresAt = new Date(Date.now() + CLAIM_TTL_MS);

  const newKey = await ApiKey.create({
    dashboardId: session.user.id,
    keyHash,
    keyPrefix,
    label: data.label?.slice(0, 100),
    spendLimitUsdc: data.spendLimitUsdc,
    webhookSecret,
    enabled: true,
    suspended: false,
    claimCode,
    claimExpiresAt,
    temporaryRawKey: rawKey,
    agentState: 'minted',
    agentStateAt: new Date(),
  });

  revalidateTag(CACHE_TAGS.API_KEYS, 'max');
  revalidateTag(CACHE_TAGS.DASHBOARD_STATS, 'max');

  return {
    id: String(newKey._id),
    label: newKey.label,
    wallet_public_key: newKey.walletPublicKey,
    claim: {
      code: claimCode,
      expires_at: claimExpiresAt.toISOString(),
      ttl_ms: CLAIM_TTL_MS,
    },
  };
}

export async function approveOrderAction(orderId: string, decisionNote?: string) {
  const session = await getSession();
  await connectToDatabase();
  
  await ApprovalRequest.findOneAndUpdate(
    { orderId },
    { status: 'approved', decidedAt: new Date(), decisionNote }
  );
  await Order.findByIdAndUpdate(orderId, { status: 'awaiting_payment' });
  
  revalidateTag(CACHE_TAGS.ORDERS, 'max');
  revalidateTag(CACHE_TAGS.APPROVALS, 'max');
  revalidateTag(CACHE_TAGS.DASHBOARD_STATS, 'max');
}

export async function rejectOrderAction(orderId: string, decisionNote?: string) {
  const session = await getSession();
  await connectToDatabase();
  
  await ApprovalRequest.findOneAndUpdate(
    { orderId },
    { status: 'rejected', decidedAt: new Date(), decisionNote }
  );
  await Order.findByIdAndUpdate(orderId, { status: 'rejected' });
  
  revalidateTag(CACHE_TAGS.ORDERS, 'max');
  revalidateTag(CACHE_TAGS.APPROVALS, 'max');
}

export async function updateAgentAction(id: string, data: any) {
  await getSession();
  await connectToDatabase();
  await ApiKey.findByIdAndUpdate(id, data);
  revalidateTag(CACHE_TAGS.API_KEYS, 'max');
}

export async function deleteAgentAction(id: string) {
  await getSession();
  await connectToDatabase();
  await ApiKey.findByIdAndDelete(id);
  revalidateTag(CACHE_TAGS.API_KEYS, 'max');
  revalidateTag(CACHE_TAGS.DASHBOARD_STATS, 'max');
}
