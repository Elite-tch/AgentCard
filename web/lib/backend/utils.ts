import { Order } from './models/Order';
import connectToDatabase from './db';
import { IApiKey } from './models/ApiKey';

export function canonicalJson(value: any, depth = 0): string {
  if (depth > 32) {
    throw new Error('canonicalJson: nesting depth exceeds 32');
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v, depth + 1)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const parts = [];
  for (const k of keys) {
    const v = value[k];
    if (v === undefined) continue;
    parts.push(`${JSON.stringify(k)}:${canonicalJson(v, depth + 1)}`);
  }
  return `{${parts.join(',')}}`;
}

const IN_FLIGHT_STATUSES = ['pending_payment', 'ordering', 'refund_pending', 'awaiting_approval'];

export async function buildBudget(apiKey: IApiKey) {
  const settled = parseFloat(apiKey.totalSpentUsdc || '0');
  const limit = apiKey.spendLimitUsdc ? parseFloat(apiKey.spendLimitUsdc) : null;
  
  await connectToDatabase();
  
  const inFlightData = await Order.aggregate([
    { $match: { apiKeyId: apiKey._id, status: { $in: IN_FLIGHT_STATUSES } } },
    { $group: { _id: null, total: { $sum: { $toDouble: '$amountUsdc' } } } }
  ]);
  
  const inFlight = inFlightData.length > 0 ? inFlightData[0].total : 0;
  const committed = settled + inFlight;
  
  return {
    spent_usdc: settled.toFixed(2),
    in_flight_usdc: inFlight.toFixed(2),
    committed_usdc: committed.toFixed(2),
    limit_usdc: limit !== null ? limit.toFixed(2) : null,
    remaining_usdc: limit !== null ? Math.max(0, limit - committed).toFixed(2) : null,
  };
}
