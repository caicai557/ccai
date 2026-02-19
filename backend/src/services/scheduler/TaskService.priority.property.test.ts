import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { TaskService } from './TaskService';
import { CreateTaskDto } from '../../types/task';
import { initSchema } from '../../database/schema';
import { runMigrations } from '../../database/migrations';
import { DaoFactory } from '../../database/dao';
import { ClientPool } from '../../telegram/ClientPool';
import { TargetAccessCheckInput, TargetAccessCheckResult } from '../target/TargetAccessService';

/**
 * 属性测试：任务优先级排序
 * Feature: telegram-content-manager, Property 28: 任务优先级排序
 *
 * 验证需求: 6.8
 *
 * 属性：对于任何同时到期的多个任务，执行顺序应该按照优先级从高到低排列
 */
describe('TaskService - 属性 28: 任务优先级排序', () => {
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
    // 使用内存数据库
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
   * 属性：当多个任务同时到期时，应该按优先级从高到低排序
   */
  it('应该按优先级从高到低排序同时到期的任务', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成3-10个任务，每个任务有不同的优先级
        fc.array(
          fc.record({
            priority: fc.integer({ min: 1, max: 10 }),
            accountId: fc.uuid(),
            targetId: fc.uuid(),
            interval: fc.integer({ min: 10, max: 60 }),
          }),
          { minLength: 3, maxLength: 10 }
        ),
        async (taskConfigs) => {
          // 创建所有任务，设置相同的 nextRunAt（模拟同时到期）
          const pastTime = new Date(Date.now() - 1000); // 1秒前
          const createdTasks = [];

          for (const config of taskConfigs) {
            const dto: CreateTaskDto = {
              type: 'group_posting',
              accountIds: [config.accountId],
              targetIds: [config.targetId],
              config: {
                interval: config.interval,
                randomDelay: 0,
              },
              priority: config.priority,
            };

            const task = await taskService.createTask(dto);

            // 启动任务（这会设置 nextRunAt）
            await taskService.startTask(task.id);

            // 手动设置 nextRunAt 为过去时间（模拟已到期）
            const taskDao = (taskService as any).taskDao;
            taskDao.updateNextRunAt(task.id, pastTime);

            createdTasks.push({ id: task.id, priority: config.priority });
          }

          // 获取到期的任务
          const taskDao = (taskService as any).taskDao;
          const dueTasks = taskDao.findDueTasks();

          // 验证：返回的任务数量应该等于创建的任务数量
          expect(dueTasks.length).toBe(createdTasks.length);

          // 验证：任务应该按优先级从高到低排序
          for (let i = 0; i < dueTasks.length - 1; i++) {
            const currentPriority = dueTasks[i].priority;
            const nextPriority = dueTasks[i + 1].priority;

            // 当前任务的优先级应该 >= 下一个任务的优先级
            expect(currentPriority).toBeGreaterThanOrEqual(nextPriority);
          }

          // 验证：优先级最高的任务应该排在第一位
          const maxPriority = Math.max(...createdTasks.map((t) => t.priority));
          expect(dueTasks[0].priority).toBe(maxPriority);

          // 验证：优先级最低的任务应该排在最后
          const minPriority = Math.min(...createdTasks.map((t) => t.priority));
          expect(dueTasks[dueTasks.length - 1].priority).toBe(minPriority);

          // 清理：停止所有任务
          for (const task of createdTasks) {
            await taskService.stopTask(task.id);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性：相同优先级的任务应该按 nextRunAt 时间排序
   */
  it('相同优先级的任务应该按到期时间排序', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成3-5个相同优先级的任务
        fc.integer({ min: 1, max: 10 }),
        fc.array(
          fc.record({
            accountId: fc.uuid(),
            targetId: fc.uuid(),
            interval: fc.integer({ min: 10, max: 60 }),
            dueOffset: fc.integer({ min: -1000, max: -100 }), // 不同的到期时间偏移
          }),
          { minLength: 3, maxLength: 5 }
        ),
        async (priority, taskConfigs) => {
          const createdTasks = [];

          for (const config of taskConfigs) {
            const dto: CreateTaskDto = {
              type: 'group_posting',
              accountIds: [config.accountId],
              targetIds: [config.targetId],
              config: {
                interval: config.interval,
                randomDelay: 0,
              },
              priority: priority, // 所有任务使用相同优先级
            };

            const task = await taskService.createTask(dto);
            await taskService.startTask(task.id);

            // 设置不同的到期时间
            const dueTime = new Date(Date.now() + config.dueOffset);
            const taskDao = (taskService as any).taskDao;
            taskDao.updateNextRunAt(task.id, dueTime);

            createdTasks.push({
              id: task.id,
              priority: priority,
              dueTime: dueTime.getTime(),
            });
          }

          // 获取到期的任务
          const taskDao = (taskService as any).taskDao;
          const dueTasks = taskDao.findDueTasks();

          // 验证：所有任务优先级相同
          const priorities = dueTasks.map((t) => t.priority);
          expect(new Set(priorities).size).toBe(1);

          // 验证：相同优先级的任务按 nextRunAt 排序
          for (let i = 0; i < dueTasks.length - 1; i++) {
            if (dueTasks[i].priority === dueTasks[i + 1].priority) {
              const currentTime = dueTasks[i].nextRunAt?.getTime() || 0;
              const nextTime = dueTasks[i + 1].nextRunAt?.getTime() || 0;

              // 当前任务的到期时间应该 <= 下一个任务的到期时间
              expect(currentTime).toBeLessThanOrEqual(nextTime);
            }
          }

          // 清理
          for (const task of createdTasks) {
            await taskService.stopTask(task.id);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * 属性：优先级验证 - 只接受1-10范围内的值
   */
  it('应该只接受1-10范围内的优先级值', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        fc.uuid(),
        fc.uuid(),
        async (priority, accountId, targetId) => {
          const dto: CreateTaskDto = {
            type: 'group_posting',
            accountIds: [accountId],
            targetIds: [targetId],
            config: {
              interval: 10,
              randomDelay: 0,
            },
            priority: priority,
          };

          // 应该成功创建任务
          const task = await taskService.createTask(dto);

          // 验证：任务的优先级应该等于设置的值
          expect(task.priority).toBe(priority);

          // 验证：优先级在有效范围内
          expect(task.priority).toBeGreaterThanOrEqual(1);
          expect(task.priority).toBeLessThanOrEqual(10);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性：默认优先级应该为5
   */
  it('未指定优先级时应该使用默认值5', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), async (accountId, targetId) => {
        const dto: CreateTaskDto = {
          type: 'group_posting',
          accountIds: [accountId],
          targetIds: [targetId],
          config: {
            interval: 10,
            randomDelay: 0,
          },
          // 不指定 priority
        };

        const task = await taskService.createTask(dto);

        // 验证：默认优先级应该为5
        expect(task.priority).toBe(5);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * 属性：getAllTasks 应该按优先级排序
   */
  it('getAllTasks应该返回按优先级排序的任务列表', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            priority: fc.integer({ min: 1, max: 10 }),
            accountId: fc.uuid(),
            targetId: fc.uuid(),
          }),
          { minLength: 3, maxLength: 8 }
        ),
        async (taskConfigs) => {
          // 创建所有任务
          const createdTaskIds: string[] = [];
          for (const config of taskConfigs) {
            const dto: CreateTaskDto = {
              type: 'group_posting',
              accountIds: [config.accountId],
              targetIds: [config.targetId],
              config: {
                interval: 10,
                randomDelay: 0,
              },
              priority: config.priority,
            };

            const task = await taskService.createTask(dto);
            createdTaskIds.push(task.id);
          }

          try {
            // 获取所有任务
            const allTasks = await taskService.getAllTasks();
            const createdIdSet = new Set(createdTaskIds);
            const currentRunTasks = allTasks.filter((task) => createdIdSet.has(task.id));

            // 验证：任务数量正确（只统计当前 run 创建的任务）
            expect(currentRunTasks.length).toBe(taskConfigs.length);

            // 验证：任务按优先级从高到低排序
            for (let i = 0; i < currentRunTasks.length - 1; i++) {
              expect(currentRunTasks[i].priority).toBeGreaterThanOrEqual(
                currentRunTasks[i + 1].priority
              );
            }
          } finally {
            for (const taskId of createdTaskIds) {
              try {
                await taskService.deleteTask(taskId);
              } catch {
                // 忽略已删除任务
              }
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
