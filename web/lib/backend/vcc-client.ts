import crypto from 'crypto';
import { bizEvent } from './logger';
import { verifyCallback } from './hmac';
import { seal, open } from './secret-box';
import { SystemState } from './models/SystemState';
import { Order } from './models/Order';
import connectToDatabase from './db';

const VCC_API_BASE = process.env.VCC_API_BASE;

if (
  !process.env.AGENTCARD_SECRET_BOX_KEY &&
  !process.env.VCC_TOKEN_KEY &&
  process.env.NODE_ENV !== 'test'
) {
  console.warn(
    '[vcc-client] WARNING: neither AGENTCARD_SECRET_BOX_KEY nor VCC_TOKEN_KEY is set — VCC API token will be stored in plaintext',
  );
}

const VCC_CIRCUIT_THRESHOLD = 3;
const VCC_CIRCUIT_COOLDOWN_MS = 30_000;
const VCC_CIRCUIT_WINDOW_MS = 60_000;

let _vccCircuit = { failures: 0, openedUntil: 0, lastFailureAt: 0 };

export function vccCircuitGuard() {
  if (Date.now() < _vccCircuit.openedUntil) {
    throw new Error('vcc circuit open — backing off after recent failures');
  }
}

export function recordVccFailure() {
  const now = Date.now();
  if (now - _vccCircuit.lastFailureAt > VCC_CIRCUIT_WINDOW_MS) {
    _vccCircuit.failures = 1;
  } else {
    _vccCircuit.failures++;
  }
  _vccCircuit.lastFailureAt = now;
  if (_vccCircuit.failures >= VCC_CIRCUIT_THRESHOLD) {
    _vccCircuit.openedUntil = now + VCC_CIRCUIT_COOLDOWN_MS;
    _vccCircuit.failures = 0;
    bizEvent('vcc.circuit_opened', { reopen_at: new Date(_vccCircuit.openedUntil).toISOString() });
  }
}

export function recordVccSuccess() {
  _vccCircuit.failures = 0;
  if (Date.now() >= _vccCircuit.openedUntil) {
    _vccCircuit.openedUntil = 0;
    _vccCircuit.lastFailureAt = 0;
  }
}

function parseHexKey(hex?: string): Buffer | null {
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, 'hex');
}

function getEncryptKey(): Buffer | null {
  return parseHexKey(process.env.AGENTCARD_SECRET_BOX_KEY) || parseHexKey(process.env.VCC_TOKEN_KEY);
}

function getDecryptKeys(): Buffer[] {
  const keys: Buffer[] = [];
  const canonical = parseHexKey(process.env.AGENTCARD_SECRET_BOX_KEY);
  const legacy = parseHexKey(process.env.VCC_TOKEN_KEY);
  if (canonical) keys.push(canonical);
  if (legacy && (!canonical || !legacy.equals(canonical))) keys.push(legacy);
  return keys;
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptKey();
  if (!key) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

export function decryptToken(stored: string): string {
  if (typeof stored !== 'string') {
    throw new Error(`vcc_token_decrypt_failed: non_string_stored type=${typeof stored}`);
  }
  if (!stored.startsWith('enc:')) return stored;
  const keys = getDecryptKeys();
  if (keys.length === 0) return stored;
  const parts = stored.split(':');
  if (parts.length !== 4) throw new Error('stored token has invalid enc: format');
  const [, ivHex, tagHex, ctHex] = parts as [string, string, string, string];
  let lastErr: any;
  for (const key of keys) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'), {
        authTagLength: 16,
      });
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return decipher.update(Buffer.from(ctHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`vcc_token_decrypt_failed: ${lastErr?.code || lastErr?.name || 'crypto'}`);
}

