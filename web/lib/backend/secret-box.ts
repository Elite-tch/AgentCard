import crypto from 'crypto';

const KEY_HEX_RE = /^[0-9a-fA-F]{64}$/;
const SEALED_BLOB_RE = /^enc:[0-9a-f]+:[0-9a-f]+:[0-9a-f]*$/i;

const IV_HEX_LEN = 24; // 12 bytes
const TAG_HEX_LEN = 32; // 16 bytes

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function loadKeyFromEnv(): Buffer | null {
  const preferred = process.env.AGENTCARD_SECRET_BOX_KEY;
  const legacy = process.env.VCC_TOKEN_KEY;
  for (const [name, val] of [
    ['AGENTCARD_SECRET_BOX_KEY', preferred],
    ['VCC_TOKEN_KEY', legacy],
  ]) {
    if (val && !KEY_HEX_RE.test(val)) {
      throw new Error(
        `secret-box: ${name} must be 64 hex characters (32 bytes). ` +
          `Generate one with \`openssl rand -hex 32\`.`,
      );
    }
  }
  if (preferred && legacy && preferred !== legacy) {
    console.warn(
      '[secret-box] both AGENTCARD_SECRET_BOX_KEY and VCC_TOKEN_KEY are set ' +
        'to different values — using AGENTCARD_SECRET_BOX_KEY. Unset the ' +
        'legacy VCC_TOKEN_KEY to remove this warning.',
    );
  }
  const hex = preferred || legacy;
  if (!hex) return null;
  return Buffer.from(hex, 'hex');
}

function getKey(): Buffer | null {
  return loadKeyFromEnv();
}

let warnedAboutMissingKey = false;

export function seal(plaintext: string): string {
  if (typeof plaintext !== 'string') throw new Error('seal: plaintext must be a string');
  if (SEALED_BLOB_RE.test(plaintext)) return plaintext; // already sealed
  const key = getKey();
  if (!key) {
    if (isProduction()) {
      throw new Error(
        'secret-box: AGENTCARD_SECRET_BOX_KEY is required in production. ' +
          'Generate one with `openssl rand -hex 32` and set it in the environment ' +
          'before restarting the backend.',
      );
    }
    if (!warnedAboutMissingKey) {
      console.warn(
        '[secret-box] AGENTCARD_SECRET_BOX_KEY not set — sealing as plaintext (dev/test only)',
      );
      warnedAboutMissingKey = true;
    }
    return plaintext;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

export function open(stored: string): string {
  if (typeof stored !== 'string') throw new Error('open: stored must be a string');
  if (!stored.startsWith('enc:')) return stored;
  const key = getKey();
  if (!key) {
    throw new Error(
      'secret-box: AGENTCARD_SECRET_BOX_KEY not set, cannot decrypt. Generate one with `openssl rand -hex 32` and set it in the environment.',
    );
  }
  const parts = stored.split(':');
  if (parts.length !== 4) {
    throw new Error(
      `secret-box: malformed sealed blob (expected 4 colon-separated parts, got ${parts.length})`,
    );
  }
  const [, ivHex, tagHex, ctHex] = parts as [string, string, string, string];
  if (!/^[0-9a-f]+$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(tagHex) || !/^[0-9a-f]*$/i.test(ctHex)) {
    throw new Error('secret-box: malformed sealed blob (non-hex characters in iv/tag/ciphertext)');
  }
  if (ivHex.length !== IV_HEX_LEN) {
    throw new Error(
      `secret-box: malformed sealed blob (IV is ${ivHex.length / 2} bytes, expected 12)`,
    );
  }
  if (tagHex.length !== TAG_HEX_LEN) {
    throw new Error(
      `secret-box: malformed sealed blob (auth tag is ${tagHex.length / 2} bytes, expected 16)`,
    );
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'), {
    authTagLength: 16,
  });
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(ctHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
}

export function hasKey(): boolean {
  return getKey() !== null;
}
