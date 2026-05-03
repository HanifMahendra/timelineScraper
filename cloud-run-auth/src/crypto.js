import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const raw = process.env.SESSION_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('SESSION_ENCRYPTION_KEY belum di-set.');
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('SESSION_ENCRYPTION_KEY harus 32 byte base64.');
  }
  return key;
}

export function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

export function decryptJson(encryptedObj) {
  const key = getKey();
  const iv = Buffer.from(encryptedObj.iv, 'base64');
  const tag = Buffer.from(encryptedObj.tag, 'base64');
  const data = Buffer.from(encryptedObj.data, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}