async function getVccToken(): Promise<string> {
  await connectToDatabase();
  const storedState = await SystemState.findOne({ key: 'vcc_token' });
  const stored = storedState?.value;
  
  if (stored) {
    try {
      return decryptToken(stored);
    } catch (err: any) {
      bizEvent('vcc.token_decrypt_failed', { error: err.message });
      await SystemState.deleteOne({ key: 'vcc_token' });
    }
  }

  vccCircuitGuard();
  const label = process.env.VCC_INSTANCE_LABEL || `AgentCard-${process.env.NODE_ENV || 'prod'}`;
  let res;
  try {
    res = await fetch(`${VCC_API_BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    recordVccFailure();
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status >= 500) recordVccFailure();
    throw new Error(`VCC registration failed: HTTP ${res.status} ${text}`.trim());
  }

  const body = await res.json();
  if (!body || typeof body.token !== 'string' || !body.token) {
    throw new Error('VCC registration response missing token field');
  }
  
  await SystemState.findOneAndUpdate(
    { key: 'vcc_token' },
    { value: encryptToken(body.token) },
    { upsert: true, new: true }
  );
  
  bizEvent('vcc.registered', { label });
  return body.token;
}

export async function getInvoice(orderId: string, amountUsdc: string, requestId: string | null = null, callbackNonce: string | null = null) {
  vccCircuitGuard();
  const token = await getVccToken();

  const callbackBase = process.env.AGENTCARD_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
  const callbackUrl = `${callbackBase}/vcc-callback`;

  await connectToDatabase();
  const existingOrder = await Order.findById(orderId);
  if (!existingOrder) throw new Error('Order not found');

  let callbackSecret;
  if (existingOrder.callbackSecret) {
    try {
      callbackSecret = open(existingOrder.callbackSecret);
    } catch (err: any) {
      console.warn(`[vcc-client] failed to open existing callback_secret for ${orderId}: ${err.message}`);
      callbackSecret = crypto.randomBytes(32).toString('hex');
      existingOrder.callbackSecret = seal(callbackSecret);
      await existingOrder.save();
    }
  } else {
    callbackSecret = crypto.randomBytes(32).toString('hex');
    existingOrder.callbackSecret = seal(callbackSecret);
    await existingOrder.save();
  }

  const nonce = callbackNonce || crypto.randomUUID();

  const headers: any = {
    'Content-Type': 'application/json',
    'X-VCC-Token': token,
  };
  if (requestId) headers['X-Request-ID'] = requestId;

  let res;
  try {
    res = await fetch(`${VCC_API_BASE}/api/jobs/invoice`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        order_id: orderId,
        amount_usdc: amountUsdc,
        callback_url: callbackUrl,
        callback_secret: callbackSecret,
        callback_nonce: nonce,
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    recordVccFailure();
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) {
      bizEvent('vcc.token_rotated', {
        reason: 'invoice_401',
        order_id: orderId,
        response_snippet: text.slice(0, 120),
      });
      await SystemState.deleteOne({ key: 'vcc_token' });
    }
    if (res.status >= 500 || res.status === 502 || res.status === 503 || res.status === 504) {
      recordVccFailure();
    }
    throw new Error(`VCC invoice failed: HTTP ${res.status} ${text}`.trim());
  }

  recordVccSuccess();
  const body = await res.json();

  if (!body || typeof body !== 'object') {
    throw new Error('VCC invoice response was not a JSON object');
  }
  if (typeof body.job_id !== 'string' || body.job_id.length === 0) {
    throw new Error('VCC invoice response missing job_id');
  }
  if (typeof body.payment_url !== 'string' || body.payment_url.length === 0) {
    throw new Error('VCC invoice response missing payment_url');
  }
  if (!/^(web\+)?stellar:/i.test(body.payment_url)) {
    throw new Error('VCC invoice response has invalid payment_url scheme');
  }

  bizEvent('vcc.invoice', { order_id: orderId, amount_usdc: amountUsdc, vcc_job_id: body.job_id });

  return { vccJobId: body.job_id, paymentUrl: body.payment_url, callbackNonce: nonce };
}

export async function notifyPaid(vccJobId: string) {
  vccCircuitGuard();
  const token = await getVccToken();

  let res;
  try {
    res = await fetch(`${VCC_API_BASE}/api/jobs/${vccJobId}/paid`, {
      method: 'POST',
      headers: { 'X-VCC-Token': token },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    recordVccFailure();
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) {
      bizEvent('vcc.token_rotated', {
        reason: 'notify_paid_401',
        vcc_job_id: vccJobId,
        response_snippet: text.slice(0, 120),
      });
      await SystemState.deleteOne({ key: 'vcc_token' });
    }
    if (res.status >= 500) recordVccFailure();
    throw new Error(`VCC notifyPaid failed: HTTP ${res.status} ${text}`.trim());
  }
  recordVccSuccess();
}

export async function getVccJobStatus(vccJobId: string) {
  vccCircuitGuard();
  const token = await getVccToken();

  let res;
  try {
    res = await fetch(`${VCC_API_BASE}/api/jobs/${vccJobId}`, {
      headers: { 'X-VCC-Token': token },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    recordVccFailure();
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) {
      bizEvent('vcc.token_rotated', {
        reason: 'job_status_401',
        vcc_job_id: vccJobId,
        response_snippet: text.slice(0, 120),
      });
      await SystemState.deleteOne({ key: 'vcc_token' });
    }
    if (res.status >= 500) recordVccFailure();
    throw new Error(`VCC job status failed: HTTP ${res.status} ${text}`.trim());
  }

  recordVccSuccess();
  return res.json();
}

export function verifyVccSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  orderId: string,
  nonce: string | null,
  secret: string | null = null,
  { requireV3 = false } = {},
) {
  return verifyCallback({
    secret: secret || process.env.VCC_CALLBACK_SECRET,
    signatureHeader: signature,
    timestamp,
    orderId,
    nonce: nonce || undefined,
    rawBody,
    requireV3,
  });
}
