// web/lib/backend/services/approvals.ts
import { unstable_cache } from 'next/cache';
import connectToDatabase from '@/lib/backend/db';
import { ApprovalRequest, IApprovalRequest } from '@/lib/backend/models/ApprovalRequest';
import { ApiKey } from '@/lib/backend/models/ApiKey';
import { CACHE_TAGS } from '@/lib/backend/cache-tags';

export const getApprovals = (dashboardId: string, status = 'pending', limit = 100) =>
  unstable_cache(
    async (dId: string, s: string, l: number) => {
      await connectToDatabase();
      const keys = await ApiKey.find({ dashboardId: dId }).select('_id').lean();
      const keyIds = keys.map(k => k._id);

      const approvals = await ApprovalRequest.find({
        apiKeyId: { $in: keyIds },
        status: s,
      })
        .sort({ requestedAt: -1 })
        .limit(l)
        .populate({ path: 'apiKeyId', select: 'label' })
        .lean();

      return (approvals as any[]).map((ar) => ({
        id: String(ar._id),
        api_key_id: ar.apiKeyId?._id ? String(ar.apiKeyId._id) : String(ar.apiKeyId),
        order_id: String(ar.orderId),
        amount_usdc: ar.amountUsdc,
        agent_note: ar.agentNote ?? null,
        status: ar.status,
        requested_at: ar.requestedAt ? ar.requestedAt.toISOString() : new Date().toISOString(),
        expires_at: ar.expiresAt ? ar.expiresAt.toISOString() : new Date().toISOString(),
        decided_at: ar.decidedAt ? ar.decidedAt.toISOString() : null,
        decision_note: ar.decisionNote ?? null,
        api_key_label: ar.apiKeyId?.label ?? null,
      }));
    },
    [CACHE_TAGS.APPROVALS],
    { tags: [CACHE_TAGS.APPROVALS] }
  )(dashboardId, status, limit);
