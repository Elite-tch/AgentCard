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
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const api_key_id = url.searchParams.get('api_key_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);

  await connectToDatabase();

  let keyIds: string[] = [];
  if (api_key_id) {
    const key = await ApiKey.findOne({ _id: api_key_id, dashboardId });
    if (!key) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    keyIds.push(api_key_id);
  } else {
    const keys = await ApiKey.find({ dashboardId }).select('_id');
    keyIds = keys.map(k => String(k._id));
  }

  const query: any = { apiKeyId: { $in: keyIds } };
  if (status) query.status = status;

  const orders = await Order.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate({ path: 'apiKeyId', select: 'label' });

  const mapped = orders.map((o: any) => ({
    id: o._id,
    status: o.status,
    amount_usdc: o.amountUsdc,
    payment_asset: o.paymentAsset,
    stellar_txid: o.stellarTxid,
    card_brand: o.cardBrand,
    error: o.error,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
    api_key_id: o.apiKeyId?._id,
    api_key_label: o.apiKeyId?.label
  }));

  return NextResponse.json(mapped, { status: 200 });
}
