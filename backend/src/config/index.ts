import config from 'config';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// 加载环境变量
dotenv.config();

/**
 * 服务器配置
 */
export interface ServerConfig {
  port: number;
  host: string;
}

/**
 * Telegram配置
 */
export interface TelegramConfig {
  apiId: string;
  apiHash: string;
}

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  path: string;
}

/**
 * 安全配置
 */
export interface SecurityConfig {
  encryptionKey: string;
}

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  messagesPerSecond: number;
  messagesPerDay: number;
}

/**
 * 应用配置
 */
export interface AppConfig {
  server: ServerConfig;
  telegram: TelegramConfig;
  database: DatabaseConfig;
  security: SecurityConfig;
  rateLimit: RateLimitConfig;
}

/**
 * 获取服务器配置
 */
export const getServerConfig = (): ServerConfig => {
  return {
    port: Number(process.env['PORT']) || config.get<number>('server.port'),
    host: process.env['HOST'] || config.get<string>('server.host'),
  };
};

/**
 * 获取Telegram配置
 */
export const getTelegramConfig = (): TelegramConfig => {
  const apiId = process.env['TELEGRAM_API_ID'] || config.get<string>('telegram.apiId');
  const apiHash = process.env['TELEGRAM_API_HASH'] || config.get<string>('telegram.apiHash');

  if (!apiId || !apiHash) {
    throw new Error('Telegram API配置缺失，请在.env文件中配置TELEGRAM_API_ID和TELEGRAM_API_HASH');
  }

  return { apiId, apiHash };
};

/**
 * 获取数据库配置
 */
export const getDatabaseConfig = (): DatabaseConfig => {
  const dbPath = process.env['DATABASE_PATH'] || config.get<string>('database.path');

  // 确保数据库目录存在
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return { path: dbPath };
};

/**
 * 获取安全配置
 */
export const getSecurityConfig = (): SecurityConfig => {
  const encryptionKey =
    process.env['ENCRYPTION_KEY'] || config.get<string>('security.encryptionKey');

  if (!encryptionKey) {
    throw new Error('加密密钥缺失，请在.env文件中配置ENCRYPTION_KEY');
  }

  return { encryptionKey };
};

/**
 * 获取速率限制配置
 */
export const getRateLimitConfig = (): RateLimitConfig => {
  return {
    messagesPerSecond: config.get<number>('rateLimit.messagesPerSecond'),
    messagesPerDay: config.get<number>('rateLimit.messagesPerDay'),
  };
};

/**
 * 获取完整应用配置
 */
export const getAppConfig = (): AppConfig => {
  return {
    server: getServerConfig(),
    telegram: getTelegramConfig(),
    database: getDatabaseConfig(),
    security: getSecurityConfig(),
    rateLimit: getRateLimitConfig(),
  };
};

/**
 * 验证配置
 */
export const validateConfig = (): void => {
  try {
    getAppConfig();
    console.log('✅ 配置验证通过');
  } catch (error) {
    console.error('❌ 配置验证失败:', error);
    throw error;
  }
};
