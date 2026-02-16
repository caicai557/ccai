import Database from 'better-sqlite3';
import { logger } from '../utils/logger';
import { initSchema } from './schema';

/**
 * 迁移版本记录表
 */
const createMigrationsTable = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

/**
 * 检查迁移是否已执行
 */
const isMigrationExecuted = (db: Database.Database, version: string): boolean => {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM migrations WHERE version = ?');
  const result = stmt.get(version) as { count: number };
  return result.count > 0;
};

/**
 * 记录迁移执行
 */
const recordMigration = (db: Database.Database, version: string, name: string): void => {
  const stmt = db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)');
  stmt.run(version, name);
};

/**
 * 迁移定义
 */
interface Migration {
  version: string;
  name: string;
  up: (db: Database.Database) => void;
  down?: (db: Database.Database) => void;
}

/**
 * 检查表字段是否存在
 */
const hasColumn = (db: Database.Database, table: string, column: string): boolean => {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
};

/**
 * 所有迁移
 */
const migrations: Migration[] = [
  {
    version: '001',
    name: 'initial_schema',
    up: (_db: Database.Database) => {
      // 初始架构已在schema.ts中创建
      logger.info('初始架构迁移（跳过，已在schema.ts中处理）');
    },
  },
  {
    version: '002',
    name: 'add_account_add_method',
    up: (db: Database.Database) => {
      if (hasColumn(db, 'accounts', 'add_method')) {
        logger.info('跳过 accounts.add_method 字段（已存在）');
        return;
      }

      // 添加 add_method 字段
      db.exec(`
        ALTER TABLE accounts ADD COLUMN add_method TEXT DEFAULT 'phone' 
        CHECK(add_method IN ('phone', 'session'))
      `);
      logger.info('✅ 添加 accounts.add_method 字段');
    },
    down: (_db: Database.Database) => {
      // SQLite 不支持 DROP COLUMN，需要重建表
      logger.warn('SQLite 不支持 DROP COLUMN，回滚需要手动处理');
    },
  },
  {
    version: '003',
    name: 'add_template_usage_count',
    up: (db: Database.Database) => {
      if (hasColumn(db, 'templates', 'usage_count')) {
        logger.info('跳过 templates.usage_count 字段（已存在）');
        return;
      }

      // 添加 usage_count 字段
      db.exec(`
        ALTER TABLE templates ADD COLUMN usage_count INTEGER DEFAULT 0
      `);
      logger.info('✅ 添加 templates.usage_count 字段');
    },
    down: (_db: Database.Database) => {
      // SQLite 不支持 DROP COLUMN，需要重建表
      logger.warn('SQLite 不支持 DROP COLUMN，回滚需要手动处理');
    },
  },
  {
    version: '004',
    name: 'add_task_priority',
    up: (db: Database.Database) => {
      if (hasColumn(db, 'tasks', 'priority')) {
        logger.info('跳过 tasks.priority 字段（已存在）');
        return;
      }

      // 添加 priority 字段，默认值为5（中等优先级）
      db.exec(`
        ALTER TABLE tasks ADD COLUMN priority INTEGER DEFAULT 5 
        CHECK(priority >= 1 AND priority <= 10)
      `);
      logger.info('✅ 添加 tasks.priority 字段');
    },
    down: (_db: Database.Database) => {
      // SQLite 不支持 DROP COLUMN，需要重建表
      logger.warn('SQLite 不支持 DROP COLUMN，回滚需要手动处理');
    },
  },
  {
    version: '005',
    name: 'add_account_health_score',
    up: (db: Database.Database) => {
      if (hasColumn(db, 'accounts', 'health_score')) {
        logger.info('跳过 accounts.health_score 字段（已存在）');
        return;
      }

      // 添加 health_score 字段，默认值为100（健康状态）
      db.exec(`
        ALTER TABLE accounts ADD COLUMN health_score INTEGER DEFAULT 100 
        CHECK(health_score >= 0 AND health_score <= 100)
      `);
      logger.info('✅ 添加 accounts.health_score 字段');
    },
    down: (_db: Database.Database) => {
      // SQLite 不支持 DROP COLUMN，需要重建表
      logger.warn('SQLite 不支持 DROP COLUMN，回滚需要手动处理');
    },
  },
  {
    version: '006',
    name: 'add_target_invite_link',
    up: (db: Database.Database) => {
      if (hasColumn(db, 'targets', 'invite_link')) {
        logger.info('跳过 targets.invite_link 字段（已存在）');
        return;
      }

      db.exec(`
        ALTER TABLE targets ADD COLUMN invite_link TEXT
      `);
      logger.info('✅ 添加 targets.invite_link 字段');
    },
    down: (_db: Database.Database) => {
      // SQLite 不支持 DROP COLUMN，需要重建表
      logger.warn('SQLite 不支持 DROP COLUMN，回滚需要手动处理');
    },
  },
  {
    version: '007',
    name: 'create_discovery_candidates',
    up: (db: Database.Database) => {
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

      logger.info('✅ 创建 discovery_candidates 表');
    },
  },
];

/**
 * 执行所有待执行的迁移
 */
export const runMigrations = (db: Database.Database): void => {
  logger.info('开始执行数据库迁移...');

  // 先确保基线表结构存在，兼容“仅调用runMigrations”的场景
  initSchema(db);

  // 创建迁移记录表
  createMigrationsTable(db);

  // 执行每个迁移
  for (const migration of migrations) {
    if (!isMigrationExecuted(db, migration.version)) {
      logger.info(`执行迁移: ${migration.version} - ${migration.name}`);

      try {
        // 在事务中执行迁移
        db.transaction(() => {
          migration.up(db);
          recordMigration(db, migration.version, migration.name);
        })();

        logger.info(`✅ 迁移完成: ${migration.version}`);
      } catch (error) {
        logger.error(`❌ 迁移失败: ${migration.version}`, error);
        throw error;
      }
    } else {
      logger.debug(`跳过已执行的迁移: ${migration.version}`);
    }
  }

  logger.info('✅ 所有数据库迁移执行完成');
};

/**
 * 回滚最后一个迁移
 */
export const rollbackLastMigration = (db: Database.Database): void => {
  const stmt = db.prepare('SELECT version, name FROM migrations ORDER BY id DESC LIMIT 1');
  const lastMigration = stmt.get() as { version: string; name: string } | undefined;

  if (!lastMigration) {
    logger.warn('没有可回滚的迁移');
    return;
  }

  const migration = migrations.find((m) => m.version === lastMigration.version);

  if (!migration || !migration.down) {
    logger.error(`无法回滚迁移 ${lastMigration.version}: 未定义down方法`);
    return;
  }

  logger.info(`回滚迁移: ${lastMigration.version} - ${lastMigration.name}`);

  try {
    db.transaction(() => {
      migration.down!(db);
      db.prepare('DELETE FROM migrations WHERE version = ?').run(lastMigration.version);
    })();

    logger.info(`✅ 迁移回滚完成: ${lastMigration.version}`);
  } catch (error) {
    logger.error(`❌ 迁移回滚失败: ${lastMigration.version}`, error);
    throw error;
  }
};
