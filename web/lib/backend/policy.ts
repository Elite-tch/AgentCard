import { bizEvent } from './logger';
import connectToDatabase from './db';
import { ApiKey } from './models/ApiKey';
import { Order } from './models/Order';
import { PolicyDecision } from './models/PolicyDecision';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function recordDecision(apiKeyId: string, orderId: string | null, amountUsdc: string | null, decision: string, rule: string, reason: string) {
  await connectToDatabase();
  await PolicyDecision.create({
    apiKeyId,
    orderId: orderId || undefined,
    amountUsdc: amountUsdc || undefined,
    decision,
    rule,
    reason,
  });
  return { decision, rule, reason };
}

export async function checkPolicy(apiKeyId: string, amountUsdc: string, opts: { persist?: boolean } = {}) {
  const persist = opts.persist !== false;
  const finalise = async (decision: string, rule: string, reason: string) =>
    persist
      ? await recordDecision(apiKeyId, null, amountUsdc, decision, rule, reason)
      : { decision, rule, reason };

  await connectToDatabase();
  const key = await ApiKey.findById(apiKeyId);
  if (!key) return finalise('blocked', 'key_not_found', 'API key not found');

  const amount = parseFloat(amountUsdc);
  if (!Number.isFinite(amount) || amount <= 0) {
    return finalise('blocked', 'invalid_amount', `Amount must be a positive finite number (got: ${amountUsdc}).`);
  }

  if (key.suspended) {
    return finalise('blocked', 'suspended', 'This agent is suspended by the account owner.');
  }

  if (key.policySingleTxLimitUsdc !== null && key.policySingleTxLimitUsdc !== undefined) {
    const cap = parseFloat(key.policySingleTxLimitUsdc);
    if (!Number.isFinite(cap) || cap < 0) {
      bizEvent('policy.corrupt', { api_key_id: apiKeyId, field: 'policy_single_tx_limit_usdc', stored: String(key.policySingleTxLimitUsdc) });
      return finalise('blocked', 'policy_corrupt_single_tx', 'Account policy (per-transaction limit) is misconfigured — contact support.');
    }
    if (amount > cap) {
      return finalise('blocked', 'single_tx_hard_cap', `Transaction $${amount.toFixed(2)} exceeds the per-transaction hard cap of $${cap.toFixed(2)}.`);
    }
  }

  if (key.policyAllowedHours) {
    try {
      const { start, end } = JSON.parse(key.policyAllowedHours);
      const parseHHMM = (label: string, value: string) => {
        if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
          throw new Error(`${label} must be HH:MM (got: ${JSON.stringify(value)})`);
        }
        const [h, m] = value.split(':').map((s) => parseInt(s, 10)) as [number, number];
        if (!Number.isInteger(h) || h < 0 || h > 23) throw new Error(`${label} hour out of range 0-23 (got: ${h})`);
        if (!Number.isInteger(m) || m < 0 || m > 59) throw new Error(`${label} minute out of range 0-59 (got: ${m})`);
        return h * 60 + m;
      };
      const startMins = parseHHMM('start', start);
      const endMins = parseHHMM('end', end);
      const now = new Date();
      const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
      const inWindow = startMins <= endMins ? nowMins >= startMins && nowMins < endMins : nowMins >= startMins || nowMins < endMins;
      if (!inWindow) {
        const nowStr = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`;
        return finalise('blocked', 'after_hours', `Transactions are only allowed ${start}–${end} UTC. Current time: ${nowStr}.`);
      }
    } catch (err: any) {
      bizEvent('policy.corrupt', { api_key_id: apiKeyId, field: 'policy_allowed_hours', error: err.message });
      return finalise('blocked', 'policy_corrupt_hours', 'Account policy (allowed hours) is misconfigured — contact support.');
    }
  }

  if (key.policyAllowedDays) {
    try {
      const allowed = JSON.parse(key.policyAllowedDays);
      if (!Array.isArray(allowed)) throw new Error('not an array');
      for (const entry of allowed) {
        if (!Number.isInteger(entry) || entry < 0 || entry > 6) {
          throw new Error(`entry must be an integer in [0,6], got: ${JSON.stringify(entry)}`);
        }
      }
      const today = new Date().getUTCDay();
      if (!allowed.includes(today)) {
        return finalise('blocked', 'blocked_day', `Transactions are not allowed on ${DAY_NAMES[today]}.`);
      }
    } catch (err: any) {
      bizEvent('policy.corrupt', { api_key_id: apiKeyId, field: 'policy_allowed_days', error: err.message });
      return finalise('blocked', 'policy_corrupt_days', 'Account policy (allowed days) is misconfigured — contact support.');
    }
  }

  if (key.policyDailyLimitUsdc !== null && key.policyDailyLimitUsdc !== undefined) {
    const dailyLimit = parseFloat(key.policyDailyLimitUsdc);
    if (!Number.isFinite(dailyLimit) || dailyLimit < 0) {
      bizEvent('policy.corrupt', { api_key_id: apiKeyId, field: 'policy_daily_limit_usdc', stored: String(key.policyDailyLimitUsdc) });
      return finalise('blocked', 'policy_corrupt_daily', 'Account policy (daily limit) is misconfigured — contact support.');
    }

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const aggData = await Order.aggregate([
      { $match: { apiKeyId: apiKeyId, status: { $nin: ['expired', 'rejected'] }, createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: { $toDouble: '$amountUsdc' } } } }
    ]);

    const spentToday = aggData.length > 0 ? aggData[0].total : 0;
    if (spentToday + amount > dailyLimit) {
      return finalise('blocked', 'daily_limit_exceeded', `Daily limit of $${dailyLimit.toFixed(2)} would be exceeded. Spent today: $${spentToday.toFixed(2)}, requested: $${amount.toFixed(2)}.`);
    }
  }

  if (key.policyRequireApprovalAboveUsdc !== null && key.policyRequireApprovalAboveUsdc !== undefined) {
    const threshold = parseFloat(key.policyRequireApprovalAboveUsdc);
    if (!Number.isFinite(threshold) || threshold < 0) {
      bizEvent('policy.corrupt', { api_key_id: apiKeyId, field: 'policy_require_approval_above_usdc', stored: String(key.policyRequireApprovalAboveUsdc) });
      return finalise('blocked', 'policy_corrupt_approval', 'Account policy (approval threshold) is misconfigured — contact support.');
    }
    if (amount > threshold) {
      return { decision: 'pending_approval', rule: 'approval_threshold', reason: `Transaction of $${amount.toFixed(2)} requires owner approval (threshold: $${threshold.toFixed(2)}).` };
    }
  }

  return finalise('approved', 'all_checks_passed', 'Transaction approved by policy.');
}
