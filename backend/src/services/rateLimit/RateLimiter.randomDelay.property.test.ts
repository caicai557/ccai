import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { RateLimiter } from './RateLimiter';

/**
 * 属性测试：操作随机延迟范围
 * Feature: telegram-content-manager, Property 22: 操作随机延迟范围
 * 验证需求: 5.7
 *
 * 验证：对于任何发送操作，实际添加的随机延迟应该在配置的范围内（默认1-3秒）
 */

describe('RateLimiter Property Tests - 操作随机延迟范围', () => {
  let db: Database.Database;

  beforeEach(() => {
    // 使用内存数据库进行测试
    db = new Database(':memory:');

    // 创建表结构
    db.exec(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        phone_number TEXT UNIQUE NOT NULL,
        session TEXT,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        status TEXT NOT NULL CHECK(status IN ('online', 'offline', 'restricted')),
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
  });

  afterEach(() => {
    db.close();
  });

  /**
   * 属性22.1: 默认配置下的随机延迟范围
   * 使用默认配置（1000-3000ms），生成的随机延迟应该在此范围内
   */
  test('属性22.1: 默认配置下的随机延迟在1000-3000ms范围内', () => {
    const rateLimiter = new RateLimiter(db);
    const config = rateLimiter.getConfig();

    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (iterations) => {
        for (let i = 0; i < iterations; i++) {
          const delay = rateLimiter.generateRandomDelay();

          // 验证：延迟应该在默认范围内
          expect(delay).toBeGreaterThanOrEqual(config.minDelayMs);
          expect(delay).toBeLessThanOrEqual(config.maxDelayMs);
          expect(delay).toBeGreaterThanOrEqual(1000);
          expect(delay).toBeLessThanOrEqual(3000);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * 属性22.2: 自定义配置下的随机延迟范围
   * 对于任何有效的配置范围，生成的随机延迟应该在该范围内
   */
  test('属性22.2: 自定义配置下的随机延迟在指定范围内', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }), // minDelayMs
        fc.integer({ min: 100, max: 10000 }), // maxDelayMs
        fc.integer({ min: 10, max: 100 }), // iterations
        (minDelay, maxDelay, iterations) => {
          // 确保 min <= max
          const min = Math.min(minDelay, maxDelay);
          const max = Math.max(minDelay, maxDelay);

          const rateLimiter = new RateLimiter(db, {
            minDelayMs: min,
            maxDelayMs: max,
          });

          for (let i = 0; i < iterations; i++) {
            const delay = rateLimiter.generateRandomDelay();

            // 验证：延迟应该在配置的范围内
            expect(delay).toBeGreaterThanOrEqual(min);
            expect(delay).toBeLessThanOrEqual(max);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性22.3: 随机延迟的分布性
   * 生成大量随机延迟时，应该覆盖配置范围内的不同值（不是总是相同的值）
   */
  test('属性22.3: 随机延迟具有分布性（不总是相同值）', () => {
    const rateLimiter = new RateLimiter(db);
    const delays = new Set<number>();
    const sampleSize = 100;

    for (let i = 0; i < sampleSize; i++) {
      const delay = rateLimiter.generateRandomDelay();
      delays.add(delay);
    }

    // 验证：应该生成多个不同的延迟值
    // 在1000-3000ms范围内，100次采样应该至少有10个不同的值
    expect(delays.size).toBeGreaterThanOrEqual(10);
  });

  /**
   * 属性22.4: 随机延迟为整数
   * 生成的随机延迟应该是整数（毫秒）
   */
  test('属性22.4: 随机延迟为整数', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }),
        fc.integer({ min: 100, max: 10000 }),
        fc.integer({ min: 10, max: 50 }),
        (minDelay, maxDelay, iterations) => {
          const min = Math.min(minDelay, maxDelay);
          const max = Math.max(minDelay, maxDelay);

          const rateLimiter = new RateLimiter(db, {
            minDelayMs: min,
            maxDelayMs: max,
          });

          for (let i = 0; i < iterations; i++) {
            const delay = rateLimiter.generateRandomDelay();

            // 验证：延迟应该是整数
            expect(Number.isInteger(delay)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性22.5: 边界情况 - 最小值等于最大值
   * 当最小延迟等于最大延迟时，应该总是返回该值
   */
  test('属性22.5: 最小值等于最大值时返回固定值', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 10000 }),
        fc.integer({ min: 10, max: 50 }),
        (fixedDelay, iterations) => {
          const rateLimiter = new RateLimiter(db, {
            minDelayMs: fixedDelay,
            maxDelayMs: fixedDelay,
          });

          for (let i = 0; i < iterations; i++) {
            const delay = rateLimiter.generateRandomDelay();

            // 验证：延迟应该等于固定值
            expect(delay).toBe(fixedDelay);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性22.6: waitRandomDelay 实际等待时间
   * waitRandomDelay 方法应该实际等待生成的随机延迟时间
   */
  test('属性22.6: waitRandomDelay 实际等待指定时间', async () => {
    const rateLimiter = new RateLimiter(db, {
      minDelayMs: 10, // 使用较小的延迟以加快测试
      maxDelayMs: 50,
    });

    const startTime = Date.now();
    await rateLimiter.waitRandomDelay();
    const endTime = Date.now();
    const actualDelay = endTime - startTime;

    // 验证：实际等待时间应该在配置范围内（允许一些误差）
    expect(actualDelay).toBeGreaterThanOrEqual(10 - 5); // 允许5ms误差
    expect(actualDelay).toBeLessThanOrEqual(50 + 10); // 允许10ms误差
  });

  /**
   * 属性22.7: 多次调用 waitRandomDelay 的独立性
   * 多次调用 waitRandomDelay 应该产生不同的延迟时间
   */
  test('属性22.7: 多次调用 waitRandomDelay 产生不同延迟', async () => {
    const rateLimiter = new RateLimiter(db, {
      minDelayMs: 10,
      maxDelayMs: 100,
    });

    const delays: number[] = [];
    const iterations = 10;

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      await rateLimiter.waitRandomDelay();
      const endTime = Date.now();
      delays.push(endTime - startTime);
    }

    // 验证：应该有多个不同的延迟值
    const uniqueDelays = new Set(delays);
    expect(uniqueDelays.size).toBeGreaterThan(1);
  });

  /**
   * 属性22.8: 配置更新后的延迟范围
   * 更新配置后，生成的随机延迟应该使用新的配置范围
   */
  test('属性22.8: 配置更新后使用新的延迟范围', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 1000 }),
        fc.integer({ min: 2000, max: 5000 }),
        fc.integer({ min: 10, max: 50 }),
        (newMin, newMax, iterations) => {
          const rateLimiter = new RateLimiter(db); // 使用默认配置

          // 更新配置
          rateLimiter.updateConfig({
            minDelayMs: newMin,
            maxDelayMs: newMax,
          });

          for (let i = 0; i < iterations; i++) {
            const delay = rateLimiter.generateRandomDelay();

            // 验证：延迟应该在新的配置范围内
            expect(delay).toBeGreaterThanOrEqual(newMin);
            expect(delay).toBeLessThanOrEqual(newMax);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性22.9: 随机延迟的统计分布
   * 大量采样时，随机延迟的平均值应该接近配置范围的中点
   */
  test('属性22.9: 随机延迟的平均值接近范围中点', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 2000 }),
        fc.integer({ min: 3000, max: 5000 }),
        (minDelay, maxDelay) => {
          const rateLimiter = new RateLimiter(db, {
            minDelayMs: minDelay,
            maxDelayMs: maxDelay,
          });

          const sampleSize = 1000;
          let sum = 0;

          for (let i = 0; i < sampleSize; i++) {
            sum += rateLimiter.generateRandomDelay();
          }

          const average = sum / sampleSize;
          const expectedMidpoint = (minDelay + maxDelay) / 2;

          // 验证：平均值应该接近中点（允许10%的误差）
          const tolerance = (maxDelay - minDelay) * 0.1;
          expect(Math.abs(average - expectedMidpoint)).toBeLessThanOrEqual(tolerance);
        }
      ),
      { numRuns: 20 } // 减少运行次数，因为每次需要1000次采样
    );
  });

  /**
   * 属性22.10: 极端配置下的随机延迟
   * 即使在极端配置下（非常小或非常大的延迟），也应该正确工作
   */
  test('属性22.10: 极端配置下的随机延迟正确工作', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          { min: 1, max: 1 }, // 最小延迟
          { min: 1, max: 10 }, // 很小的范围
          { min: 10000, max: 60000 }, // 很大的延迟
          { min: 1, max: 100000 } // 很大的范围
        ),
        fc.integer({ min: 10, max: 30 }),
        (config, iterations) => {
          const rateLimiter = new RateLimiter(db, {
            minDelayMs: config.min,
            maxDelayMs: config.max,
          });

          for (let i = 0; i < iterations; i++) {
            const delay = rateLimiter.generateRandomDelay();

            // 验证：延迟应该在配置范围内
            expect(delay).toBeGreaterThanOrEqual(config.min);
            expect(delay).toBeLessThanOrEqual(config.max);
            expect(Number.isInteger(delay)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
