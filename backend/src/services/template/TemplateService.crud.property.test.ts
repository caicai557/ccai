import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { TemplateService } from './TemplateService';
import { initSchema } from '../../database/schema';
import { runMigrations } from '../../database/migrations';

/**
 * Feature: telegram-content-manager
 * 属性 14: 模板CRUD往返一致性
 * 验证需求: 4.1
 *
 * 属性 15: 模板必需字段验证
 * 验证需求: 4.2
 */

describe('TemplateService CRUD Property Tests', () => {
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
   * 属性 14: 模板CRUD往返一致性
   * 对于任何有效的模板，创建后立即查询应该返回相同的模板内容，
   * 更新后查询应该反映更新的内容。
   */
  describe('Property 14: 模板CRUD往返一致性', () => {
    it('创建模板后立即查询应返回相同内容', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length > 0),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const created = await service.createTemplate(input);

            // 立即查询
            const retrieved = await service.getTemplate(created.id);

            // 验证返回的模板不为null
            expect(retrieved).not.toBeNull();

            // 验证内容一致性
            expect(retrieved!.category).toBe(input.category);
            expect(retrieved!.content).toBe(input.content);
            expect(retrieved!.weight).toBe(input.weight);
            // SQLite 存储 boolean 为 INTEGER (1/0)
            expect(retrieved!.enabled).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('更新模板后查询应反映更新的内容', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            initial: fc.record({
              category: fc.constantFrom('group_message', 'channel_comment'),
              content: fc
                .string({ minLength: 1, maxLength: 500 })
                .filter((s) => s.trim().length > 0),
              weight: fc.integer({ min: 1, max: 100 }),
            }),
            update: fc.record({
              // 注意：TemplateDao.update 不支持更新 category
              content: fc.option(
                fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length > 0),
                { nil: undefined }
              ),
              weight: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
            }),
          }),
          async ({ initial, update }) => {
            // 创建初始模板
            const created = await service.createTemplate(initial);

            // 更新模板
            const updated = await service.updateTemplate(created.id, update);

            // 查询更新后的模板
            const retrieved = await service.getTemplate(created.id);

            // 验证返回的模板不为null
            expect(retrieved).not.toBeNull();

            // category 不支持更新，应保持不变
            expect(retrieved!.category).toBe(initial.category);

            // 验证更新的字段
            if (update.content !== undefined) {
              expect(retrieved!.content).toBe(update.content);
            } else {
              expect(retrieved!.content).toBe(initial.content);
            }

            if (update.weight !== undefined) {
              expect(retrieved!.weight).toBe(update.weight);
            } else {
              expect(retrieved!.weight).toBe(initial.weight);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('删除模板后查询应返回null', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length > 0),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const created = await service.createTemplate(input);

            // 删除模板
            await service.deleteTemplate(created.id);

            // 查询已删除的模板
            const retrieved = await service.getTemplate(created.id);

            // 验证返回null
            expect(retrieved).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 属性 15: 模板必需字段验证
   * 对于任何模板创建请求，如果缺少名称或内容列表为空，
   * 系统应该拒绝创建并返回验证错误。
   */
  describe('Property 15: 模板必需字段验证', () => {
    it('缺少内容应拒绝创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.constant(''),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 尝试创建空内容的模板
            await expect(service.createTemplate(input)).rejects.toThrow('模板内容不能为空');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('内容只包含空白字符应拒绝创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.string({ minLength: 1, maxLength: 20 }).map((s) => ' '.repeat(s.length)),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 尝试创建只有空白字符的模板
            await expect(service.createTemplate(input)).rejects.toThrow('模板内容不能为空');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('缺少分类应拒绝创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            content: fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length > 0),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 尝试创建没有分类的模板
            await expect(service.createTemplate(input as any)).rejects.toThrow('模板分类不能为空');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('无效的分类应拒绝创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc
              .string({ minLength: 1, maxLength: 50 })
              .filter((s) => s !== 'group_message' && s !== 'channel_comment'),
            content: fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length > 0),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 尝试创建无效分类的模板
            await expect(service.createTemplate(input as any)).rejects.toThrow('无效的模板分类');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('更新时设置空内容应拒绝', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length > 0),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const created = await service.createTemplate(input);

            // 尝试更新为空内容
            await expect(service.updateTemplate(created.id, { content: '' })).rejects.toThrow(
              '模板内容不能为空'
            );

            // 尝试更新为只有空白字符的内容
            await expect(service.updateTemplate(created.id, { content: '   ' })).rejects.toThrow(
              '模板内容不能为空'
            );
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
