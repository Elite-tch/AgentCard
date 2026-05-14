// web/lib/backend/services/api-keys.ts
import { unstable_cache } from 'next/cache';
import connectToDatabase from '@/lib/backend/db';
import { ApiKey } from '@/lib/backend/models/ApiKey';
import { CACHE_TAGS } from '@/lib/backend/cache-tags';

export const getApiKeys = (dashboardId: string) => 
  unstable_cache(
    async (dId: string) => {
      await connectToDatabase();
      const keys = await ApiKey.find({ dashboardId: dId }).sort({ createdAt: -1 }).lean();
      return keys.map((k: any) => ({
        id: String(k._id),
        label: k.label,
        spend_limit_usdc: k.spendLimitUsdc,
        total_spent_usdc: k.totalSpentUsdc || '0',
        default_webhook_url: k.defaultWebhookUrl,
        wallet_public_key: k.walletPublicKey,
        enabled: k.enabled ? 1 : 0,
        suspended: k.suspended ? 1 : 0,
        last_used_at: k.lastUsedAt,
        created_at: k.createdAt,
        policy_daily_limit_usdc: k.policyDailyLimitUsdc,
        policy_single_tx_limit_usdc: k.policySingleTxLimitUsdc,
        policy_require_approval_above_usdc: k.policyRequireApprovalAboveUsdc,
        policy_allowed_hours: k.policyAllowedHours,
        policy_allowed_days: k.policyAllowedDays,
        mode: k.mode || 'live',
        rate_limit_rpm: k.rateLimitRpm,
        expires_at: k.expiresAt,
        agent: k.agentState ? {
          state: k.agentState,
          label: '',
          detail: k.agentStateDetail,
          since: k.agentStateAt,
          wallet_public_key: k.walletPublicKey,
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
      const k = await ApiKey.findById(keyId).lean() as any;
      if (!k) return null;
      return {
        id: String(k._id),
        label: k.label,
        spend_limit_usdc: k.spendLimitUsdc,
        total_spent_usdc: k.totalSpentUsdc || '0',
        default_webhook_url: k.defaultWebhookUrl,
        wallet_public_key: k.walletPublicKey,
        enabled: k.enabled ? 1 : 0,
        suspended: k.suspended ? 1 : 0,
        last_used_at: k.lastUsedAt,
        created_at: k.createdAt,
        policy_daily_limit_usdc: k.policyDailyLimitUsdc,
        policy_single_tx_limit_usdc: k.policySingleTxLimitUsdc,
        policy_require_approval_above_usdc: k.policyRequireApprovalAboveUsdc,
        policy_allowed_hours: k.policyAllowedHours,
        policy_allowed_days: k.policyAllowedDays,
        mode: k.mode || 'live',
        rate_limit_rpm: k.rateLimitRpm,
        expires_at: k.expiresAt,
        agent: k.agentState ? {
          state: k.agentState,
          label: '',
          detail: k.agentStateDetail,
          since: k.agentStateAt,
          wallet_public_key: k.walletPublicKey,
        } : undefined,
      };
    },
    [CACHE_TAGS.API_KEYS],
    { tags: [CACHE_TAGS.API_KEYS] }
  )(id);
