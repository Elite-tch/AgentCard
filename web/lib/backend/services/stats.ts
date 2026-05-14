// web/lib/backend/services/stats.ts
import { unstable_cache } from 'next/cache';
import connectToDatabase from '@/lib/backend/db';
import { Order } from '@/lib/backend/models/Order';
import { ApiKey } from '@/lib/backend/models/ApiKey';
import { ApprovalRequest } from '@/lib/backend/models/ApprovalRequest';
import { CACHE_TAGS } from '@/lib/backend/cache-tags';

export const getDashboardStats = (dashboardId: string) =>
  unstable_cache(
    async (dId: string) => {
      await connectToDatabase();
      const keys = await ApiKey.find({ dashboardId: dId }).select('_id enabled').lean();
      const keyIds = keys.map(k => k._id);
      const activeKeys = keys.filter(k => k.enabled).length;

      const stats = await Order.aggregate([
        { $match: { apiKeyId: { $in: keyIds } } },
        {
          $group: {
            _id: null,
            total_orders: { $sum: 1 },
            total_gmv: { $sum: { $toDouble: '$amountUsdc' } },
            delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            refunded: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending_payment'] }, 1, 0] } },
          },
        },
      ]);

      const pendingApprovals = await ApprovalRequest.countDocuments({
        apiKeyId: { $in: keyIds },
        status: 'pending',
      });

      const s = stats[0] || {
        total_orders: 0,
        total_gmv: 0,
        delivered: 0,
        failed: 0,
        refunded: 0,
        pending: 0,
      };

      return {
        total_orders: s.total_orders,
        total_gmv: s.total_gmv,
        delivered: s.delivered,
        failed: s.failed,
        refunded: s.refunded,
        pending: s.pending,
        active_keys: activeKeys,
        pending_approvals: pendingApprovals,
      };
    },
    [CACHE_TAGS.DASHBOARD_STATS],
    { tags: [CACHE_TAGS.DASHBOARD_STATS] }
  )(dashboardId);
