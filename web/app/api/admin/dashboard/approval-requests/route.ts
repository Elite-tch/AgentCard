import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/backend/db';
import { ApprovalRequest } from '@/lib/backend/models/ApprovalRequest';
import { ApiKey } from '@/lib/backend/models/ApiKey';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session || !session.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dashboardId = session.user.id;
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'pending';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

  await connectToDatabase();

  const keys = await ApiKey.find({ dashboardId }).select('_id');
  const keyIds = keys.map(k => k._id);

  const approvals = await ApprovalRequest.find({
    apiKeyId: { $in: keyIds },
    status
  })
    .sort({ requestedAt: -1 })
    .limit(limit)
    .populate({ path: 'apiKeyId', select: 'label' });

  const mapped = approvals.map((ar: any) => ({
    id: ar._id,
    api_key_id: ar.apiKeyId?._id,
    order_id: ar.orderId,
    amount_usdc: ar.amountUsdc,
    agent_note: ar.agentNote,
    status: ar.status,
    requested_at: ar.requestedAt,
    expires_at: ar.expiresAt,
    decided_at: ar.decidedAt,
    decision_note: ar.decisionNote,
    api_key_label: ar.apiKeyId?.label
  }));

  return NextResponse.json(mapped, { status: 200 });
}
