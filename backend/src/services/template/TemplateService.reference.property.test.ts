import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { TemplateService } from './TemplateService';
import { initSchema } from '../../database/schema';
import { runMigrations } from '../../database/migrations';

/**
 * Feature: telegram-content-manager
 * 属性 16: 模板引用完整性
 * 验证需求: 4.4
 *
 * 属性 18: 模板使用计数递增
 * 验证需求: 4.6
 */

describe('TemplateService Reference Property Tests', () => {
  let db: Database.Database;
  let service: TemplateService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    runMigrations(db);
    service = new TemplateService(db);
  });

  afterEach(() => {
    db.close();
  });

  /**
   * 属性 16: 模板引用完整性
   * 对于任何被任务引用的模板，删除操作应该被拒绝，
   * 直到所有引用该模板的任务被删除或更改模板。
   */
  describe('Property 16: 模板引用完整性', () => {
    it('未被引用的模板应该可以删除', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 验证模板未被引用
            const isReferenced = await service.isTemplateReferenced(template.id);
            expect(isReferenced).toBe(false);

            // 删除应该成功
            await expect(service.deleteTemplate(template.id)).resolves.not.toThrow();

            // 验证模板已被删除
            const retrieved = await service.getTemplate(template.id);
            expect(retrieved).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('被任务引用的模板不应该被删除', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 创建一个引用该模板的任务
            const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const taskConfig = {
              type: 'group_posting',
              account_ids: JSON.stringify(['account1']),
              target_ids: JSON.stringify(['target1']),
              config: JSON.stringify({
                templateId: template.id,
                interval: 60,
              }),
              status: 'stopped',
            };

            const stmt = db.prepare(`
              INSERT INTO tasks (id, type, account_ids, target_ids, config, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const now = Date.now();
            stmt.run(
              taskId,
              taskConfig.type,
              taskConfig.account_ids,
              taskConfig.target_ids,
              taskConfig.config,
              taskConfig.status,
              now,
              now
            );

            // 验证模板被引用
            const isReferenced = await service.isTemplateReferenced(template.id);
            expect(isReferenced).toBe(true);

            // 尝试删除应该失败
            await expect(service.deleteTemplate(template.id)).rejects.toThrow(
              '模板正在被任务使用，无法删除'
            );

            // 验证模板仍然存在
            const retrieved = await service.getTemplate(template.id);
            expect(retrieved).not.toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('删除引用任务后，模板应该可以删除', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 创建一个引用该模板的任务
            const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const taskConfig = {
              type: 'group_posting',
              account_ids: JSON.stringify(['account1']),
              target_ids: JSON.stringify(['target1']),
              config: JSON.stringify({
                templateId: template.id,
                interval: 60,
              }),
              status: 'stopped',
            };

            const insertStmt = db.prepare(`
              INSERT INTO tasks (id, type, account_ids, target_ids, config, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const now = Date.now();
            insertStmt.run(
              taskId,
              taskConfig.type,
              taskConfig.account_ids,
              taskConfig.target_ids,
              taskConfig.config,
              taskConfig.status,
              now,
              now
            );

            // 验证模板被引用
            const isReferencedBefore = await service.isTemplateReferenced(template.id);
            expect(isReferencedBefore).toBe(true);

            // 删除任务
            const deleteStmt = db.prepare('DELETE FROM tasks WHERE id = ?');
            deleteStmt.run(taskId);

            // 验证模板不再被引用
            const isReferencedAfter = await service.isTemplateReferenced(template.id);
            expect(isReferencedAfter).toBe(false);

            // 现在删除应该成功
            await expect(service.deleteTemplate(template.id)).resolves.not.toThrow();

            // 验证模板已被删除
            const retrieved = await service.getTemplate(template.id);
            expect(retrieved).toBeNull();
          }
        ),
        { numRuns: 30 }
      );
    });

    it('多个任务引用同一模板时，删除应该失败', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
            weight: fc.integer({ min: 1, max: 100 }),
            taskCount: fc.integer({ min: 2, max: 5 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 创建多个引用该模板的任务
            const stmt = db.prepare(`
              INSERT INTO tasks (id, type, account_ids, target_ids, config, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (let i = 0; i < input.taskCount; i++) {
              const now = Date.now();
              const taskConfig = {
                type: 'group_posting',
                account_ids: JSON.stringify([`account${i}`]),
                target_ids: JSON.stringify([`target${i}`]),
                config: JSON.stringify({
                  templateId: template.id,
                  interval: 60,
                }),
                status: 'stopped',
              };

              stmt.run(
                `task-${now}-${i}-${Math.random().toString(36).substr(2, 9)}`,
                taskConfig.type,
                taskConfig.account_ids,
                taskConfig.target_ids,
                taskConfig.config,
                taskConfig.status,
                now,
                now
              );
            }

            // 验证模板被引用
            const isReferenced = await service.isTemplateReferenced(template.id);
            expect(isReferenced).toBe(true);

            // 尝试删除应该失败
            await expect(service.deleteTemplate(template.id)).rejects.toThrow(
              '模板正在被任务使用，无法删除'
            );
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * 属性 18: 模板使用计数递增
   * 对于任何模板，每次被用于生成消息后，其使用计数应该增加1。
   */
  describe('Property 18: 模板使用计数递增', () => {
    it('初始使用计数应该为0', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 验证初始使用计数为0
            const usageCount = await service.getUsageCount(template.id);
            expect(usageCount).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('每次生成内容后使用计数应该递增1', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 初始计数
            const initialCount = await service.getUsageCount(template.id);
            expect(initialCount).toBe(0);

            // 生成内容
            await service.generateContent(template.id);

            // 验证计数递增
            const afterFirstCount = await service.getUsageCount(template.id);
            expect(afterFirstCount).toBe(1);

            // 再次生成
            await service.generateContent(template.id);

            // 验证计数再次递增
            const afterSecondCount = await service.getUsageCount(template.id);
            expect(afterSecondCount).toBe(2);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('使用计数应该准确反映生成次数', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
            weight: fc.integer({ min: 1, max: 100 }),
            generateCount: fc.integer({ min: 1, max: 20 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 生成内容指定次数
            for (let i = 0; i < input.generateCount; i++) {
              await service.generateContent(template.id);
            }

            // 验证使用计数等于生成次数
            const usageCount = await service.getUsageCount(template.id);
            expect(usageCount).toBe(input.generateCount);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('手动递增使用计数应该正常工作', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
            weight: fc.integer({ min: 1, max: 100 }),
            incrementCount: fc.integer({ min: 1, max: 10 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 手动递增使用计数
            for (let i = 0; i < input.incrementCount; i++) {
              await service.incrementUsageCount(template.id);
            }

            // 验证使用计数
            const usageCount = await service.getUsageCount(template.id);
            expect(usageCount).toBe(input.incrementCount);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('不同模板的使用计数应该独立', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            template1: fc.record({
              category: fc.constantFrom('group_message', 'channel_comment'),
              content: fc
                .string({ minLength: 1, maxLength: 100 })
                .filter((s) => s.trim().length > 0),
              weight: fc.integer({ min: 1, max: 100 }),
              generateCount: fc.integer({ min: 1, max: 10 }),
            }),
            template2: fc.record({
              category: fc.constantFrom('group_message', 'channel_comment'),
              content: fc
                .string({ minLength: 1, maxLength: 100 })
                .filter((s) => s.trim().length > 0),
              weight: fc.integer({ min: 1, max: 100 }),
              generateCount: fc.integer({ min: 1, max: 10 }),
            }),
          }),
          async (input) => {
            // 创建两个模板
            const t1 = await service.createTemplate(input.template1);
            const t2 = await service.createTemplate(input.template2);

            // 分别生成内容
            for (let i = 0; i < input.template1.generateCount; i++) {
              await service.generateContent(t1.id);
            }
            for (let i = 0; i < input.template2.generateCount; i++) {
              await service.generateContent(t2.id);
            }

            // 验证各自的使用计数
            const count1 = await service.getUsageCount(t1.id);
            const count2 = await service.getUsageCount(t2.id);

            expect(count1).toBe(input.template1.generateCount);
            expect(count2).toBe(input.template2.generateCount);
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
