const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../config/logger');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey() {
  if (process.env.ENCRYPTION_KEY) {
    return crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
  }
  if (env.nodeEnv === 'production') {
    throw new Error('ENCRYPTION_KEY is required in production. Do not fall back to JWT secret.');
  }
  logger.warn('ENCRYPTION_KEY not set, falling back to JWT secret. This is insecure and only allowed in development.');
  return crypto.createHash('sha256').update(env.jwt.secret).digest();
}

function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText;

  try {
    const key = getEncryptionKey();
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText;

    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // If decryption fails, return as-is (unencrypted legacy value)
    return encryptedText;
  }
}

module.exports = { encrypt, decrypt };
