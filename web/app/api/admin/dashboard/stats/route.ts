import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/backend/db';
import { Order } from '@/lib/backend/models/Order';
import { ApiKey } from '@/lib/backend/models/ApiKey';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session || !session.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dashboardId = session.user.id;
  await connectToDatabase();

  const keys = await ApiKey.find({ dashboardId: dashboardId }).select('_id enabled');
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
        refund_pending: { $sum: { $cond: [{ $eq: ['$status', 'refund_pending'] }, 1, 0] } },
      }
    }
  ]);

  if (stats.length === 0) {
    return NextResponse.json({
      total_orders: 0,
      total_gmv: 0,
      delivered: 0,
      failed: 0,
      refunded: 0,
      pending: 0,
      refund_pending: 0,
      active_keys: activeKeys,
    }, { status: 200 });
  }

  return NextResponse.json({
    total_orders: stats[0].total_orders,
    total_gmv: stats[0].total_gmv,
    delivered: stats[0].delivered,
    failed: stats[0].failed,
    refunded: stats[0].refunded,
    pending: stats[0].pending,
    refund_pending: stats[0].refund_pending,
    active_keys: activeKeys,
  }, { status: 200 });
}
