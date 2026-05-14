import connectToDatabase from '../db';
import { Order } from '../models/Order';
import { UnmatchedPayment } from '../models/UnmatchedPayment';
import { refundOrQuarantine } from '../fulfillment';
import { bizEvent } from '../logger';
// import { getInvoice, notifyPaid } from '../vcc-client'; // Assume ported later
// import * as xlmSender from '../payments/xlm-sender'; // Assume ported later

function safeErrorMessage(err: unknown): string {
  if (err === null) return 'null';
  if (err === undefined) return 'undefined';
  if (typeof err === 'string') return err;
  try {
    if (err instanceof Error && typeof err.message === 'string') return err.message;
    return String(err);
  } catch {
    return '<unstringifiable error>';
  }
}

function toStroops(s: string | null | undefined): bigint {
  if (s === null || s === undefined || s === '') return 0n;
  const str = String(s).trim();
  const neg = str.startsWith('-');
  const abs = neg ? str.slice(1) : str;
  const [whole, frac = ''] = abs.split('.');
  const paddedFrac = (frac + '0000000').slice(0, 7);
  const value = BigInt(whole || '0') * 10_000_000n + BigInt(paddedFrac || '0');
  return neg ? -value : value;
}

function compareDecimal(a: string | null | undefined, b: string | null | undefined): number {
  const A = toStroops(a);
  const B = toStroops(b);
  if (A > B) return 1;
  if (A < B) return -1;
  return 0;
}

function stroopsToDecimal(stroops: bigint): string {
  const neg = stroops < 0n;
  const abs = neg ? -stroops : stroops;
  const whole = abs / 10_000_000n;
  const frac = String(abs % 10_000_000n).padStart(7, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

function parseStrictPositiveStroops(s: string | null | undefined): bigint | null {
  if (s === null || s === undefined) return null;
  if (typeof s !== 'string') return null;
  const str = s.trim();
  if (str.length === 0) return null;
  if (!/^\d+(\.\d+)?$/.test(str)) return null;
  try {
    const v = toStroops(str);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

export async function recordUnmatchedPayment(row: { txid: string, senderAddress: string | null, paymentAsset: string, amountUsdc: string | null, amountXlm: string | null, orderId: string | null, reason: string }) {
  try {
    await connectToDatabase();
    await UnmatchedPayment.create({
      stellarTxid: row.txid,
      senderAddress: row.senderAddress,
      paymentAsset: row.paymentAsset,
      amountUsdc: row.amountUsdc,
      amountXlm: row.amountXlm,
      claimedOrderId: row.orderId,
      reason: row.reason,
      createdAt: new Date()
    });
    bizEvent('payment.unmatched', { ...row });
  } catch (err: any) {
    console.error(`[payment] failed to record unmatched payment ${row.txid}: ${err.message}`);
  }
}

export async function handlePayment({ txid, paymentAsset, amountUsdc, amountXlm, senderAddress, orderId }: any) {
  await connectToDatabase();
  const order = await Order.findById(orderId);

  if (!order) {
    await recordUnmatchedPayment({ txid, senderAddress, paymentAsset, amountUsdc, amountXlm, orderId, reason: 'unknown_order' });
    return;
  }

  if (order.status !== 'pending_payment') {
    await recordUnmatchedPayment({ txid, senderAddress, paymentAsset, amountUsdc, amountXlm, orderId, reason: `order_status_${order.status}` });
    return;
  }

  let excessUsdc = null;
  let excessXlm = null;
  
  if (paymentAsset === 'usdc_soroban') {
    const expected = order.amountUsdc;
    const expectedStroops = parseStrictPositiveStroops(expected);
    if (expectedStroops === null) {
      bizEvent('payment.corrupt_order_amount', { order_id: orderId, column: 'amountUsdc', raw_value: String(expected) });
      await recordUnmatchedPayment({ txid, senderAddress, paymentAsset, amountUsdc, amountXlm, orderId, reason: 'corrupt_order' });
      return;
    }
    const cmp = compareDecimal(amountUsdc, expected);
    if (cmp < 0) {
      await recordUnmatchedPayment({ txid, senderAddress, paymentAsset, amountUsdc, amountXlm, orderId, reason: 'underpaid_usdc' });
      return;
    }
    if (cmp > 0) {
      const excess = toStroops(amountUsdc) - toStroops(expected);
      excessUsdc = stroopsToDecimal(excess);
      bizEvent('payment.usdc_overpaid', { order_id: orderId, expected_usdc: expected, paid_usdc: amountUsdc, excess_usdc: excessUsdc, txid });
    }
  } else if (paymentAsset === 'xlm_soroban') {
    const expected = order.expectedXlmAmount;
    if (!expected) {
      await recordUnmatchedPayment({ txid, senderAddress, paymentAsset, amountUsdc, amountXlm, orderId, reason: 'xlm_not_quoted' });
      return;
    }
    const cmp = compareDecimal(amountXlm, expected);
    if (cmp < 0) {
      await recordUnmatchedPayment({ txid, senderAddress, paymentAsset, amountUsdc, amountXlm, orderId, reason: 'underpaid_xlm' });
      return;
    }
    if (cmp > 0) {
      const excess = toStroops(amountXlm) - toStroops(expected);
      excessXlm = stroopsToDecimal(excess);
    }
  } else {
    await recordUnmatchedPayment({ txid, senderAddress, paymentAsset, amountUsdc, amountXlm, orderId, reason: 'unknown_asset' });
    return;
  }

  // Atomic state transition
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: 'pending_payment' },
    {
      $set: {
        status: 'ordering',
        paymentAsset,
        stellarTxid: txid,
        senderAddress,
        paymentXlmAmount: amountXlm,
        excessUsdc: excessUsdc ?? order.excessUsdc,
        updatedAt: new Date()
      }
    },
    { new: true }
  );

  if (!updated) {
    await recordUnmatchedPayment({ txid, senderAddress, paymentAsset, amountUsdc, amountXlm, orderId, reason: 'duplicate_payment' });
    return;
  }

  if (excessXlm) {
    bizEvent('payment.xlm_overpaid', { order_id: orderId, excess_xlm: excessXlm, txid });
  }

  try {
    // Porting VCC Integration is omitted for worker structure.
    console.log(`[stub] Processing VCC Job for order ${orderId}`);
    
    // updated.vccJobId = vccJobId;
    // await updated.save();

  } catch (err) {
    const rawMessage = safeErrorMessage(err);
    console.error(`[payment] order ${orderId} fulfillment error: ${rawMessage}`);
    updated.status = 'failed';
    updated.error = rawMessage;
    updated.updatedAt = new Date();
    await updated.save();

    await refundOrQuarantine(orderId, rawMessage).catch((e: any) =>
      console.error(`[payment] refund error for ${orderId}: ${safeErrorMessage(e)}`),
    );
  }
}
