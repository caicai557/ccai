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

const hasTable = (db: Database.Database, table: string): boolean => {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table) as { name: string } | undefined;
  return Boolean(row?.name);
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
          owner_id TEXT,
          owner_name TEXT,
          owner_username TEXT,
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
  {
    version: '008',
    name: 'add_discovery_candidate_owner_fields',
    up: (db: Database.Database) => {
      if (!hasColumn(db, 'discovery_candidates', 'owner_id')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN owner_id TEXT
        `);
        logger.info('✅ 添加 discovery_candidates.owner_id 字段');
      } else {
        logger.info('跳过 discovery_candidates.owner_id 字段（已存在）');
      }

      if (!hasColumn(db, 'discovery_candidates', 'owner_name')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN owner_name TEXT
        `);
        logger.info('✅ 添加 discovery_candidates.owner_name 字段');
      } else {
        logger.info('跳过 discovery_candidates.owner_name 字段（已存在）');
      }

      if (!hasColumn(db, 'discovery_candidates', 'owner_username')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN owner_username TEXT
        `);
        logger.info('✅ 添加 discovery_candidates.owner_username 字段');
      } else {
        logger.info('跳过 discovery_candidates.owner_username 字段（已存在）');
      }
    },
  },
  {
    version: '009',
    name: 'add_discovery_index_bot_support',
    up: (db: Database.Database) => {
      if (!hasTable(db, 'discovery_runs')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS discovery_runs (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            region_profile TEXT NOT NULL DEFAULT 'manila',
            keywords TEXT NOT NULL,
            source_types TEXT NOT NULL,
            threshold REAL NOT NULL DEFAULT 0.6,
            dry_run INTEGER NOT NULL DEFAULT 0,
            include_owner INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
            summary TEXT,
            errors TEXT,
            started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            finished_at DATETIME
          )
        `);
        logger.info('✅ 创建 discovery_runs 表');
      }

      if (!hasTable(db, 'index_sources')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS index_sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            username TEXT NOT NULL UNIQUE,
            enabled INTEGER NOT NULL DEFAULT 1,
            parser_type TEXT NOT NULL DEFAULT 'generic' CHECK(parser_type IN ('generic')),
            throttle_ms INTEGER NOT NULL DEFAULT 1500,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        logger.info('✅ 创建 index_sources 表');
      }

      if (!hasTable(db, 'discovery_keywords')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS discovery_keywords (
            id TEXT PRIMARY KEY,
            profile TEXT NOT NULL,
            keyword TEXT NOT NULL,
            weight INTEGER NOT NULL DEFAULT 1,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(profile, keyword)
          )
        `);
        logger.info('✅ 创建 discovery_keywords 表');
      }

      if (!hasColumn(db, 'discovery_candidates', 'source_type')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN source_type TEXT NOT NULL DEFAULT 'telegram_dialog_search'
        `);
      }
      if (!hasColumn(db, 'discovery_candidates', 'run_id')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN run_id TEXT
        `);
      }
      if (!hasColumn(db, 'discovery_candidates', 'index_bot_username')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN index_bot_username TEXT
        `);
      }
      if (!hasColumn(db, 'discovery_candidates', 'region_profile')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN region_profile TEXT NOT NULL DEFAULT 'manila'
        `);
      }
      if (!hasColumn(db, 'discovery_candidates', 'quality_flags')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN quality_flags TEXT
        `);
      }
      if (!hasColumn(db, 'discovery_candidates', 'member_count')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN member_count INTEGER
        `);
      }
      if (!hasColumn(db, 'discovery_candidates', 'last_message_at')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN last_message_at DATETIME
        `);
      }
      if (!hasColumn(db, 'discovery_candidates', 'reviewed_by')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN reviewed_by TEXT
        `);
      }
      if (!hasColumn(db, 'discovery_candidates', 'reviewed_at')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN reviewed_at DATETIME
        `);
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_discovery_candidates_source_type
        ON discovery_candidates(source_type)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_discovery_candidates_run_id
        ON discovery_candidates(run_id)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_discovery_candidates_region_profile
        ON discovery_candidates(region_profile)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_discovery_candidates_index_bot_username
        ON discovery_candidates(index_bot_username)
      `);

      db.exec(`
        DELETE FROM discovery_candidates
        WHERE rowid NOT IN (
          SELECT MAX(rowid)
          FROM discovery_candidates
          GROUP BY telegram_id, source_type, region_profile
        )
      `);

      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_candidates_unique_source
        ON discovery_candidates(telegram_id, source_type, region_profile)
      `);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_discovery_runs_started_at
        ON discovery_runs(started_at)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_discovery_runs_status
        ON discovery_runs(status)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_index_sources_enabled
        ON index_sources(enabled)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_discovery_keywords_profile_enabled
        ON discovery_keywords(profile, enabled)
      `);

      const now = new Date().toISOString();
      const seedSources = [
        ['SOSO', '@soso', 1500],
        ['极搜JiSo', '@jiso', 1500],
        ['极搜极搜', '@jisou', 1500],
        ['神马索引机器人', '@smss', 1500],
        ['中文索引', '@TeleTop123Bot', 1500],
        ['TON 指数', '@TonCnBot', 1500],
        ['快搜', '@kuai', 1500],
        ['超级索引', '@CJSY', 1500],
      ] as const;

      const sourceStmt = db.prepare(`
        INSERT INTO index_sources (
          id, name, username, enabled, parser_type, throttle_ms, created_at, updated_at
        ) VALUES (?, ?, ?, 1, 'generic', ?, ?, ?)
        ON CONFLICT(username)
        DO UPDATE SET
          name = excluded.name,
          throttle_ms = excluded.throttle_ms,
          updated_at = excluded.updated_at
      `);

      for (const [name, username, throttleMs] of seedSources) {
        sourceStmt.run(
          `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          name,
          username,
          throttleMs,
          now,
          now
        );
      }

      const seedKeywords = [
        ['manila 华人', 10],
        ['makati 华社', 9],
        ['bgc 中文', 8],
        ['quezon 华人', 8],
      ] as const;

      const keywordStmt = db.prepare(`
        INSERT INTO discovery_keywords (
          id, profile, keyword, weight, enabled, created_at, updated_at
        ) VALUES (?, 'manila', ?, ?, 1, ?, ?)
        ON CONFLICT(profile, keyword)
        DO UPDATE SET
          weight = excluded.weight,
          enabled = 1,
          updated_at = excluded.updated_at
      `);

      for (const [keyword, weight] of seedKeywords) {
        keywordStmt.run(
          `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          keyword,
          weight,
          now,
          now
        );
      }

      logger.info('✅ 完成索引导航发现能力迁移');
    },
  },
  {
    version: '010',
    name: 'add_account_pool_and_discovery_quality',
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

      if (!hasColumn(db, 'discovery_candidates', 'source_weight')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN source_weight REAL NOT NULL DEFAULT 1
        `);
        logger.info('✅ 添加 discovery_candidates.source_weight 字段');
      } else {
        logger.info('跳过 discovery_candidates.source_weight 字段（已存在）');
      }

      if (!hasColumn(db, 'discovery_candidates', 'post_accept_success_rate')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN post_accept_success_rate REAL NOT NULL DEFAULT 0
        `);
        logger.info('✅ 添加 discovery_candidates.post_accept_success_rate 字段');
      } else {
        logger.info('跳过 discovery_candidates.post_accept_success_rate 字段（已存在）');
      }

      if (!hasColumn(db, 'discovery_candidates', 'quality_score')) {
        db.exec(`
          ALTER TABLE discovery_candidates ADD COLUMN quality_score REAL NOT NULL DEFAULT 0
        `);
        logger.info('✅ 添加 discovery_candidates.quality_score 字段');
      } else {
        logger.info('跳过 discovery_candidates.quality_score 字段（已存在）');
      }

      db.exec(`
        UPDATE discovery_candidates
        SET
          source_weight = COALESCE(source_weight, 1),
          post_accept_success_rate = COALESCE(post_accept_success_rate, 0),
          quality_score = CASE
            WHEN quality_score IS NULL OR quality_score = 0 THEN COALESCE(final_score, 0)
            ELSE quality_score
          END
      `);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_discovery_candidates_quality_score
        ON discovery_candidates(quality_score DESC)
      `);
    },
  },
  {
    version: '011',
    name: 'add_task_drafts',
    up: (db: Database.Database) => {
      if (!hasTable(db, 'task_drafts')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS task_drafts (
            id TEXT PRIMARY KEY,
            candidate_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            task_type TEXT NOT NULL CHECK(task_type IN ('group_posting', 'channel_monitoring')),
            account_ids TEXT NOT NULL,
            template_id TEXT,
            config TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 5 CHECK(priority >= 1 AND priority <= 10),
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'rejected')),
            confirmed_task_id TEXT,
            reason TEXT,
            run_id TEXT,
            source_type TEXT NOT NULL
              CHECK(source_type IN ('telegram_dialog_search', 'telegram_global_search', 'telegram_index_bot')),
            index_bot_username TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        logger.info('✅ 创建 task_drafts 表');
      } else {
        logger.info('跳过 task_drafts 表（已存在）');
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_task_drafts_status
        ON task_drafts(status)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_task_drafts_run_id
        ON task_drafts(run_id)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_task_drafts_source_type
        ON task_drafts(source_type)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_task_drafts_created_at
        ON task_drafts(created_at)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_task_drafts_candidate_status
        ON task_drafts(candidate_id, status)
      `);
    },
  },
  {
    version: '012',
    name: 'enforce_task_draft_active_unique',
    up: (db: Database.Database) => {
      if (!hasTable(db, 'task_drafts')) {
        logger.info('跳过 task_drafts 活跃唯一约束（表不存在）');
        return;
      }

      db.exec(`
        UPDATE task_drafts
        SET
          status = 'rejected',
          reason = CASE
            WHEN reason IS NULL OR TRIM(reason) = '' THEN '系统去重（迁移）'
            ELSE reason
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE rowid IN (
          SELECT current.rowid
          FROM task_drafts current
          WHERE current.status IN ('pending', 'confirmed')
            AND EXISTS (
              SELECT 1
              FROM task_drafts newer
              WHERE newer.candidate_id = current.candidate_id
                AND newer.status IN ('pending', 'confirmed')
                AND newer.rowid > current.rowid
            )
        )
      `);

      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_task_drafts_candidate_active_unique
        ON task_drafts(candidate_id)
        WHERE status IN ('pending', 'confirmed')
      `);
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
