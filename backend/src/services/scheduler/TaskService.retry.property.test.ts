import Database from 'better-sqlite3';
import * as fc from 'fast-check';
import { TaskService } from './TaskService';
import { MessageService } from '../message/MessageService';
import { TemplateService } from '../template/TemplateService';
import { initSchema } from '../../database/schema';
import { runMigrations } from '../../database/migrations';
import { DaoFactory } from '../../database/dao';
import { TaskExecutionDao } from '../../database/dao/TaskExecutionDao';
import { ClientPool } from '../../telegram/ClientPool';
import { SendResult } from '../../types/message';

/**
 * 属性测试：任务重试功能
 * Feature: telegram-content-manager
 */
describe('TaskService - 任务重试属性测试', () => {
  let db: Database.Database;
  let taskService: TaskService;
  let messageService: MessageService;
  let templateService: TemplateService;
  let taskExecutionDao: TaskExecutionDao;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    runMigrations(db);

    // 初始化 DaoFactory
    DaoFactory.initialize(db);

    messageService = new MessageService(db);
    templateService = new TemplateService(db);
    taskService = new TaskService(db);
    taskExecutionDao = new TaskExecutionDao(db);
  });

  afterEach(async () => {
    // 停止所有运行中的任务，清理 cron 任务和监听器
    await taskService.stopAllTasks();

    // 清理 ClientPool 的定时器
    const clientPool = ClientPool.getInstance();
    clientPool.stopBackgroundTasks();

    db.close();
  });

  /**
   * 属性 25: 任务重试次数限制
   *
   * 对于任何配置了重试策略的任务，失败后的重试次数不应该超过配置的最大重试次数。
   *
   * 验证需求: 6.4
   */
  describe('属性 25: 任务重试次数限制', () => {
    it('sendMessageWithRetry应该遵守maxRetries限制', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成最大重试次数
          fc.integer({ min: 1, max: 5 }),
          // 生成账号ID和目标ID
          fc.uuid(),
          fc.uuid(),
          async (maxRetries, accountId, targetId) => {
            // 记录实际调用次数
            let callCount = 0;

            // Mock sendMessage方法，使其总是失败（但可重试）
            const originalSendMessage = messageService.sendMessage.bind(messageService);
            messageService.sendMessage = jest.fn(async () => {
              callCount++;
              return {
                success: false,
                sentAt: new Date(),
                error: {
                  code: 'NETWORK_ERROR',
                  message: '网络错误',
                  isFloodWait: false,
                  isRetryable: true, // 设置为可重试
                },
              } as SendResult;
            });

            // Mock getRetryDelay to return 0 (no delay)
            const originalGetRetryDelay = (messageService as any).getRetryDelay.bind(
              messageService
            );
            (messageService as any).getRetryDelay = jest.fn(() => 0);

            // 调用sendMessageWithRetry
            const result = await messageService.sendMessageWithRetry(
              {
                accountId,
                targetId,
                targetType: 'group',
                content: '测试消息',
              },
              maxRetries
            );

            // 验证结果
            expect(result.success).toBe(false);

            // 验证调用次数等于maxRetries（不超过）
            expect(callCount).toBe(maxRetries);
            expect(callCount).toBeLessThanOrEqual(maxRetries);

            // 恢复原始方法
            messageService.sendMessage = originalSendMessage;
            (messageService as any).getRetryDelay = originalGetRetryDelay;
          }
        ),
        { numRuns: 20 }
      );
    }, 30000); // 30秒超时

    it('sendMessageWithRetry在成功后应该立即停止重试', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成最大重试次数
          fc.integer({ min: 2, max: 5 }),
          // 生成成功的尝试次数（应该小于maxRetries）
          fc.integer({ min: 1, max: 3 }),
          // 生成账号ID和目标ID
          fc.uuid(),
          fc.uuid(),
          async (maxRetries, successAttempt, accountId, targetId) => {
            // 确保successAttempt不超过maxRetries
            const actualSuccessAttempt = Math.min(successAttempt, maxRetries);

            // 记录实际调用次数
            let callCount = 0;

            // Mock sendMessage方法，在第N次尝试时成功
            const originalSendMessage = messageService.sendMessage.bind(messageService);
            messageService.sendMessage = jest.fn(async () => {
              callCount++;

              if (callCount === actualSuccessAttempt) {
                // 第N次尝试成功
                return {
                  success: true,
                  messageId: 12345,
                  sentAt: new Date(),
                } as SendResult;
              } else {
                // 其他尝试失败（但可重试）
                return {
                  success: false,
                  sentAt: new Date(),
                  error: {
                    code: 'NETWORK_ERROR',
                    message: '网络错误',
                    isFloodWait: false,
                    isRetryable: true, // 设置为可重试
                  },
                } as SendResult;
              }
            });

            // Mock getRetryDelay to return 0 (no delay)
            const originalGetRetryDelay = (messageService as any).getRetryDelay.bind(
              messageService
            );
            (messageService as any).getRetryDelay = jest.fn(() => 0);

            // 调用sendMessageWithRetry
            const result = await messageService.sendMessageWithRetry(
              {
                accountId,
                targetId,
                targetType: 'group',
                content: '测试消息',
              },
              maxRetries
            );

            // 验证结果成功
            expect(result.success).toBe(true);

            // 验证调用次数等于成功的尝试次数（不继续重试）
            expect(callCount).toBe(actualSuccessAttempt);
            expect(callCount).toBeLessThanOrEqual(maxRetries);

            // 恢复原始方法
            messageService.sendMessage = originalSendMessage;
            (messageService as any).getRetryDelay = originalGetRetryDelay;
          }
        ),
        { numRuns: 20 }
      );
    }, 30000); // 30秒超时

    it('sendMessageWithRetry在遇到FloodWait时应该立即停止重试', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成最大重试次数
          fc.integer({ min: 2, max: 5 }),
          // 生成账号ID和目标ID
          fc.uuid(),
          fc.uuid(),
          async (maxRetries, accountId, targetId) => {
            // 记录实际调用次数
            let callCount = 0;

            // Mock sendMessage方法，返回FloodWait错误
            const originalSendMessage = messageService.sendMessage.bind(messageService);
            messageService.sendMessage = jest.fn(async () => {
              callCount++;
              return {
                success: false,
                sentAt: new Date(),
                error: {
                  code: 'FLOOD_WAIT',
                  message: 'FloodWait错误',
                  isFloodWait: true,
                  waitSeconds: 60,
                },
              } as SendResult;
            });

            // 调用sendMessageWithRetry
            const result = await messageService.sendMessageWithRetry(
              {
                accountId,
                targetId,
                targetType: 'group',
                content: '测试消息',
              },
              maxRetries
            );

            // 验证结果失败
            expect(result.success).toBe(false);
            expect(result.error?.isFloodWait).toBe(true);

            // 验证只调用了1次（遇到FloodWait立即停止）
            expect(callCount).toBe(1);

            // 恢复原始方法
            messageService.sendMessage = originalSendMessage;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('任务配置的retryOnError和maxRetries应该被正确应用', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成任务配置
          fc.record({
            retryOnError: fc.boolean(),
            maxRetries: fc.integer({ min: 1, max: 5 }),
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 1 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 1 }),
          }),
          async (config) => {
            // 创建模板
            const template = await templateService.createTemplate({
              name: '测试模板',
              category: 'group_message',
              content: '测试内容',
              enabled: true,
            });

            // 创建任务
            const task = await taskService.createTask({
              type: 'group_posting',
              accountIds: config.accountIds,
              targetIds: config.targetIds,
              config: {
                interval: 10,
                retryOnError: config.retryOnError,
                maxRetries: config.maxRetries,
              },
            });

            // 验证任务配置
            const createdTask = await taskService.getTask(task.id);
            expect(createdTask).not.toBeNull();
            expect(createdTask!.config.retryOnError).toBe(config.retryOnError);
            expect(createdTask!.config.maxRetries).toBe(config.maxRetries);

            // 清理
            await templateService.deleteTemplate(template.id);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * 属性 26: 任务执行历史记录
   *
   * 对于任何任务执行，无论成功或失败，都应该在执行历史表中创建一条记录，
   * 包含执行时间、结果和错误信息（如果有）。
   *
   * 验证需求: 6.5
   */
  describe('属性 26: 任务执行历史记录', () => {
    it('成功的任务执行应该创建历史记录', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1, maxLength: 100 }), async (messageContent) => {
          // 先创建一个任务
          const task = await taskService.createTask({
            type: 'group_posting',
            accountIds: ['test-account'],
            targetIds: ['test-target'],
            config: {
              interval: 10,
            },
          });

          // 创建成功的执行记录
          const execution = taskExecutionDao.create({
            taskId: task.id,
            executedAt: new Date(),
            success: true,
            messageContent,
            accountId: 'test-account',
            targetId: 'test-target',
            retryCount: 0,
          });

          // 验证记录已创建
          expect(execution).toBeDefined();
          expect(execution.id).toBeDefined();
          expect(execution.taskId).toBe(task.id);
          expect(execution.success).toBe(true);
          expect(execution.messageContent).toBe(messageContent);
          expect(execution.retryCount).toBe(0);
          expect(execution.executedAt).toBeInstanceOf(Date);
          expect(execution.errorMessage).toBeUndefined();

          // 验证可以查询到记录
          const found = taskExecutionDao.findById(execution.id);
          expect(found).toBeDefined();
          expect(found!.id).toBe(execution.id);
          expect(found!.success).toBe(true);
        }),
        { numRuns: 10 }
      );
    });

    it('失败的任务执行应该创建包含错误信息的历史记录', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.integer({ min: 0, max: 5 }),
          async (messageContent, errorMessage, retryCount) => {
            // 先创建一个任务
            const task = await taskService.createTask({
              type: 'group_posting',
              accountIds: ['test-account'],
              targetIds: ['test-target'],
              config: {
                interval: 10,
              },
            });

            // 创建失败的执行记录
            const execution = taskExecutionDao.create({
              taskId: task.id,
              executedAt: new Date(),
              success: false,
              messageContent,
              errorMessage,
              accountId: 'test-account',
              targetId: 'test-target',
              retryCount,
            });

            // 验证记录已创建
            expect(execution).toBeDefined();
            expect(execution.id).toBeDefined();
            expect(execution.taskId).toBe(task.id);
            expect(execution.success).toBe(false);
            expect(execution.errorMessage).toBe(errorMessage);
            expect(execution.retryCount).toBe(retryCount);

            // 验证可以查询到记录
            const found = taskExecutionDao.findById(execution.id);
            expect(found).toBeDefined();
            expect(found!.success).toBe(false);
            expect(found!.errorMessage).toBe(errorMessage);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('可以按任务ID查询执行历史记录', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (executionCount) => {
          // 创建一个任务
          const task = await taskService.createTask({
            type: 'group_posting',
            accountIds: ['test-account'],
            targetIds: ['test-target'],
            config: {
              interval: 10,
            },
          });

          // 创建多条执行记录
          for (let i = 0; i < executionCount; i++) {
            taskExecutionDao.create({
              taskId: task.id,
              executedAt: new Date(Date.now() + i * 1000),
              success: i % 2 === 0,
              messageContent: `消息内容 ${i}`,
              accountId: 'test-account',
              targetId: 'test-target',
              retryCount: i % 3,
            });
          }

          // 按任务ID查询
          const foundExecutions = taskExecutionDao.findByTaskId(task.id);

          // 验证查询结果
          expect(foundExecutions.length).toBe(executionCount);

          // 验证所有记录的taskId正确
          for (const execution of foundExecutions) {
            expect(execution.taskId).toBe(task.id);
          }
        }),
        { numRuns: 10 }
      );
    });

    it('执行历史记录应该包含重试次数信息', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 0, max: 5 }), async (retryCount) => {
          // 创建一个任务
          const task = await taskService.createTask({
            type: 'group_posting',
            accountIds: ['test-account'],
            targetIds: ['test-target'],
            config: {
              interval: 10,
            },
          });

          // 创建执行记录
          const execution = taskExecutionDao.create({
            taskId: task.id,
            executedAt: new Date(),
            success: retryCount === 0,
            messageContent: '测试消息',
            errorMessage: retryCount > 0 ? '重试后仍然失败' : undefined,
            accountId: 'test-account',
            targetId: 'test-target',
            retryCount,
          });

          // 验证重试次数
          expect(execution.retryCount).toBe(retryCount);

          // 查询并验证
          const found = taskExecutionDao.findById(execution.id);
          expect(found).toBeDefined();
          expect(found!.retryCount).toBe(retryCount);
        }),
        { numRuns: 10 }
      );
    });

    it('可以查询任务的执行统计信息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 0, max: 5 }),
          async (successCount, failureCount) => {
            // 创建一个任务
            const task = await taskService.createTask({
              type: 'group_posting',
              accountIds: ['test-account'],
              targetIds: ['test-target'],
              config: {
                interval: 10,
              },
            });

            // 创建成功的执行记录
            for (let i = 0; i < successCount; i++) {
              taskExecutionDao.create({
                taskId: task.id,
                executedAt: new Date(Date.now() + i * 1000),
                success: true,
                messageContent: `成功消息 ${i}`,
                accountId: 'test-account',
                targetId: 'test-target',
                retryCount: 0,
              });
            }

            // 创建失败的执行记录
            for (let i = 0; i < failureCount; i++) {
              taskExecutionDao.create({
                taskId: task.id,
                executedAt: new Date(Date.now() + (successCount + i) * 1000),
                success: false,
                messageContent: `失败消息 ${i}`,
                errorMessage: '执行失败',
                accountId: 'test-account',
                targetId: 'test-target',
                retryCount: i % 3,
              });
            }

            // 查询统计信息
            const stats = taskExecutionDao.getTaskStats(task.id);

            // 验证统计信息
            expect(stats.totalExecutions).toBe(successCount + failureCount);
            expect(stats.successCount).toBe(successCount);
            expect(stats.failureCount).toBe(failureCount);

            // 验证成功率
            const expectedSuccessRate = successCount / (successCount + failureCount);
            expect(stats.successRate).toBeCloseTo(expectedSuccessRate, 5);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('执行历史记录应该持久化到数据库', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1, maxLength: 100 }), async (messageContent) => {
          // 创建一个任务
          const task = await taskService.createTask({
            type: 'group_posting',
            accountIds: ['test-account'],
            targetIds: ['test-target'],
            config: {
              interval: 10,
            },
          });

          // 创建执行记录
          const execution = taskExecutionDao.create({
            taskId: task.id,
            executedAt: new Date(),
            success: true,
            messageContent,
            accountId: 'test-account',
            targetId: 'test-target',
            retryCount: 0,
          });

          // 直接从数据库查询（不通过DAO缓存）
          const row = db
            .prepare('SELECT * FROM task_executions WHERE id = ?')
            .get(execution.id) as any;

          // 验证数据已持久化
          expect(row).toBeDefined();
          expect(row.id).toBe(execution.id);
          expect(row.task_id).toBe(task.id);
          expect(row.success).toBe(1); // SQLite中boolean存储为0/1
          expect(row.message_content).toBe(messageContent);
          expect(row.retry_count).toBe(0);
        }),
        { numRuns: 10 }
      );
    });
  });
});
