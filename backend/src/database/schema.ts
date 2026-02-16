import Database from 'better-sqlite3';
import { logger } from '../utils/logger';

/**
 * 创建所有数据库表
 */
export const createTables = (db: Database.Database): void => {
  logger.info('开始创建数据库表...');

  // 账号表
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      phone_number TEXT UNIQUE NOT NULL,
      session TEXT NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      add_method TEXT NOT NULL DEFAULT 'phone'
        CHECK(add_method IN ('phone', 'session')),
      status TEXT NOT NULL DEFAULT 'offline',
      health_score INTEGER NOT NULL DEFAULT 100
        CHECK(health_score >= 0 AND health_score <= 100),
      last_active DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('✅ 创建表: accounts');

  // 目标表（群组/频道）
  db.exec(`
    CREATE TABLE IF NOT EXISTS targets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('group', 'channel')),
      telegram_id TEXT NOT NULL,
      invite_link TEXT,
      title TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('✅ 创建表: targets');

  // 模板表
  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL CHECK(category IN ('group_message', 'channel_comment')),
      content TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      weight INTEGER NOT NULL DEFAULT 1,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('✅ 创建表: templates');

  // 任务表
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('group_posting', 'channel_monitoring')),
      account_ids TEXT NOT NULL,
      target_ids TEXT NOT NULL,
      config TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'stopped' CHECK(status IN ('running', 'stopped')),
      priority INTEGER NOT NULL DEFAULT 5 CHECK(priority >= 1 AND priority <= 10),
      next_run_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('✅ 创建表: tasks');

  // 消息历史表
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_history (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('group_message', 'channel_comment')),
      content TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
      error TEXT,
      sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('✅ 创建表: message_history');

  // 速率限制表
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      unlock_at DATETIME NOT NULL,
      wait_seconds INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);
  logger.info('✅ 创建表: rate_limits');

  // FloodWait 记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS flood_waits (
      account_id TEXT PRIMARY KEY,
      wait_until DATETIME NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);
  logger.info('✅ 创建表: flood_waits');

  // 速率记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_records (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('✅ 创建表: rate_records');

  // 任务执行历史表
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_executions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      success INTEGER NOT NULL,
      message_content TEXT,
      error_message TEXT,
      target_message_id TEXT,
      account_id TEXT,
      target_id TEXT,
      retry_count INTEGER DEFAULT 0,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);
  logger.info('✅ 创建表: task_executions');

  // 日志表
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL CHECK(level IN ('INFO', 'WARN', 'ERROR', 'DEBUG')),
      message TEXT NOT NULL,
      account_id TEXT,
      task_id TEXT,
      details TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('✅ 创建表: logs');

  // 智能发现候选表
  db.exec(`
    CREATE TABLE IF NOT EXISTS discovery_candidates (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('group', 'channel')),
      title TEXT NOT NULL,
      username TEXT,
      invite_link TEXT,
      telegram_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      region_hint TEXT,
      description TEXT,
      recent_message_summary TEXT,
      rules_score REAL NOT NULL DEFAULT 0,
      ai_score REAL,
      final_score REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
      reason TEXT,
      reachability_status TEXT NOT NULL DEFAULT 'unknown' CHECK(reachability_status IN ('reachable', 'unreachable', 'unknown')),
      ai_provider TEXT,
      ai_model TEXT,
      ai_raw TEXT,
      trace_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('✅ 创建表: discovery_candidates');

  logger.info('✅ 所有数据库表创建完成');
};

/**
 * 创建索引
 */
export const createIndexes = (db: Database.Database): void => {
  logger.info('开始创建索引...');

  // message_history 索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_message_history_sent_at 
    ON message_history(sent_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_message_history_account_id 
    ON message_history(account_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_message_history_target_id 
    ON message_history(target_id)
  `);

  // rate_limits 索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_rate_limits_account_id 
    ON rate_limits(account_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_rate_limits_unlock_at 
    ON rate_limits(unlock_at)
  `);

  // task_executions 索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_executions_task_id 
    ON task_executions(task_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_executions_executed_at 
    ON task_executions(executed_at)
  `);

  // logs 索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_logs_created_at 
    ON logs(created_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_logs_level 
    ON logs(level)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_logs_account_id 
    ON logs(account_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_logs_task_id 
    ON logs(task_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_discovery_candidates_status
    ON discovery_candidates(status)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_discovery_candidates_trace_id
    ON discovery_candidates(trace_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_discovery_candidates_telegram_id
    ON discovery_candidates(telegram_id)
  `);

  logger.info('✅ 所有索引创建完成');
};

/**
 * 初始化数据库架构
 */
export const initSchema = (db: Database.Database): void => {
  createTables(db);
  createIndexes(db);
  logger.info('✅ 数据库架构初始化完成');
};
