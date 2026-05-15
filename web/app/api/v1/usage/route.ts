import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/backend/db';
import { authenticateApiKey } from '@/lib/backend/apiKeyAuth';
import { buildBudget } from '@/lib/backend/utils';
import { Order } from '@/lib/backend/models/Order';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok || !auth.apiKey) {
    return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });
  }

  await connectToDatabase();
  const budget = await buildBudget(auth.apiKey);

  const stats = await Order.aggregate([
    { $match: { apiKeyId: auth.apiKey._id } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        refunded: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] } },
        in_progress: { 
          $sum: { 
            $cond: [
              { $in: ['$status', ['pending_payment', 'ordering', 'refund_pending', 'awaiting_approval']] }, 
              1, 
              0
            ] 
          } 
        }
      }
    }
  ]);

  const ordersStats = stats.length > 0 ? {
    total: stats[0].total,
    delivered: stats[0].delivered,
    failed: stats[0].failed,
    refunded: stats[0].refunded,
    in_progress: stats[0].in_progress,
  } : {
    total: 0,
    delivered: 0,
    failed: 0,
    refunded: 0,
    in_progress: 0,
  };

  return NextResponse.json({ budget, orders: ordersStats }, { status: 200 });
}
