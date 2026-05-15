import connectToDatabase from '../db';
import { Order } from '../models/Order';
import { WebhookQueue } from '../models/WebhookQueue';
import { ApiKey } from '../models/ApiKey';
import { enqueueWebhook, refundOrQuarantine } from '../fulfillment';
import { bizEvent } from '../logger';

function log(msg: string) {
  console.log(`[reconciler] ${msg}`);
}

const MAX_WEBHOOK_ATTEMPTS = 4;
const WEBHOOK_RETRY_DELAYS_MS: Record<number, number> = {
  1: 5 * 60 * 1000,
  2: 30 * 60 * 1000,
  3: 60 * 60 * 1000,
};

export async function expireStaleOrders() {
  await connectToDatabase();
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  
  const staleOrders = await Order.find({
    status: 'pending_payment',
    createdAt: { $lt: cutoff }
  });

  if (staleOrders.length === 0) return;

  log(`Expiring ${staleOrders.length} stale order(s)`);

  for (const order of staleOrders) {
    order.status = 'expired';
    order.updatedAt = new Date();
    await order.save();

    const key: any = await ApiKey.findById(order.apiKeyId);
    const webhookUrl = order.webhookUrl || key?.defaultWebhookUrl;

    if (webhookUrl) {
      await enqueueWebhook(
        webhookUrl,
        {
          order_id: String(order._id),
          status: 'expired',
          phase: 'expired',
          note: 'Payment window expired. No funds were taken.',
        },
        key?.webhookSecret || null
      ).catch(() => {});
    }
  }
}

export async function retryWebhooks() {
  await connectToDatabase();
  const now = new Date();

  const queued = await WebhookQueue.find({
    delivered: false,
    attempts: { $lte: MAX_WEBHOOK_ATTEMPTS },
    nextAttempt: { $lte: now }
  });

  if (queued.length === 0) return;
  log(`Retrying ${queued.length} webhook(s)`);

  for (const row of queued) {
    try {
      // NOTE: Stub for actual webhook firing logic
      console.log(`[stub] firing webhook to ${row.url}`);
      row.delivered = true;
      await row.save();
      log(`  webhook ${row._id} delivered`);
    } catch (err: any) {
      const nextAttempts = row.attempts + 1;
      const delayMs = WEBHOOK_RETRY_DELAYS_MS[row.attempts] ?? null;

      if (delayMs === null || nextAttempts > MAX_WEBHOOK_ATTEMPTS) {
        row.attempts = nextAttempts;
        row.lastError = err.message;
        row.nextAttempt = now;
        await row.save();
        log(`  webhook ${row._id} failed permanently: ${err.message}`);
        bizEvent('webhook.failed_permanently', { id: row._id, url: row.url, attempts: nextAttempts, last_error: err.message });
      } else {
        row.attempts = nextAttempts;
        row.lastError = err.message;
        row.nextAttempt = new Date(Date.now() + delayMs);
        await row.save();
        log(`  webhook ${row._id} retry scheduled`);
      }
    }
  }
}

export async function recoverStuckOrders() {
  await connectToDatabase();
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  
  const stuck = await Order.find({
    status: { $in: ['pending_payment', 'ordering'] },
    vccJobId: { $exists: true, $ne: null },
    updatedAt: { $lt: cutoff }
  });

  if (stuck.length === 0) return;
  log(`Polling VCC for ${stuck.length} possibly-stuck order(s)`);

  for (const order of stuck) {
    try {
      // NOTE: Stub for VCC status check
      console.log(`[stub] Checking VCC status for order ${order._id}`);
    } catch (err: any) {
      log(`  VCC poll failed for ${order._id}: ${err.message}`);
    }
  }
}
