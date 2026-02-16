import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { TemplateService } from './TemplateService';
import { initSchema } from '../../database/schema';
import { runMigrations } from '../../database/migrations';

/**
 * Feature: telegram-content-manager
 * 属性 8: 模板变量替换完整性
 * 验证需求: 2.5, 4.3
 */

describe('TemplateService Variable Replacement Property Tests', () => {
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
   * 属性 8: 模板变量替换完整性
   * 对于任何包含变量占位符的模板内容，生成后的消息不应该包含未替换的占位符
   * （如{time}、{date}、{random}）。
   */
  describe('Property 8: 模板变量替换完整性', () => {
    it('生成的内容不应包含 {time} 占位符', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 生成包含 {time} 变量的内容
            content: fc
              .array(fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0), { minLength: 1, maxLength: 3 })
              .map((parts) => parts.join(' {time} ')),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 生成内容
            const generated = await service.generateContent(template.id);

            // 验证不包含未替换的 {time} 占位符
            expect(generated).not.toContain('{time}');

            // 验证生成的内容不为空
            expect(generated.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('生成的内容不应包含 {date} 占位符', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 生成包含 {date} 变量的内容
            content: fc
              .array(fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0), { minLength: 1, maxLength: 3 })
              .map((parts) => parts.join(' {date} ')),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 生成内容
            const generated = await service.generateContent(template.id);

            // 验证不包含未替换的 {date} 占位符
            expect(generated).not.toContain('{date}');

            // 验证生成的内容不为空
            expect(generated.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('生成的内容不应包含 {random} 占位符', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 生成包含 {random} 变量的内容
            content: fc
              .array(fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0), { minLength: 1, maxLength: 3 })
              .map((parts) => parts.join(' {random} ')),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 生成内容
            const generated = await service.generateContent(template.id);

            // 验证不包含未替换的 {random} 占位符
            expect(generated).not.toContain('{random}');

            // 验证生成的内容不为空
            expect(generated.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('生成的内容不应包含任何已知的占位符', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 生成包含多种变量的内容
            content: fc
              .array(
                fc.oneof(
                  fc.constant('{time}'),
                  fc.constant('{date}'),
                  fc.constant('{random}'),
                  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0)
                ),
                { minLength: 1, maxLength: 10 }
              )
              .map((parts) => parts.join(' ')),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 生成内容
            const generated = await service.generateContent(template.id);

            // 验证不包含任何未替换的占位符
            expect(generated).not.toContain('{time}');
            expect(generated).not.toContain('{date}');
            expect(generated).not.toContain('{random}');

            // 验证生成的内容不为空
            expect(generated.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('{time} 应被替换为 HH:mm 格式的时间', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.constant('当前时间是 {time}'),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 生成内容
            const generated = await service.generateContent(template.id);

            // 验证包含时间格式 HH:mm
            const timePattern = /\d{2}:\d{2}/;
            expect(generated).toMatch(timePattern);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('{date} 应被替换为 YYYY-MM-DD 格式的日期', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.constant('今天是 {date}'),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 生成内容
            const generated = await service.generateContent(template.id);

            // 验证包含日期格式 YYYY-MM-DD
            const datePattern = /\d{4}-\d{2}-\d{2}/;
            expect(generated).toMatch(datePattern);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('{random} 应被替换为 1-100 之间的数字', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.constant('随机数: {random}'),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 生成内容多次，验证随机性
            const generated = await service.generateContent(template.id);

            // 提取数字
            const match = generated.match(/随机数: (\d+)/);
            expect(match).not.toBeNull();

            const randomNum = parseInt(match![1], 10);
            // 验证在 1-100 范围内
            expect(randomNum).toBeGreaterThanOrEqual(1);
            expect(randomNum).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('多行内容中的变量应被正确替换', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 生成多行内容，每行包含不同的变量
            content: fc.constant(
              '第一行: {time}\n第二行: {date}\n第三行: {random}\n第四行: 普通文本'
            ),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 生成内容（会随机选择一行）
            const generated = await service.generateContent(template.id);

            // 验证不包含任何未替换的占位符
            expect(generated).not.toContain('{time}');
            expect(generated).not.toContain('{date}');
            expect(generated).not.toContain('{random}');

            // 验证生成的内容不为空
            expect(generated.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
