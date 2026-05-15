// web/lib/backend/services/api-keys.ts
import { unstable_cache } from 'next/cache';
import connectToDatabase from '@/lib/backend/db';
import { ApiKey, IApiKey } from '@/lib/backend/models/ApiKey';
import { CACHE_TAGS } from '@/lib/backend/cache-tags';

export const getApiKeys = (dashboardId: string) => 
  unstable_cache(
    async (dId: string) => {
      await connectToDatabase();
      const keys = await ApiKey.find({ dashboardId: dId }).sort({ createdAt: -1 }).lean();
      return (keys as IApiKey[]).map((k) => ({
        id: String(k._id),
        label: k.label ?? null,
        spend_limit_usdc: k.spendLimitUsdc ?? null,
        total_spent_usdc: k.totalSpentUsdc || '0',
        default_webhook_url: k.defaultWebhookUrl ?? null,
        wallet_public_key: k.walletPublicKey ?? null,
        enabled: k.enabled ? 1 : 0,
        suspended: k.suspended ? 1 : 0,
        last_used_at: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
        created_at: k.createdAt ? k.createdAt.toISOString() : new Date().toISOString(),
        policy_daily_limit_usdc: k.policyDailyLimitUsdc ?? null,
        policy_single_tx_limit_usdc: k.policySingleTxLimitUsdc ?? null,
        policy_require_approval_above_usdc: k.policyRequireApprovalAboveUsdc ?? null,
        policy_allowed_hours: k.policyAllowedHours ?? null,
        policy_allowed_days: k.policyAllowedDays ?? null,
        mode: k.mode || 'live',
        rate_limit_rpm: k.rateLimitRpm ?? null,
        expires_at: k.expiresAt ? k.expiresAt.toISOString() : null,
        agent: k.agentState ? {
          state: k.agentState as any,
          label: '',
          detail: k.agentStateDetail ?? null,
          since: k.agentStateAt ? k.agentStateAt.toISOString() : null,
          wallet_public_key: k.walletPublicKey ?? null,
        } : undefined,
      }));
    },
    [CACHE_TAGS.API_KEYS],
    { tags: [CACHE_TAGS.API_KEYS] }
  )(dashboardId);

export const getApiKey = (id: string) =>
  unstable_cache(
    async (keyId: string) => {
      await connectToDatabase();
      const k = (await ApiKey.findById(keyId).lean()) as IApiKey | null;
      if (!k) return null;
      return {
        id: String(k._id),
        label: k.label ?? null,
        spend_limit_usdc: k.spendLimitUsdc ?? null,
        total_spent_usdc: k.totalSpentUsdc || '0',
        default_webhook_url: k.defaultWebhookUrl ?? null,
        wallet_public_key: k.walletPublicKey ?? null,
        enabled: k.enabled ? 1 : 0,
        suspended: k.suspended ? 1 : 0,
        last_used_at: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
        created_at: k.createdAt ? k.createdAt.toISOString() : new Date().toISOString(),
        policy_daily_limit_usdc: k.policyDailyLimitUsdc ?? null,
        policy_single_tx_limit_usdc: k.policySingleTxLimitUsdc ?? null,
        policy_require_approval_above_usdc: k.policyRequireApprovalAboveUsdc ?? null,
        policy_allowed_hours: k.policyAllowedHours ?? null,
        policy_allowed_days: k.policyAllowedDays ?? null,
        mode: k.mode || 'live',
        rate_limit_rpm: k.rateLimitRpm ?? null,
        expires_at: k.expiresAt ? k.expiresAt.toISOString() : null,
        agent: k.agentState ? {
          state: k.agentState as any,
          label: '',
          detail: k.agentStateDetail ?? null,
          since: k.agentStateAt ? k.agentStateAt.toISOString() : null,
          wallet_public_key: k.walletPublicKey ?? null,
        } : undefined,
      };
    },
    [CACHE_TAGS.API_KEYS],
    { tags: [CACHE_TAGS.API_KEYS] }
  )(id);
