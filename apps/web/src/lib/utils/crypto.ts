import crypto from 'crypto';

// --- Encryption for per-tenant gateway secrets (AGENTS.md §9) ---
// The PAYMENT_CRYPTO_KEY is a single PLATFORM-level key (allowed in env).
// Each hotel's merchant secret is encrypted with it and stored in
// PaymentProviderConfig.secretEnc. Decryption happens only server-side,
// per request.

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const key = process.env.PAYMENT_CRYPTO_KEY || '';
  if (!key) {
    throw new Error('PAYMENT_CRYPTO_KEY is not set. Set a 32-byte (hex) platform encryption key.');
  }
  const buffer = Buffer.from(key, 'hex');
  if (buffer.length !== 32) {
    throw new Error('PAYMENT_CRYPTO_KEY must be exactly 32 bytes encoded as 64 hex characters.');
  }
  return buffer;
}

export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(encoded: string): string {
  const [ivHex, tagHex, dataHex] = encoded.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted secret format.');
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
