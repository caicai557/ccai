import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { TaskService } from './TaskService';
import { initSchema } from '../../database/schema';
import { runMigrations } from '../../database/migrations';
import { DaoFactory } from '../../database/dao';
import { CreateTaskDto } from '../../types/task';
import { ClientPool } from '../../telegram/ClientPool';

/**
 * Feature: telegram-content-manager
 * 属性 5: 任务配置验证
 * 验证需求: 2.1, 3.1, 6.2
 *
 * 属性 6: 发送间隔最小值验证
 * 验证需求: 2.2
 */

describe('TaskService Config Property Tests', () => {
  let db: Database.Database;
  let service: TaskService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    runMigrations(db);

    // 初始化 DaoFactory
    DaoFactory.initialize(db);

    service = new TaskService(db);
  });

  afterEach(async () => {
    // 停止所有运行中的任务，清理 cron 任务和监听器
    await service.stopAllTasks();

    // 清理 ClientPool 的定时器
    const clientPool = ClientPool.getInstance();
    clientPool.stopBackgroundTasks();

    db.close();
  });

  /**
   * 属性 5: 任务配置验证
   * 对于任何任务创建请求，如果缺少必需字段（账号ID、目标ID、模板ID），
   * 系统应该拒绝创建并返回验证错误。
   */
  describe('Property 5: 任务配置验证', () => {
    it('缺少任务类型应拒绝创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            config: fc.record({
              interval: fc.integer({ min: 10, max: 1440 }),
              randomDelay: fc.integer({ min: 0, max: 60 }),
            }),
          }),
          async (input) => {
            // 尝试创建没有类型的任务
            await expect(service.createTask(input as any)).rejects.toThrow('任务类型不能为空');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('缺少账号ID列表应拒绝创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            type: fc.constantFrom('group_posting', 'channel_monitoring'),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            config: fc.record({
              interval: fc.integer({ min: 10, max: 1440 }),
              randomDelay: fc.integer({ min: 0, max: 60 }),
            }),
          }),
          async (input) => {
            // 尝试创建没有账号ID的任务
            await expect(service.createTask(input as any)).rejects.toThrow('账号ID列表不能为空');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('账号ID列表为空应拒绝创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            type: fc.constantFrom('group_posting', 'channel_monitoring'),
            accountIds: fc.constant([]),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            config: fc.record({
              interval: fc.integer({ min: 10, max: 1440 }),
              randomDelay: fc.integer({ min: 0, max: 60 }),
            }),
          }),
          async (input) => {
            // 尝试创建空账号ID列表的任务
            await expect(service.createTask(input as any)).rejects.toThrow('账号ID列表不能为空');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('缺少目标ID列表应拒绝创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            type: fc.constantFrom('group_posting', 'channel_monitoring'),
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            config: fc.record({
              interval: fc.integer({ min: 10, max: 1440 }),
              randomDelay: fc.integer({ min: 0, max: 60 }),
            }),
          }),
          async (input) => {
            // 尝试创建没有目标ID的任务
            await expect(service.createTask(input as any)).rejects.toThrow('目标ID列表不能为空');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('目标ID列表为空应拒绝创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            type: fc.constantFrom('group_posting', 'channel_monitoring'),
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            targetIds: fc.constant([]),
            config: fc.record({
              interval: fc.integer({ min: 10, max: 1440 }),
              randomDelay: fc.integer({ min: 0, max: 60 }),
            }),
          }),
          async (input) => {
            // 尝试创建空目标ID列表的任务
            await expect(service.createTask(input as any)).rejects.toThrow('目标ID列表不能为空');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('缺少任务配置应拒绝创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            type: fc.constantFrom('group_posting', 'channel_monitoring'),
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
          }),
          async (input) => {
            // 尝试创建没有配置的任务
            await expect(service.createTask(input as any)).rejects.toThrow('任务配置不能为空');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('有效的任务配置应成功创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            type: fc.constantFrom('group_posting', 'channel_monitoring'),
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            config: fc.record({
              interval: fc.integer({ min: 10, max: 1440 }),
              randomDelay: fc.integer({ min: 0, max: 60 }),
              retryOnError: fc.boolean(),
              maxRetries: fc.integer({ min: 1, max: 10 }),
            }),
          }),
          async (input) => {
            // 创建有效的任务
            const task = await service.createTask(input);

            // 验证任务创建成功
            expect(task).toBeDefined();
            expect(task.id).toBeDefined();
            expect(task.type).toBe(input.type);
            expect(task.accountIds).toEqual(input.accountIds);
            expect(task.targetIds).toEqual(input.targetIds);
            expect(task.config).toEqual(input.config);
            expect(task.status).toBe('stopped');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 属性 6: 发送间隔最小值验证
   * 对于任何发送任务配置，如果间隔时间小于10分钟，
   * 系统应该拒绝配置并返回错误。
   */
  describe('Property 6: 发送间隔最小值验证', () => {
    it('群组发送任务间隔小于10分钟应拒绝创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            config: fc.record({
              interval: fc.integer({ min: -100, max: 9 }),
              randomDelay: fc.integer({ min: 0, max: 60 }),
            }),
          }),
          async (input) => {
            const dto: CreateTaskDto = {
              type: 'group_posting',
              ...input,
            };

            // 尝试创建间隔小于10分钟的任务
            await expect(service.createTask(dto)).rejects.toThrow('发送间隔不能少于10分钟');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('群组发送任务间隔等于10分钟应成功创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            config: fc.record({
              interval: fc.constant(10),
              randomDelay: fc.integer({ min: 0, max: 60 }),
            }),
          }),
          async (input) => {
            const dto: CreateTaskDto = {
              type: 'group_posting',
              ...input,
            };

            // 创建间隔等于10分钟的任务
            const task = await service.createTask(dto);

            // 验证任务创建成功
            expect(task).toBeDefined();
            expect(task.config.interval).toBe(10);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('群组发送任务间隔大于10分钟应成功创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            config: fc.record({
              interval: fc.integer({ min: 11, max: 1440 }),
              randomDelay: fc.integer({ min: 0, max: 60 }),
            }),
          }),
          async (input) => {
            const dto: CreateTaskDto = {
              type: 'group_posting',
              ...input,
            };

            // 创建间隔大于10分钟的任务
            const task = await service.createTask(dto);

            // 验证任务创建成功
            expect(task).toBeDefined();
            expect(task.config.interval).toBeGreaterThanOrEqual(11);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('频道监听任务不受间隔限制', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            config: fc.record({
              interval: fc.integer({ min: 0, max: 9 }),
              randomDelay: fc.integer({ min: 0, max: 60 }),
              commentProbability: fc.double({ min: 0, max: 1 }).filter((n) => !isNaN(n)),
            }),
          }),
          async (input) => {
            const dto: CreateTaskDto = {
              type: 'channel_monitoring',
              ...input,
            };

            // 频道监听任务不检查间隔限制，应该成功创建
            const task = await service.createTask(dto);

            // 验证任务创建成功
            expect(task).toBeDefined();
            expect(task.type).toBe('channel_monitoring');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('更新群组发送任务时间隔小于10分钟应拒绝', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            initialInterval: fc.integer({ min: 10, max: 100 }),
            updateInterval: fc.integer({ min: -100, max: 9 }),
          }),
          async (input) => {
            // 创建有效的任务
            const task = await service.createTask({
              type: 'group_posting',
              accountIds: input.accountIds,
              targetIds: input.targetIds,
              config: {
                interval: input.initialInterval,
                randomDelay: 0,
              },
            });

            // 尝试更新为小于10分钟的间隔
            await expect(
              service.updateTask(task.id, {
                config: {
                  interval: input.updateInterval,
                  randomDelay: 0,
                },
              })
            ).rejects.toThrow('发送间隔不能少于10分钟');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外的配置验证测试
   */
  describe('Additional Config Validation', () => {
    it('评论概率超出范围应拒绝创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            commentProbability: fc
              .oneof(fc.double({ min: 1.01, max: 100 }), fc.double({ min: -100, max: -0.01 }))
              .filter((n) => !isNaN(n)),
          }),
          async (input) => {
            const dto: CreateTaskDto = {
              type: 'channel_monitoring',
              accountIds: input.accountIds,
              targetIds: input.targetIds,
              config: {
                interval: 10,
                randomDelay: 0,
                commentProbability: input.commentProbability,
              },
            };

            // 尝试创建评论概率超出范围的任务
            await expect(service.createTask(dto)).rejects.toThrow('评论概率必须在0-1之间');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('评论概率在0-1范围内应成功创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            commentProbability: fc.double({ min: 0, max: 1 }).filter((n) => !isNaN(n)),
          }),
          async (input) => {
            const dto: CreateTaskDto = {
              type: 'channel_monitoring',
              accountIds: input.accountIds,
              targetIds: input.targetIds,
              config: {
                interval: 10,
                randomDelay: 0,
                commentProbability: input.commentProbability,
              },
            };

            // 创建有效的任务
            const task = await service.createTask(dto);

            // 验证任务创建成功
            expect(task).toBeDefined();
            expect(task.config.commentProbability).toBeGreaterThanOrEqual(0);
            expect(task.config.commentProbability).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('随机延迟为负数应拒绝创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            randomDelay: fc.integer({ min: -1000, max: -1 }),
          }),
          async (input) => {
            const dto: CreateTaskDto = {
              type: 'group_posting',
              accountIds: input.accountIds,
              targetIds: input.targetIds,
              config: {
                interval: 10,
                randomDelay: input.randomDelay,
              },
            };

            // 尝试创建负数随机延迟的任务
            await expect(service.createTask(dto)).rejects.toThrow('随机延迟不能为负数');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('时间范围格式无效应拒绝创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            invalidTime: fc.oneof(
              fc.constant('25:00'), // 小时超出范围
              fc.constant('12:60'), // 分钟超出范围
              fc.constant('12:5'), // 格式错误
              fc.constant('1:30'), // 格式错误
              fc.constant('abc'), // 完全无效
              fc.constant('12-30') // 分隔符错误
            ),
          }),
          async (input) => {
            const dto: CreateTaskDto = {
              type: 'group_posting',
              accountIds: input.accountIds,
              targetIds: input.targetIds,
              config: {
                interval: 10,
                randomDelay: 0,
                timeRange: {
                  start: input.invalidTime,
                  end: '23:59',
                },
              },
            };

            // 尝试创建无效时间范围的任务
            await expect(service.createTask(dto)).rejects.toThrow(/时间格式无效/);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('有效的时间范围应成功创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            accountIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            targetIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
            startHour: fc.integer({ min: 0, max: 23 }),
            startMinute: fc.integer({ min: 0, max: 59 }),
            endHour: fc.integer({ min: 0, max: 23 }),
            endMinute: fc.integer({ min: 0, max: 59 }),
          }),
          async (input) => {
            const startTime = `${String(input.startHour).padStart(2, '0')}:${String(input.startMinute).padStart(2, '0')}`;
            const endTime = `${String(input.endHour).padStart(2, '0')}:${String(input.endMinute).padStart(2, '0')}`;

            const dto: CreateTaskDto = {
              type: 'group_posting',
              accountIds: input.accountIds,
              targetIds: input.targetIds,
              config: {
                interval: 10,
                randomDelay: 0,
                timeRange: {
                  start: startTime,
                  end: endTime,
                },
              },
            };

            // 创建有效时间范围的任务
            const task = await service.createTask(dto);

            // 验证任务创建成功
            expect(task).toBeDefined();
            expect(task.config.timeRange).toBeDefined();
            expect(task.config.timeRange!.start).toBe(startTime);
            expect(task.config.timeRange!.end).toBe(endTime);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
