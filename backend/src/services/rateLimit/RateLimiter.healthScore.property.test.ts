import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { RateLimiter } from './RateLimiter';
import { AccountDao } from '../../database/dao/AccountDao';

/**
 * 属性测试：健康度评分计算
 * Feature: telegram-content-manager, Property 24: 健康度评分计算
 * 验证需求: 5.9
 *
 * **Validates: Requirements 5.9**
 *
 * 属性定义：
 * 对于任何账号，健康度评分应该基于成功率和限制次数计算，
 * 范围在0-100之间，且失败率越高或限制次数越多，评分越低。
 */

describe('RateLimiter Property Tests - 健康度评分计算', () => {
  let db: Database.Database;
  let rateLimiter: RateLimiter;
  let accountDao: AccountDao;
  let accountCounter = 0; // 用于生成唯一账号
  let recordCounter = 0; // 用于生成唯一记录ID

  beforeEach(() => {
    // 使用内存数据库进行测试
    db = new Database(':memory:');
    accountCounter = 0; // 重置计数器
    recordCounter = 0; // 重置记录计数器

    // 创建表结构
    db.exec(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        phone_number TEXT UNIQUE NOT NULL,
        session TEXT,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        add_method TEXT,
        status TEXT NOT NULL CHECK(status IN ('online', 'offline', 'restricted')),
        pool_status TEXT NOT NULL DEFAULT 'ok'
          CHECK(pool_status IN ('ok', 'error', 'banned', 'cooldown')),
        pool_status_updated_at TEXT NOT NULL,
        health_score INTEGER DEFAULT 100,
        last_active TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE rate_records (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        sent_at INTEGER NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE flood_waits (
        account_id TEXT PRIMARY KEY,
        wait_until INTEGER NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_rate_records_account ON rate_records(account_id);
      CREATE INDEX idx_rate_records_time ON rate_records(sent_at);
    `);

    accountDao = new AccountDao(db);

    // 创建速率限制器，使用默认配置
    rateLimiter = new RateLimiter(db, {
      maxPerSecond: 1,
      maxPerHour: 30,
      maxPerDay: 200,
      minDelayMs: 1000,
      maxDelayMs: 3000,
    });
  });

  afterEach(() => {
    db.close();
  });

  /**
   * 辅助函数：创建测试账号
   * 注意：忽略传入的 phoneNumber 参数，始终生成唯一的电话号码
   * 这是为了避免属性测试中生成的随机电话号码可能重复的问题
   */
  function createTestAccount(_phoneNumber?: string): string {
    // 使用计数器确保每个账号都有唯一的电话号码
    accountCounter++;
    const phone = `+1${Date.now()}${accountCounter}${Math.random().toString(36).substring(7)}`;
    const account = accountDao.create({
      phoneNumber: phone,
      session: 'test-session',
      status: 'online',
    });
    return account.id;
  }

  /**
   * 辅助函数：生成唯一的记录ID
   */
  function generateRecordId(prefix: string = 'record'): string {
    recordCounter++;
    return `${prefix}-${Date.now()}-${recordCounter}`;
  }

  /**
   * 属性24.1: 健康度评分范围约束
   * 对于任何账号和任何操作历史，健康度评分必须在0-100之间
   */
  test('属性24.1: 健康度评分必须在0-100范围内', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, '')),
        fc.integer({ min: 0, max: 250 }), // 发送次数（可能超过每日限制）
        fc.boolean(), // 是否设置FloodWait
        async (phoneNumber, sendCount, setFloodWait) => {
          const accountId = createTestAccount(phoneNumber);

          // 记录发送操作（分散在24小时内）
          for (let i = 0; i < sendCount; i++) {
            const sentAt = Date.now() - (sendCount - i) * 5 * 60 * 1000; // 每次间隔5分钟
            db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
              generateRecordId(`test-${i}`),
              accountId,
              sentAt
            );
          }

          // 可能设置FloodWait
          if (setFloodWait) {
            await rateLimiter.handleFloodWait(accountId, 300);
          }

          // 计算健康度评分
          const healthScore = await rateLimiter.calculateHealthScore(accountId);

          // 验证：健康度评分必须在0-100之间
          expect(healthScore).toBeGreaterThanOrEqual(0);
          expect(healthScore).toBeLessThanOrEqual(100);
          expect(Number.isInteger(healthScore)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性24.2: 无操作记录时返回满分
   * 对于任何没有操作记录的账号，健康度评分应该为100
   */
  test('属性24.2: 无操作记录时健康度评分为100', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, '')),
        async (phoneNumber) => {
          const accountId = createTestAccount(phoneNumber);

          // 不记录任何操作
          // 计算健康度评分
          const healthScore = await rateLimiter.calculateHealthScore(accountId);

          // 验证：无操作记录时应该返回满分100
          expect(healthScore).toBe(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性24.3: FloodWait状态降低评分
   * 对于任何处于FloodWait状态的账号，健康度评分应该低于非FloodWait状态
   */
  test('属性24.3: FloodWait状态显著降低健康度评分', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, '')),
        fc.integer({ min: 1, max: 50 }), // 发送次数
        fc.integer({ min: 60, max: 3600 }), // FloodWait等待时间（秒）
        async (phoneNumber, sendCount, waitSeconds) => {
          const accountId = createTestAccount(phoneNumber);

          // 记录相同数量的发送操作
          for (let i = 0; i < sendCount; i++) {
            const sentAt = Date.now() - (sendCount - i) * 10 * 60 * 1000; // 每次间隔10分钟
            db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
              generateRecordId(`test-${i}`),
              accountId,
              sentAt
            );
          }

          // 计算没有FloodWait时的评分
          const scoreWithoutFloodWait = await rateLimiter.calculateHealthScore(accountId);

          // 设置FloodWait
          await rateLimiter.handleFloodWait(accountId, waitSeconds);

          // 计算有FloodWait时的评分
          const scoreWithFloodWait = await rateLimiter.calculateHealthScore(accountId);

          // 验证：FloodWait状态应该降低评分至少30分
          expect(scoreWithFloodWait).toBeLessThan(scoreWithoutFloodWait);
          expect(scoreWithoutFloodWait - scoreWithFloodWait).toBeGreaterThanOrEqual(30);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性24.4: 使用频率越高评分越低
   * 对于任何账号，当使用频率接近限制时，健康度评分应该降低
   */
  test('属性24.4: 高使用频率降低健康度评分', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, '')),
        fc.integer({ min: 1, max: 50 }), // 低使用频率
        fc.integer({ min: 180, max: 200 }), // 高使用频率（接近每日限制200）
        async (phoneNumber, lowCount, highCount) => {
          // 创建两个账号进行对比
          const accountId1 = createTestAccount(phoneNumber);
          const accountId2 = createTestAccount(phoneNumber + '1');

          // 账号1：低使用频率
          for (let i = 0; i < lowCount; i++) {
            const sentAt = Date.now() - (lowCount - i) * 10 * 60 * 1000;
            db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
              generateRecordId(`test1-${i}`),
              accountId1,
              sentAt
            );
          }

          // 账号2：高使用频率
          for (let i = 0; i < highCount; i++) {
            const sentAt = Date.now() - (highCount - i) * 7 * 60 * 1000;
            db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
              generateRecordId(`test2-${i}`),
              accountId2,
              sentAt
            );
          }

          // 计算两个账号的健康度评分
          const lowUsageScore = await rateLimiter.calculateHealthScore(accountId1);
          const highUsageScore = await rateLimiter.calculateHealthScore(accountId2);

          // 验证：高使用频率的账号评分应该更低
          expect(highUsageScore).toBeLessThan(lowUsageScore);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性24.5: 使用率超过90%时扣20分
   * 对于任何使用率超过90%的账号，健康度评分应该扣除20分
   */
  test('属性24.5: 使用率超过90%时扣除20分', async () => {
    const accountId = createTestAccount();
    const maxPerDay = 200;
    const highUsageCount = Math.floor(maxPerDay * 0.95); // 95%使用率

    // 记录高使用率的发送操作
    for (let i = 0; i < highUsageCount; i++) {
      const sentAt = Date.now() - (highUsageCount - i) * 7 * 60 * 1000;
      db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
        generateRecordId(`test-${i}`),
        accountId,
        sentAt
      );
    }

    // 计算健康度评分
    const healthScore = await rateLimiter.calculateHealthScore(accountId);

    // 验证：使用率超过90%时，评分应该是80分或更低（100 - 20）
    expect(healthScore).toBeLessThanOrEqual(80);
  });

  /**
   * 属性24.6: 使用率在70-90%之间时扣10分
   * 对于任何使用率在70-90%之间的账号，健康度评分应该扣除10分
   */
  test('属性24.6: 使用率在70-90%之间时扣除10分', async () => {
    const accountId = createTestAccount();
    const maxPerDay = 200;
    const mediumUsageCount = Math.floor(maxPerDay * 0.8); // 80%使用率

    // 记录中等使用率的发送操作
    for (let i = 0; i < mediumUsageCount; i++) {
      const sentAt = Date.now() - (mediumUsageCount - i) * 9 * 60 * 1000;
      db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
        generateRecordId(`test-${i}`),
        accountId,
        sentAt
      );
    }

    // 计算健康度评分
    const healthScore = await rateLimiter.calculateHealthScore(accountId);

    // 验证：使用率在70-90%之间时，评分应该是90分或更低（100 - 10）
    expect(healthScore).toBeLessThanOrEqual(90);
    expect(healthScore).toBeGreaterThan(80); // 但应该高于90%使用率的情况
  });

  /**
   * 属性24.7: FloodWait和高使用率叠加效果
   * 对于任何同时处于FloodWait状态且使用率高的账号，评分应该更低
   */
  test('属性24.7: FloodWait和高使用率叠加降低评分', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, '')),
        fc.integer({ min: 181, max: 200 }), // 高使用率（超过90%）
        async (phoneNumber, highCount) => {
          const accountId = createTestAccount(phoneNumber);

          // 记录高使用率的发送操作
          for (let i = 0; i < highCount; i++) {
            const sentAt = Date.now() - (highCount - i) * 7 * 60 * 1000;
            db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
              generateRecordId(`test-${i}`),
              accountId,
              sentAt
            );
          }

          // 设置FloodWait
          await rateLimiter.handleFloodWait(accountId, 300);

          // 计算健康度评分
          const healthScore = await rateLimiter.calculateHealthScore(accountId);

          // 验证：同时有FloodWait和高使用率时，评分应该很低
          // FloodWait扣30分 + 高使用率扣20分 = 最多扣50分
          // 但由于使用率可能刚好超过90%，所以评分可能在50-60之间
          expect(healthScore).toBeLessThanOrEqual(60);
          expect(healthScore).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性24.8: 更新账号健康度评分到数据库
   * 对于任何账号，updateAccountHealthScore应该计算并更新数据库中的健康度评分
   */
  test('属性24.8: 更新账号健康度评分到数据库', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, '')),
        fc.integer({ min: 0, max: 100 }), // 发送次数
        async (phoneNumber, sendCount) => {
          const accountId = createTestAccount(phoneNumber);

          // 记录发送操作
          for (let i = 0; i < sendCount; i++) {
            const sentAt = Date.now() - (sendCount - i) * 10 * 60 * 1000;
            db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
              generateRecordId(`test-${i}`),
              accountId,
              sentAt
            );
          }

          // 更新账号健康度评分
          const calculatedScore = await rateLimiter.updateAccountHealthScore(accountId);

          // 从数据库读取账号信息
          const account = accountDao.findById(accountId);

          // 验证：数据库中的健康度评分应该与计算的评分一致
          expect(account).toBeDefined();
          expect(account!.healthScore).toBe(calculatedScore);
          expect(account!.healthScore).toBeGreaterThanOrEqual(0);
          expect(account!.healthScore).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性24.9: 评分计算的确定性
   * 对于任何账号，在相同的操作历史下，多次计算应该得到相同的评分
   */
  test('属性24.9: 健康度评分计算具有确定性', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, '')),
        fc.integer({ min: 0, max: 100 }),
        fc.boolean(),
        async (phoneNumber, sendCount, setFloodWait) => {
          const accountId = createTestAccount(phoneNumber);

          // 记录发送操作
          for (let i = 0; i < sendCount; i++) {
            const sentAt = Date.now() - (sendCount - i) * 10 * 60 * 1000;
            db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
              generateRecordId(`test-${i}`),
              accountId,
              sentAt
            );
          }

          // 可能设置FloodWait
          if (setFloodWait) {
            await rateLimiter.handleFloodWait(accountId, 300);
          }

          // 多次计算健康度评分
          const score1 = await rateLimiter.calculateHealthScore(accountId);
          const score2 = await rateLimiter.calculateHealthScore(accountId);
          const score3 = await rateLimiter.calculateHealthScore(accountId);

          // 验证：多次计算应该得到相同的结果
          expect(score1).toBe(score2);
          expect(score2).toBe(score3);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性24.10: 旧记录不影响评分
   * 对于任何账号，超过24小时的操作记录不应该影响健康度评分
   */
  test('属性24.10: 超过24小时的记录不影响健康度评分', async () => {
    const accountId = createTestAccount();

    // 记录一些超过24小时的旧操作
    const oldCount = 50;
    for (let i = 0; i < oldCount; i++) {
      const sentAt = Date.now() - (25 * 60 * 60 * 1000 + i * 60 * 1000); // 25小时前
      db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
        generateRecordId(`old-${i}`),
        accountId,
        sentAt
      );
    }

    // 计算健康度评分
    const healthScore = await rateLimiter.calculateHealthScore(accountId);

    // 验证：只有旧记录时，评分应该是100（因为最近24小时没有操作）
    expect(healthScore).toBe(100);
  });

  /**
   * 属性24.11: 评分单调性 - 增加操作不会提高评分
   * 对于任何账号，增加操作记录不应该提高健康度评分
   */
  test('属性24.11: 增加操作记录不会提高健康度评分', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, '')),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        async (phoneNumber, initialCount, additionalCount) => {
          const accountId = createTestAccount(phoneNumber);

          // 记录初始操作
          for (let i = 0; i < initialCount; i++) {
            const sentAt = Date.now() - (initialCount - i) * 10 * 60 * 1000;
            db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
              generateRecordId(`initial-${i}`),
              accountId,
              sentAt
            );
          }

          // 计算初始评分
          const initialScore = await rateLimiter.calculateHealthScore(accountId);

          // 记录额外操作
          for (let i = 0; i < additionalCount; i++) {
            const sentAt = Date.now() - i * 5 * 60 * 1000;
            db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
              generateRecordId(`additional-${i}`),
              accountId,
              sentAt
            );
          }

          // 计算新评分
          const newScore = await rateLimiter.calculateHealthScore(accountId);

          // 验证：增加操作后，评分不应该提高（应该保持不变或降低）
          expect(newScore).toBeLessThanOrEqual(initialScore);
        }
      ),
      { numRuns: 100 }
    );
  });
});
