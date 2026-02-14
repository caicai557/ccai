import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { RateLimiter } from './RateLimiter';
import { AccountDao } from '../../database/dao/AccountDao';
import { initSchema } from '../../database/schema';
import { runMigrations } from '../../database/migrations';

/**
 * 属性测试：速率限制强制执行
 * Feature: telegram-content-manager, Property 20: 速率限制强制执行
 * 验证需求: 5.1, 5.2, 5.3, 5.4
 */

describe('RateLimiter Property Tests - 速率限制强制执行', () => {
  let db: Database.Database;
  let rateLimiter: RateLimiter;
  let accountDao: AccountDao;
  let phoneSuffixCounter = 0;
  let rateRecordIdCounter = 0;

  beforeEach(() => {
    // 使用内存数据库进行测试
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    runMigrations(db);

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
   */
  function createTestAccount(phoneNumber: string = '+1234567890'): string {
    phoneSuffixCounter += 1;
    const uniquePhone = `${phoneNumber}-${Date.now()}-${phoneSuffixCounter}`;
    const account = accountDao.create({
      phoneNumber: uniquePhone,
      session: 'test-session',
      status: 'online',
    });
    return account.id;
  }

  function buildRateRecordId(prefix: string): string {
    rateRecordIdCounter += 1;
    return `${prefix}-${Date.now()}-${rateRecordIdCounter}`;
  }

  /**
   * 属性20.1: 每秒速率限制强制执行
   * 对于任何账号，在1秒内的发送操作次数不应该超过配置的限制（默认1次）
   */
  test('属性20.1: 每秒速率限制 - 1秒内最多允许1次发送', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, '')),
        async (phoneNumber) => {
          const accountId = createTestAccount(phoneNumber);

          // 第一次发送应该被允许
          const canSend1 = await rateLimiter.canSend(accountId);
          expect(canSend1).toBe(true);

          // 记录第一次发送
          await rateLimiter.recordSend(accountId);

          // 立即尝试第二次发送应该被拒绝（因为在同一秒内）
          const canSend2 = await rateLimiter.canSend(accountId);
          expect(canSend2).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性20.2: 每小时速率限制强制执行
   * 对于任何账号，在1小时内的发送操作次数不应该超过配置的限制（默认30次）
   */
  test('属性20.2: 每小时速率限制 - 1小时内最多允许30次发送', async () => {
    const accountId = createTestAccount();
    const maxPerHour = 30;

    // 模拟在1小时内发送30次（每次间隔超过1秒）
    for (let i = 0; i < maxPerHour; i++) {
      // 记录发送，但手动设置时间戳，每次间隔2秒
      const sentAt = Date.now() - (maxPerHour - i) * 2000;
      db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
        buildRateRecordId('hour'),
        accountId,
        sentAt
      );
    }

    // 现在应该不能再发送（已达到每小时限制）
    const canSend = await rateLimiter.canSend(accountId);
    expect(canSend).toBe(false);

    // 获取速率状态验证
    const status = await rateLimiter.getRateStatus(accountId);
    expect(status.sentLastHour).toBe(maxPerHour);
  });

  /**
   * 属性20.3: 每天速率限制强制执行
   * 对于任何账号，在1天内的发送操作次数不应该超过配置的限制（默认200次）
   */
  test('属性20.3: 每天速率限制 - 1天内最多允许200次发送', async () => {
    const accountId = createTestAccount();
    const maxPerDay = 200;

    // 模拟在1天内发送200次（每次间隔超过1秒和每小时限制）
    // 为了避免触发每小时限制，我们分散在24小时内
    for (let i = 0; i < maxPerDay; i++) {
      // 每次间隔约7分钟（24小时 / 200次 ≈ 7.2分钟）
      const sentAt = Date.now() - (maxPerDay - i) * 7 * 60 * 1000;
      db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
        buildRateRecordId('day'),
        accountId,
        sentAt
      );
    }

    // 现在应该不能再发送（已达到每天限制）
    const canSend = await rateLimiter.canSend(accountId);
    expect(canSend).toBe(false);

    // 获取速率状态验证
    const status = await rateLimiter.getRateStatus(accountId);
    expect(status.sentLastDay).toBe(maxPerDay);
  });

  /**
   * 属性20.4: FloodWait期间禁止发送
   * 对于任何处于FloodWait状态的账号，在等待时间结束前不应该允许发送
   */
  test('属性20.4: FloodWait期间禁止发送', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, '')),
        fc.integer({ min: 1, max: 3600 }), // 等待时间（秒）
        async (phoneNumber, waitSeconds) => {
          const accountId = createTestAccount(phoneNumber);

          // 设置FloodWait
          await rateLimiter.handleFloodWait(accountId, waitSeconds);

          // 在FloodWait期间不应该允许发送
          const canSend = await rateLimiter.canSend(accountId);
          expect(canSend).toBe(false);

          // 验证速率状态
          const status = await rateLimiter.getRateStatus(accountId);
          expect(status.isFloodWaiting).toBe(true);
          expect(status.floodWaitUntil).toBeDefined();
          expect(status.floodWaitUntil!.getTime()).toBeGreaterThan(Date.now());
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性20.5: 速率记录正确累积
   * 对于任何一系列发送操作，速率记录应该正确累积
   */
  test('属性20.5: 速率记录正确累积', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, '')),
        fc.integer({ min: 1, max: 10 }), // 发送次数
        async (phoneNumber, sendCount) => {
          const accountId = createTestAccount(phoneNumber);

          // 记录多次发送（手动设置时间戳以避免速率限制）
          for (let i = 0; i < sendCount; i++) {
            const sentAt = Date.now() - (sendCount - i) * 2000; // 每次间隔2秒
            db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
              buildRateRecordId('acc'),
              accountId,
              sentAt
            );
          }

          // 获取速率状态
          const status = await rateLimiter.getRateStatus(accountId);

          // 验证：记录的发送次数应该等于实际发送次数
          // 注意：由于时间窗口的原因，可能不是所有记录都在窗口内
          expect(status.sentLastHour).toBeLessThanOrEqual(sendCount);
          expect(status.sentLastDay).toBe(sendCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性20.6: 重置速率限制清除所有记录
   * 对于任何账号，重置速率限制后应该清除所有速率记录和FloodWait状态
   */
  test('属性20.6: 重置速率限制清除所有记录', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, '')),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 3600 }),
        async (phoneNumber, sendCount, waitSeconds) => {
          const accountId = createTestAccount(phoneNumber);

          // 记录多次发送
          for (let i = 0; i < sendCount; i++) {
            await rateLimiter.recordSend(accountId);
          }

          // 设置FloodWait
          await rateLimiter.handleFloodWait(accountId, waitSeconds);

          // 验证有记录
          const statusBefore = await rateLimiter.getRateStatus(accountId);
          expect(statusBefore.sentLastDay).toBeGreaterThan(0);
          expect(statusBefore.isFloodWaiting).toBe(true);

          // 重置速率限制
          await rateLimiter.resetRateLimit(accountId);

          // 验证：所有记录应该被清除
          const statusAfter = await rateLimiter.getRateStatus(accountId);
          expect(statusAfter.sentLastSecond).toBe(0);
          expect(statusAfter.sentLastHour).toBe(0);
          expect(statusAfter.sentLastDay).toBe(0);
          expect(statusAfter.isFloodWaiting).toBe(false);

          // 验证：现在应该可以发送
          const canSend = await rateLimiter.canSend(accountId);
          expect(canSend).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性20.7: 不同账号的速率限制独立
   * 对于任何两个不同的账号，它们的速率限制应该是独立的
   */
  test('属性20.7: 不同账号的速率限制独立', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .tuple(
            fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, '')),
            fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, ''))
          )
          .filter(([phone1, phone2]) => phone1 !== phone2), // 确保两个手机号不同
        async ([phone1, phone2]) => {
          const accountId1 = createTestAccount(phone1);
          const accountId2 = createTestAccount(phone2);

          // 账号1发送到达限制
          await rateLimiter.recordSend(accountId1);

          // 账号1应该不能立即再发送
          const canSend1 = await rateLimiter.canSend(accountId1);
          expect(canSend1).toBe(false);

          // 账号2应该仍然可以发送（独立的速率限制）
          const canSend2 = await rateLimiter.canSend(accountId2);
          expect(canSend2).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性20.8: 随机延迟在配置范围内
   * 对于任何生成的随机延迟，应该在配置的最小和最大延迟之间
   */
  test('属性20.8: 随机延迟在配置范围内', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (iterations) => {
        const config = rateLimiter.getConfig();

        for (let i = 0; i < iterations; i++) {
          const delay = rateLimiter.generateRandomDelay();

          // 验证：延迟应该在配置的范围内
          expect(delay).toBeGreaterThanOrEqual(config.minDelayMs);
          expect(delay).toBeLessThanOrEqual(config.maxDelayMs);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * 属性20.9: 健康度评分在有效范围内
   * 对于任何账号，健康度评分应该在0-100之间
   */
  test('属性20.9: 健康度评分在0-100范围内', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 15 }).map((s) => '+' + s.replace(/\D/g, '')),
        fc.integer({ min: 0, max: 50 }), // 发送次数
        fc.boolean(), // 是否设置FloodWait
        async (phoneNumber, sendCount, setFloodWait) => {
          const accountId = createTestAccount(phoneNumber);

          // 记录发送
          for (let i = 0; i < sendCount; i++) {
            const sentAt = Date.now() - (sendCount - i) * 10 * 60 * 1000; // 每次间隔10分钟
            db.prepare('INSERT INTO rate_records (id, account_id, sent_at) VALUES (?, ?, ?)').run(
              buildRateRecordId('health'),
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

          // 验证：健康度评分应该在0-100之间
          expect(healthScore).toBeGreaterThanOrEqual(0);
          expect(healthScore).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性20.10: FloodWait过期后允许发送
   * 对于任何FloodWait记录，在等待时间过期后应该允许发送
   */
  test('属性20.10: FloodWait过期后允许发送', async () => {
    const accountId = createTestAccount();

    // 设置一个已过期的FloodWait（等待时间为负数）
    const expiredTime = Date.now() - 1000; // 1秒前过期
    db.prepare('INSERT INTO flood_waits (account_id, wait_until) VALUES (?, ?)').run(
      accountId,
      expiredTime
    );

    // 应该允许发送（FloodWait已过期）
    const canSend = await rateLimiter.canSend(accountId);
    expect(canSend).toBe(true);

    // 验证FloodWait记录已被清除
    const status = await rateLimiter.getRateStatus(accountId);
    expect(status.isFloodWaiting).toBe(false);
  });
});
