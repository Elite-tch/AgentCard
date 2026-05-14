import crypto from 'crypto';

export function verifyCallback({
  secret,
  signatureHeader,
  timestamp,
  nonce,
  rawBody,
}: any) {
  // Simplified HMAC for migration.
  // In a real scenario, this would replicate the exact VCC v2/v3 HMAC signature validation.
  const payload = nonce ? `${timestamp}.${nonce}.${rawBody}` : `${timestamp}.${rawBody}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  if (expectedSignature !== signatureHeader) {
    return { valid: false, reason: 'signature_mismatch' };
  }
  return { valid: true };
}
