import Database from 'better-sqlite3';
import * as fc from 'fast-check';
import { TaskService } from './TaskService';
import { initSchema } from '../../database/schema';
import { runMigrations } from '../../database/migrations';
import { DaoFactory } from '../../database/dao';
import { ClientPool } from '../../telegram/ClientPool';
import { CreateTaskDto } from '../../types/task';
import { TargetAccessCheckInput, TargetAccessCheckResult } from '../target/TargetAccessService';

/**
 * 属性测试：任务状态管理
 * Feature: telegram-content-manager
 */
describe('TaskService - 任务状态属性测试', () => {
  let db: Database.Database;
  let taskService: TaskService;

  const createMockTargetAccessService = (): {
    checkAndPrepare: (input: TargetAccessCheckInput) => Promise<TargetAccessCheckResult>;
  } => ({
    checkAndPrepare: async (input: TargetAccessCheckInput): Promise<TargetAccessCheckResult> => ({
      readyPair: {
        accountId: input.accountId,
        targetId: input.targetId,
        telegramId: input.targetId,
      },
    }),
  });

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    runMigrations(db);

    // 初始化 DaoFactory
    DaoFactory.initialize(db);

    taskService = new TaskService(db, {
      targetAccessService: createMockTargetAccessService(),
    });
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
   * 属性 10: 任务状态转换有效性
   *
   * 对于任何任务，暂停操作后状态应该变为'stopped'，
   * 恢复操作后状态应该变为'running'，且状态转换应该被持久化。
   *
   * 验证需求: 2.8, 3.8
   */
  describe('属性 10: 任务状态转换有效性', () => {
    it('任务启动后状态应该变为running并持久化', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成任务配置
          fc.record({
            type: fc.constant('group_posting' as const),
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
            interval: fc.integer({ min: 10, max: 120 }),
            randomDelay: fc.integer({ min: 0, max: 10 }),
            commentProbability: fc.double({ min: 0, max: 1 }),
          }),
          async (taskConfig) => {
            // 创建任务
            const task = await taskService.createTask({
              type: taskConfig.type as 'group_posting' | 'channel_monitoring',
              accountIds: taskConfig.accountIds,
              targetIds: taskConfig.targetIds,
              config: {
                interval: taskConfig.interval,
                randomDelay: taskConfig.randomDelay,
                commentProbability: taskConfig.commentProbability,
              },
            });

            // 验证初始状态
            expect(task.status).toBe('stopped');

            // 启动任务
            await taskService.startTask(task.id);

            // 验证状态已更新
            const runningTask = await taskService.getTask(task.id);
            expect(runningTask).not.toBeNull();
            expect(runningTask!.status).toBe('running');

            // 验证状态持久化（通过重新查询数据库）
            const persistedTask = await taskService.getTask(task.id);
            expect(persistedTask).not.toBeNull();
            expect(persistedTask!.status).toBe('running');

            // 清理：停止任务
            await taskService.stopTask(task.id);
          }
        ),
        { numRuns: 20 } // 减少运行次数以加快测试
      );
    });

    it('任务暂停后状态应该变为stopped并持久化', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成任务配置
          fc.record({
            type: fc.constant('group_posting' as const),
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
            interval: fc.integer({ min: 10, max: 120 }),
            randomDelay: fc.integer({ min: 0, max: 10 }),
            commentProbability: fc.double({ min: 0, max: 1 }),
          }),
          async (taskConfig) => {
            // 创建任务
            const task = await taskService.createTask({
              type: taskConfig.type as 'group_posting' | 'channel_monitoring',
              accountIds: taskConfig.accountIds,
              targetIds: taskConfig.targetIds,
              config: {
                interval: taskConfig.interval,
                randomDelay: taskConfig.randomDelay,
                commentProbability: taskConfig.commentProbability,
              },
            });

            // 启动任务
            await taskService.startTask(task.id);

            // 验证运行状态
            const runningTask = await taskService.getTask(task.id);
            expect(runningTask!.status).toBe('running');

            // 暂停任务
            await taskService.pauseTask(task.id);

            // 验证状态已更新为stopped
            const pausedTask = await taskService.getTask(task.id);
            expect(pausedTask).not.toBeNull();
            expect(pausedTask!.status).toBe('stopped');

            // 验证状态持久化
            const persistedTask = await taskService.getTask(task.id);
            expect(persistedTask).not.toBeNull();
            expect(persistedTask!.status).toBe('stopped');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('任务停止后状态应该变为stopped并持久化', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成任务配置
          fc.record({
            type: fc.constant('group_posting' as const),
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
            interval: fc.integer({ min: 10, max: 120 }),
            randomDelay: fc.integer({ min: 0, max: 10 }),
            commentProbability: fc.double({ min: 0, max: 1 }),
          }),
          async (taskConfig) => {
            // 创建任务
            const task = await taskService.createTask({
              type: taskConfig.type as 'group_posting' | 'channel_monitoring',
              accountIds: taskConfig.accountIds,
              targetIds: taskConfig.targetIds,
              config: {
                interval: taskConfig.interval,
                randomDelay: taskConfig.randomDelay,
                commentProbability: taskConfig.commentProbability,
              },
            });

            // 启动任务
            await taskService.startTask(task.id);

            // 验证运行状态
            const runningTask = await taskService.getTask(task.id);
            expect(runningTask!.status).toBe('running');

            // 停止任务
            await taskService.stopTask(task.id);

            // 验证状态已更新为stopped
            const stoppedTask = await taskService.getTask(task.id);
            expect(stoppedTask).not.toBeNull();
            expect(stoppedTask!.status).toBe('stopped');

            // 验证状态持久化
            const persistedTask = await taskService.getTask(task.id);
            expect(persistedTask).not.toBeNull();
            expect(persistedTask!.status).toBe('stopped');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('任务可以在stopped和running状态之间多次切换', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成任务配置
          fc.record({
            type: fc.constant('group_posting' as const),
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
            interval: fc.integer({ min: 10, max: 120 }),
            randomDelay: fc.integer({ min: 0, max: 10 }),
            commentProbability: fc.double({ min: 0, max: 1 }),
          }),
          // 生成切换次数
          fc.integer({ min: 2, max: 5 }),
          async (taskConfig, switchCount) => {
            // 创建任务
            const task = await taskService.createTask({
              type: taskConfig.type as 'group_posting' | 'channel_monitoring',
              accountIds: taskConfig.accountIds,
              targetIds: taskConfig.targetIds,
              config: {
                interval: taskConfig.interval,
                randomDelay: taskConfig.randomDelay,
                commentProbability: taskConfig.commentProbability,
              },
            });

            // 多次切换状态
            for (let i = 0; i < switchCount; i++) {
              // 启动
              await taskService.startTask(task.id);
              let currentTask = await taskService.getTask(task.id);
              expect(currentTask!.status).toBe('running');

              // 停止
              await taskService.stopTask(task.id);
              currentTask = await taskService.getTask(task.id);
              expect(currentTask!.status).toBe('stopped');
            }

            // 最终验证状态持久化
            const finalTask = await taskService.getTask(task.id);
            expect(finalTask).not.toBeNull();
            expect(finalTask!.status).toBe('stopped');
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * 属性 27: 任务状态持久化恢复
   *
   * 对于任何状态为'running'的任务，系统重启后应该自动恢复该任务的执行。
   *
   * 验证需求: 6.6
   */
  describe('属性 27: 任务状态持久化恢复', () => {
    it('running状态的任务在系统重启后应该被恢复', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成多个任务配置
          fc.array(
            fc.record({
              type: fc.constant('group_posting' as const),
              accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
              targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
              interval: fc.integer({ min: 10, max: 120 }),
              randomDelay: fc.integer({ min: 0, max: 10 }),
              commentProbability: fc.double({ min: 0, max: 1 }),
              shouldBeRunning: fc.boolean(),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (taskConfigs) => {
            const createdTasks = [];

            // 创建任务并根据配置启动
            for (const config of taskConfigs) {
              const task = await taskService.createTask({
                type: config.type as 'group_posting' | 'channel_monitoring',
                accountIds: config.accountIds,
                targetIds: config.targetIds,
                config: {
                  interval: config.interval,
                  randomDelay: config.randomDelay,
                  commentProbability: config.commentProbability,
                },
              });

              if (config.shouldBeRunning) {
                await taskService.startTask(task.id);
              }

              createdTasks.push({ id: task.id, shouldBeRunning: config.shouldBeRunning });
            }

            // 验证任务状态
            for (const { id, shouldBeRunning } of createdTasks) {
              const task = await taskService.getTask(id);
              expect(task).not.toBeNull();
              expect(task!.status).toBe(shouldBeRunning ? 'running' : 'stopped');
            }

            // 停止所有任务（模拟系统关闭）
            await taskService.stopAllTasks();

            // 验证所有任务都已停止
            for (const { id } of createdTasks) {
              const task = await taskService.getTask(id);
              expect(task!.status).toBe('stopped');
            }

            // 手动将应该运行的任务状态设置回running（模拟数据库中的持久化状态）
            const runningTaskIds = createdTasks.filter((t) => t.shouldBeRunning).map((t) => t.id);

            for (const id of runningTaskIds) {
              // 直接更新数据库状态（模拟系统重启前的状态）
              db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('running', id);
            }

            // 创建新的TaskService实例（模拟系统重启）
            const newTaskService = new TaskService(db, {
              targetAccessService: createMockTargetAccessService(),
            });

            // 恢复运行中的任务
            await newTaskService.restoreRunningTasks();

            // 验证应该运行的任务已被恢复
            const restoredRunningTasks = await newTaskService.getTasksByStatus('running');
            expect(restoredRunningTasks.length).toBe(runningTaskIds.length);

            // 验证恢复的任务ID正确
            const restoredIds = restoredRunningTasks.map((t) => t.id).sort();
            const expectedIds = runningTaskIds.sort();
            expect(restoredIds).toEqual(expectedIds);

            // 清理：停止所有任务
            await newTaskService.stopAllTasks();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('stopped状态的任务在系统重启后不应该被恢复', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成多个stopped状态的任务
          fc.array(
            fc.record({
              type: fc.constant('group_posting' as const),
              accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
              targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
              interval: fc.integer({ min: 10, max: 120 }),
              randomDelay: fc.integer({ min: 0, max: 10 }),
              commentProbability: fc.double({ min: 0, max: 1 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (taskConfigs) => {
            const createdTaskIds = [];

            // 创建任务（不启动）
            for (const config of taskConfigs) {
              const task = await taskService.createTask({
                type: config.type as 'group_posting' | 'channel_monitoring',
                accountIds: config.accountIds,
                targetIds: config.targetIds,
                config: {
                  interval: config.interval,
                  randomDelay: config.randomDelay,
                  commentProbability: config.commentProbability,
                },
              });

              createdTaskIds.push(task.id);
            }

            // 验证所有任务都是stopped状态
            for (const id of createdTaskIds) {
              const task = await taskService.getTask(id);
              expect(task!.status).toBe('stopped');
            }

            // 创建新的TaskService实例（模拟系统重启）
            const newTaskService = new TaskService(db, {
              targetAccessService: createMockTargetAccessService(),
            });

            // 恢复运行中的任务
            await newTaskService.restoreRunningTasks();

            // 验证没有任务被恢复（因为都是stopped状态）
            const restoredRunningTasks = await newTaskService.getTasksByStatus('running');
            expect(restoredRunningTasks.length).toBe(0);

            // 验证所有任务仍然是stopped状态
            for (const id of createdTaskIds) {
              const task = await newTaskService.getTask(id);
              expect(task).not.toBeNull();
              expect(task!.status).toBe('stopped');
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('混合状态的任务在系统重启后只恢复running状态的任务', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成running任务数量
          fc.integer({ min: 1, max: 3 }),
          // 生成stopped任务数量
          fc.integer({ min: 1, max: 3 }),
          // 任务配置生成器
          fc.record({
            type: fc.constant('group_posting' as const),
            interval: fc.integer({ min: 10, max: 120 }),
            randomDelay: fc.integer({ min: 0, max: 10 }),
            commentProbability: fc.double({ min: 0, max: 1 }),
          }),
          async (runningCount, stoppedCount, baseConfig) => {
            const runningTaskIds: string[] = [];
            const stoppedTaskIds: string[] = [];

            // 创建running状态的任务
            for (let i = 0; i < runningCount; i++) {
              const task = await taskService.createTask({
                type: baseConfig.type as 'group_posting' | 'channel_monitoring',
                accountIds: [`account-running-${i}`],
                targetIds: [`target-running-${i}`],
                config: {
                  interval: baseConfig.interval,
                  randomDelay: baseConfig.randomDelay,
                  commentProbability: baseConfig.commentProbability,
                },
              });

              await taskService.startTask(task.id);
              runningTaskIds.push(task.id);
            }

            // 创建stopped状态的任务
            for (let i = 0; i < stoppedCount; i++) {
              const task = await taskService.createTask({
                type: baseConfig.type as 'group_posting' | 'channel_monitoring',
                accountIds: [`account-stopped-${i}`],
                targetIds: [`target-stopped-${i}`],
                config: {
                  interval: baseConfig.interval,
                  randomDelay: baseConfig.randomDelay,
                  commentProbability: baseConfig.commentProbability,
                },
              });

              stoppedTaskIds.push(task.id);
            }

            // 验证初始状态
            for (const id of runningTaskIds) {
              const task = await taskService.getTask(id);
              expect(task!.status).toBe('running');
            }

            for (const id of stoppedTaskIds) {
              const task = await taskService.getTask(id);
              expect(task!.status).toBe('stopped');
            }

            // 停止所有任务
            await taskService.stopAllTasks();

            // 手动恢复running任务的状态（模拟数据库持久化）
            for (const id of runningTaskIds) {
              db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('running', id);
            }

            // 创建新的TaskService实例（模拟系统重启）
            const newTaskService = new TaskService(db, {
              targetAccessService: createMockTargetAccessService(),
            });

            // 恢复运行中的任务
            await newTaskService.restoreRunningTasks();

            // 验证只有running状态的任务被恢复
            const restoredRunningTasks = await newTaskService.getTasksByStatus('running');
            expect(restoredRunningTasks.length).toBe(runningCount);

            const restoredIds = restoredRunningTasks.map((t) => t.id).sort();
            const expectedIds = runningTaskIds.sort();
            expect(restoredIds).toEqual(expectedIds);

            // 验证stopped任务仍然是stopped状态
            for (const id of stoppedTaskIds) {
              const task = await newTaskService.getTask(id);
              expect(task).not.toBeNull();
              expect(task!.status).toBe('stopped');
            }

            // 清理
            await newTaskService.stopAllTasks();
          }
        ),
        { numRuns: 15 }
      );
    });
  });
});
