import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/backend/db';
import { ApprovalRequest } from '@/lib/backend/models/ApprovalRequest';
import { Order } from '@/lib/backend/models/Order';
import { ApiKey } from '@/lib/backend/models/ApiKey';
import { auth } from '@/lib/auth';
import { recordDecision } from '@/lib/backend/policy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string, action: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session || !session.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id, action } = await params;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }

  await connectToDatabase();

  const keys = await ApiKey.find({ dashboardId: session.user.id }).select('_id');
  const keyIds = keys.map(k => k._id);

  const approval = await ApprovalRequest.findOne({
    _id: id,
    apiKeyId: { $in: keyIds }
  });

  if (!approval) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (approval.status !== 'pending') {
    return NextResponse.json({ error: 'already_decided', current_status: approval.status }, { status: 409 });
  }

  if (new Date(approval.expiresAt) <= new Date()) {
    return NextResponse.json({ error: 'approval_expired' }, { status: 410 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // optional body for rejection note
  }
  const note = body.note ? String(body.note).slice(0, 100) : null;

  if (action === 'approve') {
    // Adversarial audit F2-approval: Re-check the spend limit to prevent race conditions.
    const key = await ApiKey.findById(approval.apiKeyId);
    if (key?.spendLimitUsdc) {
      const settled = parseFloat(key.totalSpentUsdc || '0');
      
      const inFlightStats = await Order.aggregate([
        { 
          $match: { 
            apiKeyId: key._id,
            _id: { $ne: approval.orderId },
            status: { $in: ['pending_payment', 'awaiting_payment', 'ordering', 'processing', 'awaiting_approval'] }
          }
        },
        { $group: { _id: null, total: { $sum: { $toDouble: '$amountUsdc' } } } }
      ]);
      const inFlight = inFlightStats[0]?.total || 0;
      
      const currentAmount = parseFloat(approval.amountUsdc);
      const ceiling = parseFloat(key.spendLimitUsdc);

      if (settled + inFlight + currentAmount > ceiling) {
        return NextResponse.json({
          error: 'spend_limit_exceeded',
          message: `Approval would exceed the key's spend limit of $${ceiling.toFixed(2)}`
        }, { status: 403 });
      }
    }

    // Process approval
    approval.status = 'approved';
    approval.decidedAt = new Date();
    approval.decisionNote = note || undefined;
    await approval.save();

    await Order.findByIdAndUpdate(approval.orderId, {
      status: 'awaiting_payment',
      updatedAt: new Date()
    });

    await recordDecision(String(approval.apiKeyId), String(approval.orderId), approval.amountUsdc, 'allowed', 'owner_approved', note || 'Approved by owner');

    return NextResponse.json({ ok: true, status: 'approved' }, { status: 200 });

  } else {
    // Process rejection
    approval.status = 'rejected';
    approval.decidedAt = new Date();
    approval.decisionNote = note || undefined;
    await approval.save();

    await Order.findByIdAndUpdate(approval.orderId, {
      status: 'rejected',
      error: note || 'Owner rejected the spending request',
      updatedAt: new Date()
    });

    await recordDecision(String(approval.apiKeyId), String(approval.orderId), approval.amountUsdc, 'blocked', 'owner_rejected', note || 'Rejected by owner');

    return NextResponse.json({ ok: true, status: 'rejected' }, { status: 200 });
  }
}
