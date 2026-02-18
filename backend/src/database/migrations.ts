import Database from 'better-sqlite3';
import { logger } from '../utils/logger';
import { initSchema } from './schema';

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

const isMigrationExecuted = (db: Database.Database, version: string): boolean => {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM migrations WHERE version = ?');
  const result = stmt.get(version) as { count: number };
  return result.count > 0;
};

const recordMigration = (db: Database.Database, version: string, name: string): void => {
  const stmt = db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)');
  stmt.run(version, name);
};

interface Migration {
  version: string;
  name: string;
  up: (db: Database.Database) => void;
  down?: (db: Database.Database) => void;
}

const hasColumn = (db: Database.Database, table: string, column: string): boolean => {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
};

const hasTable = (db: Database.Database, table: string): boolean => {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table) as { name: string } | undefined;
  return Boolean(row?.name);
};

const migrations: Migration[] = [
  {
    version: '001',
    name: 'initial_schema',
    up: (_db: Database.Database) => {
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

      db.exec(`
        ALTER TABLE accounts ADD COLUMN add_method TEXT DEFAULT 'phone'
        CHECK(add_method IN ('phone', 'session'))
      `);
      logger.info('✅ 添加 accounts.add_method 字段');
    },
    down: (_db: Database.Database) => {
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

      db.exec(`
        ALTER TABLE templates ADD COLUMN usage_count INTEGER DEFAULT 0
      `);
      logger.info('✅ 添加 templates.usage_count 字段');
    },
    down: (_db: Database.Database) => {
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

      db.exec(`
        ALTER TABLE tasks ADD COLUMN priority INTEGER DEFAULT 5
        CHECK(priority >= 1 AND priority <= 10)
      `);
      logger.info('✅ 添加 tasks.priority 字段');
    },
    down: (_db: Database.Database) => {
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

      db.exec(`
        ALTER TABLE accounts ADD COLUMN health_score INTEGER DEFAULT 100
        CHECK(health_score >= 0 AND health_score <= 100)
      `);
      logger.info('✅ 添加 accounts.health_score 字段');
    },
    down: (_db: Database.Database) => {
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
      logger.warn('SQLite 不支持 DROP COLUMN，回滚需要手动处理');
    },
  },
  {
    version: '010',
    name: 'add_account_pool_status',
    up: (db: Database.Database) => {
      if (!hasColumn(db, 'accounts', 'pool_status')) {
        db.exec(`
          ALTER TABLE accounts ADD COLUMN pool_status TEXT NOT NULL DEFAULT 'ok'
          CHECK(pool_status IN ('ok', 'error', 'banned', 'cooldown'))
        `);
        logger.info('✅ 添加 accounts.pool_status 字段');
      } else {
        logger.info('跳过 accounts.pool_status 字段（已存在）');
      }

      if (!hasColumn(db, 'accounts', 'pool_status_updated_at')) {
        db.exec(`
          ALTER TABLE accounts ADD COLUMN pool_status_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        `);
        logger.info('✅ 添加 accounts.pool_status_updated_at 字段');
      } else {
        logger.info('跳过 accounts.pool_status_updated_at 字段（已存在）');
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_accounts_pool_status
        ON accounts(pool_status)
      `);
    },
  },
  {
    version: '014',
    name: 'remove_discovery_and_task_drafts',
    up: (db: Database.Database) => {
      const indexes = [
        'idx_discovery_candidates_status',
        'idx_discovery_candidates_trace_id',
        'idx_discovery_candidates_telegram_id',
        'idx_discovery_candidates_quality_score',
        'idx_discovery_candidates_source_type',
        'idx_discovery_candidates_run_id',
        'idx_discovery_candidates_region_profile',
        'idx_discovery_candidates_index_bot_username',
        'idx_discovery_candidates_unique_source',
        'idx_discovery_runs_started_at',
        'idx_discovery_runs_status',
        'idx_index_sources_enabled',
        'idx_discovery_keywords_profile_enabled',
        'idx_task_drafts_status',
        'idx_task_drafts_run_id',
        'idx_task_drafts_source_type',
        'idx_task_drafts_created_at',
        'idx_task_drafts_candidate_status',
        'idx_task_drafts_candidate_active_unique',
      ];

      for (const index of indexes) {
        db.exec(`DROP INDEX IF EXISTS ${index}`);
      }

      db.exec('DROP TABLE IF EXISTS task_drafts');
      db.exec('DROP TABLE IF EXISTS discovery_candidates');
      db.exec('DROP TABLE IF EXISTS discovery_runs');
      db.exec('DROP TABLE IF EXISTS discovery_keywords');
      db.exec('DROP TABLE IF EXISTS index_sources');

      logger.info('✅ 已移除 discovery 与 task_drafts 表及索引');
    },
  },
  {
    version: '015',
    name: 'add_account_profile_batch_jobs',
    up: (db: Database.Database) => {
      if (!hasTable(db, 'account_profile_jobs')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS account_profile_jobs (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'pending'
              CHECK(status IN ('pending', 'running', 'completed', 'cancelled', 'failed')),
            first_name_template TEXT,
            last_name_template TEXT,
            bio_template TEXT,
            avatar_files TEXT NOT NULL DEFAULT '[]',
            throttle_preset TEXT NOT NULL DEFAULT 'conservative'
              CHECK(throttle_preset IN ('conservative', 'balanced', 'fast')),
            retry_limit INTEGER NOT NULL DEFAULT 1 CHECK(retry_limit >= 0 AND retry_limit <= 3),
            summary TEXT NOT NULL DEFAULT '{"total":0,"pending":0,"running":0,"success":0,"failed":0,"cancelled":0,"skipped":0}',
            started_at DATETIME,
            finished_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        logger.info('✅ 创建 account_profile_jobs 表');
      }

      if (!hasTable(db, 'account_profile_job_items')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS account_profile_job_items (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            item_index INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending'
              CHECK(status IN ('pending', 'running', 'success', 'failed', 'cancelled', 'skipped')),
            attempt INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 2,
            error_code TEXT,
            error_message TEXT,
            applied_first_name TEXT,
            applied_last_name TEXT,
            applied_bio TEXT,
            avatar_file TEXT,
            started_at DATETIME,
            finished_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (job_id) REFERENCES account_profile_jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
          )
        `);
        logger.info('✅ 创建 account_profile_job_items 表');
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_account_profile_jobs_status
        ON account_profile_jobs(status)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_account_profile_jobs_created_at
        ON account_profile_jobs(created_at)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_account_profile_job_items_job_id
        ON account_profile_job_items(job_id)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_account_profile_job_items_status
        ON account_profile_job_items(status)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_account_profile_job_items_job_account
        ON account_profile_job_items(job_id, account_id)
      `);
    },
  },
  {
    version: '016',
    name: 'add_targets_unique_index',
    up: (db: Database.Database) => {
      if (!hasTable(db, 'targets')) {
        return;
      }

      db.exec(`
        DELETE FROM targets
        WHERE rowid NOT IN (
          SELECT MAX(rowid)
          FROM targets
          GROUP BY type, telegram_id
        )
      `);

      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_targets_type_telegram_id_unique
        ON targets(type, telegram_id)
      `);
    },
    down: (db: Database.Database) => {
      db.exec('DROP INDEX IF EXISTS idx_targets_type_telegram_id_unique');
    },
  },
];

export const runMigrations = (db: Database.Database): void => {
  logger.info('开始执行数据库迁移...');

  initSchema(db);
  createMigrationsTable(db);

  for (const migration of migrations) {
    if (!isMigrationExecuted(db, migration.version)) {
      logger.info(`执行迁移: ${migration.version} - ${migration.name}`);

      try {
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

export const rollbackLastMigration = (db: Database.Database): void => {
  const stmt = db.prepare('SELECT version, name FROM migrations ORDER BY id DESC LIMIT 1');
  const lastMigration = stmt.get() as { version: string; name: string } | undefined;

  if (!lastMigration) {
    logger.warn('没有可回滚的迁移');
    return;
  }

  const migration = migrations.find((m) => m.version === lastMigration.version);

  if (!migration || !migration.down) {
    const message = `无法回滚迁移 ${lastMigration.version}: 未定义down方法`;
    logger.error(message);
    throw new Error(message);
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
