/**
 * MessageService 属性测试 - 操作日志记录一致性
 * Feature: telegram-content-manager, Property 9: 操作日志记录一致性
 *
 * **验证需求: 2.6, 3.5, 9.1**
 *
 * 属性描述:
 * 对于任何成功的消息或评论发送操作，数据库中应该存在对应的执行记录，
 * 包含时间戳、内容和结果。
 */

import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { MessageService } from './MessageService';
import { RateLimiter } from '../rateLimit/RateLimiter';
import { ClientPool } from '../../telegram/ClientPool';
import { initSchema } from '../../database/schema';
import { DaoFactory } from '../../database/dao';

describe('MessageService - 属性 9: 操作日志记录一致性', () => {
  let db: Database.Database;
  let messageService: MessageService;
  let rateLimiter: RateLimiter;
  let clientPool: ClientPool;
  let mockedMessageId: number;

  const idChars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'];
  const contentChars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-.,!?'];

  const accountIdArb = fc
    .array(fc.constantFrom(...idChars), { minLength: 5, maxLength: 20 })
    .map((chars) => chars.join(''));

  const targetIdArb = fc
    .array(fc.constantFrom(...idChars), { minLength: 5, maxLength: 20 })
    .map((chars) => chars.join(''));

  const contentArb = fc
    .array(fc.constantFrom(...contentChars), { minLength: 1, maxLength: 200 })
    .map((chars) => chars.join(''))
    .filter((text) => text.trim().length > 0);

  beforeEach(() => {
    // 创建内存数据库
    db = new Database(':memory:');
    initSchema(db);

    // 初始化 DaoFactory
    DaoFactory.initialize(db);

    // 创建 RateLimiter 实例
    rateLimiter = new RateLimiter(db, {
      maxPerSecond: 1000,
      maxPerHour: 100000,
      maxPerDay: 1000000,
      minDelayMs: 0,
      maxDelayMs: 0,
    });

    // 获取 ClientPool 实例
    clientPool = ClientPool.getInstance();

    mockedMessageId = 1;

    // 创建 MessageService 实例
    messageService = new MessageService(db, rateLimiter);
  });

  afterEach(async () => {
    // 清理所有客户端
    const clientIds = clientPool.getAllClientIds();
    for (const accountId of clientIds) {
      await clientPool.removeClient(accountId);
    }

    db.close();
  });

  afterAll(() => {
    clientPool.stopBackgroundTasks();
  });

  const resetAccountState = async (accountId: string) => {
    await clientPool.removeClient(accountId);
    messageService.getMessageHistoryDao().deleteByAccountId(accountId);
  };

  /**
   * 模拟成功的消息发送
   */
  const mockSuccessfulSend = (accountId: string) => {
    // 创建模拟的 TelegramClient
    const mockClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      getIsConnected: jest.fn().mockReturnValue(true),
      sendMessage: jest.fn().mockImplementation(async () => ({ id: mockedMessageId++ })),
      sendComment: jest.fn().mockImplementation(async () => ({ id: mockedMessageId++ })),
      getRawClient: jest.fn().mockReturnValue({}),
    } as any;

    // 添加到客户端池
    clientPool.addClient(accountId, mockClient);

    return mockClient;
  };

  describe('消息发送日志记录', () => {
    it('属性: 成功发送消息后应该在数据库中存在对应的历史记录', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成随机的账号ID、目标ID和消息内容
          accountIdArb,
          targetIdArb,
          contentArb,
          fc.constantFrom('group', 'channel'),
          async (accountId, targetId, content, targetType) => {
            await resetAccountState(accountId);

            // 模拟成功的发送
            mockSuccessfulSend(accountId);

            // 发送消息前的历史记录数量
            const beforeCount = messageService
              .getMessageHistoryDao()
              .findByAccountId(accountId).length;

            // 发送消息
            const result = await messageService.sendMessage({
              accountId,
              targetId,
              targetType: targetType as 'group' | 'channel',
              content,
            });

            // 如果发送成功
            if (result.success) {
              // 发送消息后的历史记录数量
              const afterCount = messageService
                .getMessageHistoryDao()
                .findByAccountId(accountId).length;

              // 验证: 历史记录数量应该增加1
              expect(afterCount).toBe(beforeCount + 1);

              // 获取最新的历史记录
              const history = messageService.getMessageHistoryDao().findByAccountId(accountId);
              const latestHistory = history[0]; // 最新的记录在第一个

              // 验证: 历史记录应该包含正确的信息
              expect(latestHistory).toBeDefined();
              expect(latestHistory.accountId).toBe(accountId);
              expect(latestHistory.targetId).toBe(targetId);
              expect(latestHistory.content).toBe(content);
              expect(latestHistory.status).toBe('success');
              expect(latestHistory.sentAt).toBeDefined();
              expect(latestHistory.error).toBeUndefined();

              // 验证: 时间戳应该是最近的时间（在过去1分钟内）
              const sentAt = new Date(latestHistory.sentAt);
              const now = new Date();
              const timeDiff = now.getTime() - sentAt.getTime();
              expect(timeDiff).toBeGreaterThanOrEqual(0);
              expect(timeDiff).toBeLessThan(60000); // 小于1分钟
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('属性: 失败的消息发送也应该记录到数据库', async () => {
      await fc.assert(
        fc.asyncProperty(
          accountIdArb,
          targetIdArb,
          contentArb,
          async (accountId, targetId, content) => {
            // 模拟失败的发送（不添加客户端到池中）
            // 这样会导致 CLIENT_NOT_FOUND 错误
            await resetAccountState(accountId);

            // 发送消息前的历史记录数量
            const beforeCount = messageService
              .getMessageHistoryDao()
              .findByAccountId(accountId).length;

            // 发送消息
            const result = await messageService.sendMessage({
              accountId,
              targetId,
              targetType: 'group',
              content,
            });

            // 验证: 发送应该失败
            expect(result.success).toBe(false);

            // 发送消息后的历史记录数量
            const afterCount = messageService
              .getMessageHistoryDao()
              .findByAccountId(accountId).length;

            // 验证: 历史记录数量应该增加1（失败也要记录）
            expect(afterCount).toBe(beforeCount + 1);

            // 获取最新的历史记录
            const history = messageService.getMessageHistoryDao().findByAccountId(accountId);
            const latestHistory = history[0];

            // 验证: 历史记录应该包含失败信息
            expect(latestHistory).toBeDefined();
            expect(latestHistory.accountId).toBe(accountId);
            expect(latestHistory.targetId).toBe(targetId);
            expect(latestHistory.content).toBe(content);
            expect(latestHistory.status).toBe('failed');
            expect(latestHistory.error).toBeDefined();
            expect(latestHistory.sentAt).toBeDefined();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('评论发送日志记录', () => {
    it('属性: 成功发送评论后应该在数据库中存在对应的历史记录', async () => {
      await fc.assert(
        fc.asyncProperty(
          accountIdArb,
          targetIdArb,
          fc.integer({ min: 1, max: 1000000 }),
          contentArb,
          async (accountId, channelId, messageId, content) => {
            await resetAccountState(accountId);

            // 模拟成功的发送
            mockSuccessfulSend(accountId);

            // 发送评论前的历史记录数量
            const beforeCount = messageService
              .getMessageHistoryDao()
              .findByAccountId(accountId).length;

            // 发送评论
            const result = await messageService.sendComment({
              accountId,
              channelId,
              messageId,
              content,
            });

            // 如果发送成功
            if (result.success) {
              // 发送评论后的历史记录数量
              const afterCount = messageService
                .getMessageHistoryDao()
                .findByAccountId(accountId).length;

              // 验证: 历史记录数量应该增加1
              expect(afterCount).toBe(beforeCount + 1);

              // 获取最新的历史记录
              const history = messageService.getMessageHistoryDao().findByAccountId(accountId);
              const latestHistory = history[0];

              // 验证: 历史记录应该包含正确的信息
              expect(latestHistory).toBeDefined();
              expect(latestHistory.accountId).toBe(accountId);
              expect(latestHistory.targetId).toBe(channelId);
              expect(latestHistory.type).toBe('channel_comment');
              expect(latestHistory.content).toBe(content);
              expect(latestHistory.status).toBe('success');
              expect(latestHistory.sentAt).toBeDefined();
              expect(latestHistory.error).toBeUndefined();

              // 验证: 时间戳应该是最近的时间
              const sentAt = new Date(latestHistory.sentAt);
              const now = new Date();
              const timeDiff = now.getTime() - sentAt.getTime();
              expect(timeDiff).toBeGreaterThanOrEqual(0);
              expect(timeDiff).toBeLessThan(60000);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('属性: 失败的评论发送也应该记录到数据库', async () => {
      await fc.assert(
        fc.asyncProperty(
          accountIdArb,
          targetIdArb,
          fc.integer({ min: 1, max: 1000000 }),
          contentArb,
          async (accountId, channelId, messageId, content) => {
            // 模拟失败的发送（不添加客户端到池中）
            await resetAccountState(accountId);

            // 发送评论前的历史记录数量
            const beforeCount = messageService
              .getMessageHistoryDao()
              .findByAccountId(accountId).length;

            // 发送评论
            const result = await messageService.sendComment({
              accountId,
              channelId,
              messageId,
              content,
            });

            // 验证: 发送应该失败
            expect(result.success).toBe(false);

            // 发送评论后的历史记录数量
            const afterCount = messageService
              .getMessageHistoryDao()
              .findByAccountId(accountId).length;

            // 验证: 历史记录数量应该增加1
            expect(afterCount).toBe(beforeCount + 1);

            // 获取最新的历史记录
            const history = messageService.getMessageHistoryDao().findByAccountId(accountId);
            const latestHistory = history[0];

            // 验证: 历史记录应该包含失败信息
            expect(latestHistory).toBeDefined();
            expect(latestHistory.accountId).toBe(accountId);
            expect(latestHistory.targetId).toBe(channelId);
            expect(latestHistory.type).toBe('channel_comment');
            expect(latestHistory.content).toBe(content);
            expect(latestHistory.status).toBe('failed');
            expect(latestHistory.error).toBeDefined();
            expect(latestHistory.sentAt).toBeDefined();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('日志记录完整性', () => {
    it('属性: 所有发送操作都应该被记录，无论成功或失败', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              accountId: accountIdArb,
              targetId: targetIdArb,
              content: contentArb,
              shouldSucceed: fc.boolean(),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (operations) => {
            // 记录操作前的总记录数
            const beforeCount = messageService.getMessageHistoryDao().findAll().length;

            // 执行所有操作
            for (const op of operations) {
              if (op.shouldSucceed) {
                mockSuccessfulSend(op.accountId);
              } else {
                await clientPool.removeClient(op.accountId);
              }

              await messageService.sendMessage({
                accountId: op.accountId,
                targetId: op.targetId,
                targetType: 'group',
                content: op.content,
              });
            }

            // 记录操作后的总记录数
            const afterCount = messageService.getMessageHistoryDao().findAll().length;
            const newRecords = messageService
              .getMessageHistoryDao()
              .findAll()
              .slice(0, operations.length);

            // 验证: 记录数应该增加与操作数相同的数量
            expect(afterCount).toBe(beforeCount + operations.length);

            // 验证: 每个操作都应该有对应的记录
            for (const op of operations) {
              const history = messageService
                .getMessageHistoryDao()
                .findByAccountId(op.accountId)
                .filter((h) => h.targetId === op.targetId && h.content === op.content);

              const newHistory = newRecords.filter(
                (h) =>
                  h.accountId === op.accountId &&
                  h.targetId === op.targetId &&
                  h.content === op.content
              );

              expect(history.length).toBeGreaterThan(0);
              expect(newHistory.length).toBeGreaterThan(0);

              // 验证记录的状态与预期一致
              const expectedStatus = op.shouldSucceed ? 'success' : 'failed';
              expect(newHistory.some((record) => record.status === expectedStatus)).toBe(true);
            }
          }
        ),
        { numRuns: 15 }
      );
    });

    it('属性: 日志记录应该包含所有必需字段', async () => {
      await fc.assert(
        fc.asyncProperty(
          accountIdArb,
          targetIdArb,
          contentArb,
          fc.boolean(),
          async (accountId, targetId, content, shouldSucceed) => {
            await resetAccountState(accountId);

            // 模拟成功或失败的发送（随机）
            if (shouldSucceed) {
              mockSuccessfulSend(accountId);
            } else {
              await clientPool.removeClient(accountId);
            }

            // 发送消息
            await messageService.sendMessage({
              accountId,
              targetId,
              targetType: 'group',
              content,
            });

            // 获取最新的历史记录
            const history = messageService.getMessageHistoryDao().findByAccountId(accountId);
            const latestHistory = history[0];

            // 验证: 所有必需字段都应该存在
            expect(latestHistory).toBeDefined();
            expect(latestHistory.id).toBeDefined();
            expect(typeof latestHistory.id).toBe('string');
            expect(latestHistory.accountId).toBe(accountId);
            expect(latestHistory.targetId).toBe(targetId);
            expect(latestHistory.content).toBe(content);
            expect(latestHistory.status).toBeDefined();
            expect(['success', 'failed']).toContain(latestHistory.status);
            expect(latestHistory.sentAt).toBeDefined();
            expect(latestHistory.type).toBeDefined();

            // 验证: 如果失败，应该有错误信息
            if (latestHistory.status === 'failed') {
              expect(latestHistory.error).toBeDefined();
              expect(typeof latestHistory.error).toBe('string');
              expect(latestHistory.error!.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('属性: 时间戳应该按照发送顺序递增', async () => {
      await fc.assert(
        fc.asyncProperty(
          accountIdArb,
          fc.array(contentArb, { minLength: 2, maxLength: 5 }),
          async (accountId, contents) => {
            await resetAccountState(accountId);

            // 模拟成功的发送
            mockSuccessfulSend(accountId);

            // 按顺序发送多条消息
            for (const content of contents) {
              await messageService.sendMessage({
                accountId,
                targetId: 'test-target',
                targetType: 'group',
                content,
              });

              // 添加小延迟确保时间戳不同
              await new Promise((resolve) => setTimeout(resolve, 10));
            }

            // 获取该账号的所有历史记录
            const history = messageService.getMessageHistoryDao().findByAccountId(accountId);

            // 验证: 记录数应该等于发送的消息数
            expect(history.length).toBe(contents.length);

            // 验证: 时间戳应该按照发送顺序（降序，因为最新的在前面）
            for (let i = 0; i < history.length - 1; i++) {
              const current = new Date(history[i].sentAt);
              const next = new Date(history[i + 1].sentAt);

              // 当前记录的时间应该大于或等于下一条记录的时间
              expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
            }
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('统计数据一致性', () => {
    it('属性: 统计数据应该与实际记录数一致', async () => {
      await fc.assert(
        fc.asyncProperty(
          accountIdArb,
          fc.array(
            fc.record({
              targetId: targetIdArb,
              content: contentArb,
              shouldSucceed: fc.boolean(),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (accountId, operations) => {
            // 执行所有操作
            for (const op of operations) {
              if (op.shouldSucceed) {
                mockSuccessfulSend(accountId);
              } else {
                await clientPool.removeClient(accountId);
              }

              await messageService.sendMessage({
                accountId,
                targetId: op.targetId,
                targetType: 'group',
                content: op.content,
              });
            }

            // 获取统计数据
            const stats = messageService.getAccountStats(accountId);

            // 获取实际记录
            const history = messageService.getMessageHistoryDao().findByAccountId(accountId);

            // 验证: 总数应该一致
            expect(stats.total).toBe(history.length);

            // 计算实际的成功和失败数
            const actualSuccess = history.filter((h) => h.status === 'success').length;
            const actualFailed = history.filter((h) => h.status === 'failed').length;

            // 验证: 成功和失败数应该一致
            expect(stats.success).toBe(actualSuccess);
            expect(stats.failed).toBe(actualFailed);

            // 验证: 成功率计算正确
            const expectedSuccessRate = stats.total > 0 ? (stats.success / stats.total) * 100 : 0;
            expect(stats.successRate).toBeCloseTo(expectedSuccessRate, 2);
          }
        ),
        { numRuns: 15 }
      );
    });
  });
});
