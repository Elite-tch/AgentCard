import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import connectToDatabase from './db';
import { ApiKey } from './models/ApiKey';

const KEY_PREFIX_LENGTH = 10; // 'AgentCard_'
const KEY_MIN_LENGTH = KEY_PREFIX_LENGTH + 12; 
const KEY_MAX_LENGTH = 128;
const MAX_AUTH_CANDIDATES = 20;

export async function authenticateApiKey(req: NextRequest) {
  const rawKey = req.headers.get('x-api-key');
  if (!rawKey) return { error: 'missing_api_key', status: 401, message: 'Missing X-Api-Key header' };
  
  const key = rawKey.trim();

  if (!key.startsWith('AgentCard_')) {
    return { error: 'invalid_api_key', status: 401, message: 'Invalid API key prefix' };
  }

  if (key.length < KEY_MIN_LENGTH || key.length > KEY_MAX_LENGTH) {
    return { error: 'invalid_api_key', status: 401, message: 'Invalid API key length' };
  }

  const keyPrefix = key.slice(KEY_PREFIX_LENGTH, KEY_PREFIX_LENGTH + 12);

  await connectToDatabase();

  const candidates = await ApiKey.find({
    enabled: true,
    $or: [{ keyPrefix: keyPrefix }, { keyPrefix: { $exists: false } }, { keyPrefix: null }]
  }).limit(MAX_AUTH_CANDIDATES);

  for (const candidate of candidates) {
    let matched = false;
    try {
      matched = await bcrypt.compare(key, candidate.keyHash);
    } catch (err: any) {
      console.warn(`[auth] bcrypt.compare threw on api_key_id=${candidate._id}: ${err.message}`);
      continue;
    }
    if (!matched) continue;

    if (candidate.expiresAt) {
      const expiresAtMs = new Date(candidate.expiresAt).getTime();
      if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
        return { error: 'api_key_expired', status: 401, message: 'This API key has expired.' };
      }
    }

    if (candidate.suspended) {
      return { error: 'api_key_suspended', status: 401, message: 'This API key has been suspended by the operator.' };
    }

    try {
      candidate.lastUsedAt = new Date();
      await candidate.save();
    } catch (err: any) {
      console.warn(`[auth] lastUsedAt update failed for api_key_id=${candidate._id}: ${err.message}`);
    }

    return { ok: true, apiKey: candidate };
  }

  return { error: 'invalid_api_key', status: 401, message: 'Invalid API key' };
}
