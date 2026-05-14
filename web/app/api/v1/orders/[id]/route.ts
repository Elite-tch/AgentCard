import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/backend/db';
import { authenticateApiKey } from '@/lib/backend/apiKeyAuth';
import { Order } from '@/lib/backend/models/Order';
import { openCard } from '@/lib/backend/card-vault';

const PHASE: Record<string, string> = {
  awaiting_approval: 'awaiting_approval',
  pending_payment: 'awaiting_payment',
  expired: 'expired',
  rejected: 'rejected',
  ordering: 'processing',
  delivered: 'ready',
  failed: 'failed',
  refund_pending: 'failed',
  refunded: 'refunded',
  pending_manual_recovery: 'pending_recovery',
};

function buildOrderResponse(order: any) {
  const response: any = {
    order_id: order._id,
    status: order.status,
    phase: PHASE[order.status] ?? 'processing',
    amount_usdc: order.amountUsdc,
    payment_asset: order.paymentAsset,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  };

  if (order.status === 'awaiting_approval') {
    // Porting Approval request lookup is omitted for brevity.
    response.note = 'Awaiting owner approval. The account owner has been notified.';
  }

  if (order.status === 'pending_payment' && order.vccPaymentJson) {
    try {
      response.payment = JSON.parse(order.vccPaymentJson);
    } catch {
      // malformed JSON
    }
  }

  if (order.status === 'delivered') {
    const card = openCard(order);
    if (card) {
      // Normalize card brand logic
      if (card.brand?.includes('Visa')) card.brand = 'Visa';
      else if (card.brand?.includes('Mastercard')) card.brand = 'Mastercard';
    }
    response.card = card;
  }

  if (order.status === 'expired') {
    response.note = 'Payment window expired. No funds were taken.';
  }

  if (order.status === 'rejected') {
    response.error = order.error ?? 'rejected_by_owner';
    response.note = 'This transaction was rejected. No funds were taken.';
  }

  if (['failed', 'refund_pending', 'refunded', 'pending_manual_recovery'].includes(order.status)) {
    response.error = order.error;
    if (order.status === 'refunded') {
      response.note = 'USDC has been refunded to your wallet.';
      if (order.refundStellarTxid) {
        response.refund = { stellar_txid: order.refundStellarTxid };
      }
    }
  }

  return response;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok || !auth.apiKey) {
    return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });
  }

  const { id } = await params;

  await connectToDatabase();
  const order = await Order.findOne({ _id: id, apiKeyId: auth.apiKey._id });
  
  if (!order) {
    return NextResponse.json({ error: 'order_not_found', message: 'Order not found or belongs to another key.' }, { status: 404 });
  }

  return NextResponse.json(buildOrderResponse(order), { status: 200 });
}
