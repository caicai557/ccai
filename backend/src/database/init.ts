import Database from 'better-sqlite3';
import { getDatabaseConfig } from '../config';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';

let dbInstance: Database.Database | null = null;

/**
 * 获取数据库实例（单例模式）
 */
export const getDatabase = (): Database.Database => {
  if (!dbInstance) {
    dbInstance = initDatabase();
  }
  return dbInstance;
};

/**
 * 初始化数据库
 */
export const initDatabase = (): Database.Database => {
  const config = getDatabaseConfig();
  const dbPath = path.resolve(config.path);

  // 确保数据库目录存在
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    logger.info(`创建数据库目录: ${dbDir}`);
  }

  // 创建数据库连接
  const db = new Database(dbPath, {
    verbose: process.env['NODE_ENV'] === 'development' ? logger.debug.bind(logger) : undefined,
  });

  // 启用外键约束
  db.pragma('foreign_keys = ON');

  // 设置WAL模式以提高并发性能
  db.pragma('journal_mode = WAL');

  logger.info(`✅ 数据库初始化成功: ${dbPath}`);

  return db;
};

/**
 * 关闭数据库连接
 */
export const closeDatabase = (db?: Database.Database): void => {
  const database = db || dbInstance;
  if (database) {
    database.close();
    if (database === dbInstance) {
      dbInstance = null;
    }
    logger.info('数据库连接已关闭');
  }
};
