import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { LogDao, LogLevel, LogFilters } from '../../database/dao/LogDao';
import { LogService } from './LogService';
import { initSchema } from '../../database/schema';

/**
 * 属性测试：日志过滤准确性
 * Feature: telegram-content-manager, Property 30: 日志过滤准确性
 * 验证需求: 9.6
 *
 * 对于任何日志查询操作，如果指定了过滤条件（时间范围、账号ID、任务ID、级别），
 * 返回的所有日志记录都应该满足所有指定的过滤条件。
 */

describe('LogService Property Tests - 日志过滤准确性', () => {
  let db: Database.Database;
  let logDao: LogDao;
  let logService: LogService;

  beforeEach(() => {
    // 使用内存数据库进行测试
    db = new Database(':memory:');
    initSchema(db);
    logDao = new LogDao(db);
    logService = new LogService(logDao, { enableDatabaseLogging: true });
  });

  afterEach(() => {
    db.close();
  });

  /**
   * 生成随机日志级别
   */
  const logLevelArb = fc.constantFrom<LogLevel>('INFO', 'WARN', 'ERROR', 'DEBUG');

  /**
   * 生成随机账号ID - 使用数字避免保留字冲突
   */
  const accountIdArb = fc.option(
    fc.integer({ min: 10000, max: 99999999 }).map((n) => `account-${n}`),
    { nil: undefined }
  );

  /**
   * 生成随机任务ID - 使用数字避免保留字冲突
   */
  const taskIdArb = fc.option(
    fc.integer({ min: 10000, max: 99999999 }).map((n) => `task-${n}`),
    { nil: undefined }
  );

  /**
   * 生成随机日志消息 - 使用lorem文本避免保留字问题
   */
  const messageArb = fc.lorem({ maxCount: 10 }).filter((s) => s.length >= 5 && s.length <= 100);

  /**
   * 生成随机日志数据
   */
  const logDataArb = fc.record({
    level: logLevelArb,
    message: messageArb,
    accountId: accountIdArb,
    taskId: taskIdArb,
  });

  /**
   * 辅助函数：根据级别调用对应的日志方法
   */
  const logByLevel = (
    service: LogService,
    level: LogLevel,
    message: string,
    accountId?: string,
    taskId?: string
  ) => {
    switch (level) {
      case 'INFO':
        service.info(message, accountId, taskId);
        break;
      case 'WARN':
        service.warn(message, accountId, taskId);
        break;
      case 'ERROR':
        service.error(message, accountId, taskId);
        break;
      case 'DEBUG':
        service.debug(message, accountId, taskId);
        break;
    }
  };

  const resetLogs = (): void => {
    db.exec('DELETE FROM logs');
  };

  /**
   * 属性30.1: 按级别过滤 - 所有返回的日志都应该匹配指定级别
   */
  test('属性30.1: 按级别过滤返回的所有日志都匹配指定级别', () => {
    fc.assert(
      fc.property(
        // 生成多条日志数据
        fc.array(logDataArb, { minLength: 5, maxLength: 20 }),
        // 生成要过滤的级别
        logLevelArb,
        (logsData, filterLevel) => {
          resetLogs();

          // 创建所有日志
          logsData.forEach((data) => {
            logByLevel(logService, data.level, data.message, data.accountId, data.taskId);
          });

          // 按级别过滤
          const filtered = logService.query({ level: filterLevel });

          // 验证：所有返回的日志都应该匹配指定级别
          filtered.forEach((log) => {
            expect(log.level).toBe(filterLevel);
          });

          // 验证：返回的数量应该等于该级别的日志数量
          const expectedCount = logsData.filter((d) => d.level === filterLevel).length;
          expect(filtered.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性30.2: 按账号ID过滤 - 所有返回的日志都应该匹配指定账号ID
   */
  test('属性30.2: 按账号ID过滤返回的所有日志都匹配指定账号ID', () => {
    fc.assert(
      fc.property(
        // 生成多条日志数据
        fc.array(logDataArb, { minLength: 5, maxLength: 20 }),
        // 生成要过滤的账号ID
        fc.integer({ min: 10000, max: 99999999 }).map((n) => `account-${n}`),
        (logsData, filterAccountId) => {
          resetLogs();

          // 创建所有日志
          logsData.forEach((data) => {
            logByLevel(logService, data.level, data.message, data.accountId, data.taskId);
          });

          // 按账号ID过滤
          const filtered = logService.query({ accountId: filterAccountId });

          // 验证：所有返回的日志都应该匹配指定账号ID
          filtered.forEach((log) => {
            expect(log.accountId).toBe(filterAccountId);
          });

          // 验证：返回的数量应该等于该账号的日志数量
          const expectedCount = logsData.filter((d) => d.accountId === filterAccountId).length;
          expect(filtered.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性30.3: 按任务ID过滤 - 所有返回的日志都应该匹配指定任务ID
   */
  test('属性30.3: 按任务ID过滤返回的所有日志都匹配指定任务ID', () => {
    fc.assert(
      fc.property(
        // 生成多条日志数据
        fc.array(logDataArb, { minLength: 5, maxLength: 20 }),
        // 生成要过滤的任务ID
        fc.integer({ min: 10000, max: 99999999 }).map((n) => `task-${n}`),
        (logsData, filterTaskId) => {
          resetLogs();

          // 创建所有日志
          logsData.forEach((data) => {
            logByLevel(logService, data.level, data.message, data.accountId, data.taskId);
          });

          // 按任务ID过滤
          const filtered = logService.query({ taskId: filterTaskId });

          // 验证：所有返回的日志都应该匹配指定任务ID
          filtered.forEach((log) => {
            expect(log.taskId).toBe(filterTaskId);
          });

          // 验证：返回的数量应该等于该任务的日志数量
          const expectedCount = logsData.filter((d) => d.taskId === filterTaskId).length;
          expect(filtered.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性30.4: 按时间范围过滤 - 所有返回的日志都应该在指定时间范围内
   */
  test('属性30.4: 按时间范围过滤返回的所有日志都在指定时间范围内', () => {
    fc.assert(
      fc.property(
        // 生成多条日志数据
        fc.array(logDataArb, { minLength: 5, maxLength: 20 }),
        (logsData) => {
          resetLogs();

          // 记录开始时间
          const startDate = new Date();

          // 创建所有日志
          logsData.forEach((data) => {
            logByLevel(logService, data.level, data.message, data.accountId, data.taskId);
          });

          // 记录结束时间
          const endDate = new Date();

          // 按时间范围过滤
          const filtered = logService.query({
            startDate,
            endDate,
          });

          // 验证：所有返回的日志都应该在时间范围内
          filtered.forEach((log) => {
            const logDate = new Date(log.createdAt);
            expect(logDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
            expect(logDate.getTime()).toBeLessThanOrEqual(endDate.getTime());
          });

          // 验证：应该返回所有创建的日志
          expect(filtered.length).toBe(logsData.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性30.5: 组合过滤条件 - 所有返回的日志都应该同时满足所有过滤条件
   */
  test('属性30.5: 组合过滤条件返回的所有日志都满足所有条件', () => {
    fc.assert(
      fc.property(
        // 生成多条日志数据
        fc.array(logDataArb, { minLength: 10, maxLength: 30 }),
        // 生成过滤条件
        fc.record({
          level: fc.option(logLevelArb, { nil: undefined }),
          accountId: fc.option(
            fc.integer({ min: 10000, max: 99999999 }).map((n) => `account-${n}`),
            { nil: undefined }
          ),
          taskId: fc.option(
            fc.integer({ min: 10000, max: 99999999 }).map((n) => `task-${n}`),
            { nil: undefined }
          ),
        }),
        (logsData, filters) => {
          resetLogs();

          // 记录开始时间
          const startDate = new Date();

          // 创建所有日志
          logsData.forEach((data) => {
            logByLevel(logService, data.level, data.message, data.accountId, data.taskId);
          });

          // 记录结束时间
          const endDate = new Date();

          // 构建完整的过滤条件
          const fullFilters: LogFilters = {
            ...filters,
            startDate,
            endDate,
          };

          // 应用过滤
          const filtered = logService.query(fullFilters);

          // 验证：所有返回的日志都应该满足所有过滤条件
          filtered.forEach((log) => {
            // 验证级别
            if (filters.level) {
              expect(log.level).toBe(filters.level);
            }

            // 验证账号ID
            if (filters.accountId) {
              expect(log.accountId).toBe(filters.accountId);
            }

            // 验证任务ID
            if (filters.taskId) {
              expect(log.taskId).toBe(filters.taskId);
            }

            // 验证时间范围
            const logDate = new Date(log.createdAt);
            expect(logDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
            expect(logDate.getTime()).toBeLessThanOrEqual(endDate.getTime());
          });

          // 计算预期的日志数量
          const expectedCount = logsData.filter((data) => {
            if (filters.level && data.level !== filters.level) return false;
            if (filters.accountId && data.accountId !== filters.accountId) return false;
            if (filters.taskId && data.taskId !== filters.taskId) return false;
            return true;
          }).length;

          // 验证：返回的数量应该等于满足条件的日志数量
          expect(filtered.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性30.6: 空过滤条件 - 应该返回所有日志
   */
  test('属性30.6: 空过滤条件应该返回所有日志', () => {
    fc.assert(
      fc.property(
        // 生成多条日志数据
        fc.array(logDataArb, { minLength: 5, maxLength: 20 }),
        (logsData) => {
          resetLogs();

          // 创建所有日志
          logsData.forEach((data) => {
            logByLevel(logService, data.level, data.message, data.accountId, data.taskId);
          });

          // 不使用任何过滤条件
          const filtered = logService.query({});

          // 验证：应该返回所有日志
          expect(filtered.length).toBe(logsData.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性30.7: 不匹配的过滤条件 - 应该返回空数组
   */
  test('属性30.7: 不匹配的过滤条件应该返回空数组', () => {
    fc.assert(
      fc.property(
        // 生成多条日志数据（只使用INFO级别）
        fc.array(
          fc.record({
            level: fc.constant<LogLevel>('INFO'),
            message: messageArb,
            accountId: accountIdArb,
            taskId: taskIdArb,
          }),
          { minLength: 5, maxLength: 20 }
        ),
        (logsData) => {
          resetLogs();

          // 创建所有日志（都是INFO级别）
          logsData.forEach((data) => {
            logService.info(data.message, data.accountId, data.taskId);
          });

          // 使用不匹配的过滤条件（查询ERROR级别）
          const filtered = logService.query({ level: 'ERROR' });

          // 验证：应该返回空数组
          expect(filtered.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性30.8: 时间范围边界测试 - startDate之前的日志不应该被返回
   */
  test('属性30.8: startDate之前的日志不应该被返回', () => {
    fc.assert(
      fc.property(
        // 生成日志数据
        fc.array(logDataArb, { minLength: 5, maxLength: 15 }),
        (logsData) => {
          resetLogs();

          // 创建第一批日志
          const splitIndex = Math.floor(logsData.length / 2);
          logsData.slice(0, splitIndex).forEach((data) => {
            logByLevel(logService, data.level, data.message, data.accountId, data.taskId);
          });

          // 把第一批日志时间强制拉早，避免与第二批落在同一毫秒导致边界误判
          const firstBatchLogs = logService.query({}, 10000);
          const oldTimestamp = new Date(Date.now() - 60_000).toISOString();
          const updateCreatedAtStmt = db.prepare('UPDATE logs SET created_at = ? WHERE id = ?');
          firstBatchLogs.forEach((log) => {
            updateCreatedAtStmt.run(oldTimestamp, log.id);
          });

          // 记录分界时间
          const startDate = new Date();

          // 创建第二批日志
          logsData.slice(splitIndex).forEach((data) => {
            logByLevel(logService, data.level, data.message, data.accountId, data.taskId);
          });

          // 按时间范围过滤（只查询startDate之后的）
          const filtered = logService.query({ startDate });

          // 验证：所有返回的日志都应该在startDate之后
          filtered.forEach((log) => {
            const logDate = new Date(log.createdAt);
            expect(logDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
          });

          // 验证：返回的数量应该等于第二批日志的数量
          const expectedCount = logsData.length - splitIndex;
          expect(filtered.length).toBe(expectedCount);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * 属性30.9: 分页不影响过滤准确性 - 分页查询的所有结果都应该满足过滤条件
   */
  test('属性30.9: 分页查询的所有结果都应该满足过滤条件', () => {
    fc.assert(
      fc.property(
        // 生成多条日志数据
        fc.array(logDataArb, { minLength: 10, maxLength: 30 }),
        // 生成过滤级别
        logLevelArb,
        // 生成分页参数
        fc.record({
          limit: fc.integer({ min: 1, max: 10 }),
          offset: fc.integer({ min: 0, max: 5 }),
        }),
        (logsData, filterLevel, pagination) => {
          resetLogs();

          // 创建所有日志
          logsData.forEach((data) => {
            logByLevel(logService, data.level, data.message, data.accountId, data.taskId);
          });

          // 按级别过滤并分页
          const filtered = logService.query(
            { level: filterLevel },
            pagination.limit,
            pagination.offset
          );

          // 验证：所有返回的日志都应该匹配指定级别
          filtered.forEach((log) => {
            expect(log.level).toBe(filterLevel);
          });

          // 验证：返回的数量不应该超过limit
          expect(filtered.length).toBeLessThanOrEqual(pagination.limit);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性30.10: count方法应该返回与query方法一致的数量
   */
  test('属性30.10: count方法应该返回与query方法一致的数量', () => {
    fc.assert(
      fc.property(
        // 生成多条日志数据
        fc.array(logDataArb, { minLength: 5, maxLength: 20 }),
        // 生成过滤条件
        fc.record({
          level: fc.option(logLevelArb, { nil: undefined }),
          accountId: fc.option(
            fc.integer({ min: 10000, max: 99999999 }).map((n) => `account-${n}`),
            { nil: undefined }
          ),
        }),
        (logsData, filters) => {
          resetLogs();

          // 创建所有日志
          logsData.forEach((data) => {
            logByLevel(logService, data.level, data.message, data.accountId, data.taskId);
          });

          // 查询日志
          const filtered = logService.query(filters, 1000);

          // 统计日志数量
          const count = logService.count(filters);

          // 验证：count应该等于query返回的数量
          expect(count).toBe(filtered.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
