import crypto from 'crypto';
import { getSecurityConfig } from '../config';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * 获取加密密钥
 */
const getKey = (): Buffer => {
  const config = getSecurityConfig();
  const key = crypto.createHash('sha256').update(config.encryptionKey).digest();
  return key;
};

/**
 * 加密文本
 */
export const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // 返回 iv:encrypted 格式
  return iv.toString('hex') + ':' + encrypted;
};

/**
 * 解密文本
 */
export const decrypt = (encryptedText: string): string => {
  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    throw new Error('无效的加密文本格式');
  }

  const ivHex = parts[0];
  const encryptedHex = parts[1];

  if (!ivHex || !encryptedHex) {
    throw new Error('加密文本格式不完整');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/**
 * 生成随机密钥
 */
export const generateKey = (): string => {
  return crypto.randomBytes(32).toString('hex');
};
