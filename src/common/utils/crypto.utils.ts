import crypto from 'crypto';

const ALG = 'aes-256-cbc';
const IV_LEN = 16;
const KEY_LEN = 32;

function getKey(): Buffer {
  const secret = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production';
  return crypto.scryptSync(secret, 'salt', KEY_LEN);
}

export function encryptPassword(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

export function decryptPassword(encrypted: string): string {
  const key = getKey();
  const [ivHex, encHex] = encrypted.split(':');
  if (!ivHex || !encHex) throw new Error('Invalid encrypted format');
  const iv = Buffer.from(ivHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  return decipher.update(enc) + decipher.final('utf8');
}
