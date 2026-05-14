import { Order } from '../models/Order';
import connectToDatabase from '../db';

export interface InsertPendingPaymentOrderOpts {
  id?: string;
  amount_usdc: string;
  expected_xlm_amount: string | null;
  api_key_id: string;
  webhook_url: string | null;
  metadata: string | null;
  vcc_payment_json: string;
  request_id: string | null;
  source?: 'v1_orders' | 'mpp';
}

export async function insertPendingPaymentOrder(opts: InsertPendingPaymentOrderOpts) {
  const source = opts.source ?? 'v1_orders';
  
  await connectToDatabase();
  await Order.create({
    _id: opts.id,
    status: 'pending_payment',
    amountUsdc: opts.amount_usdc,
    expectedXlmAmount: opts.expected_xlm_amount || undefined,
    apiKeyId: opts.api_key_id,
    webhookUrl: opts.webhook_url || undefined,
    metadata: opts.metadata || undefined,
    vccPaymentJson: opts.vcc_payment_json,
    requestId: opts.request_id || undefined,
    source,
    createdAt: new Date(),
    updatedAt: new Date()
  });
}
