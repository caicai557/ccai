import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { TemplateService } from './TemplateService';
import { initSchema } from '../../database/schema';
import { runMigrations } from '../../database/migrations';

/**
 * Feature: telegram-content-manager
 * 属性 19: 模板预览无占位符
 * 验证需求: 4.7
 */

describe('TemplateService Preview Property Tests', () => {
  let db: Database.Database;
  let service: TemplateService;
  const nonBlankLongText = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((text) => text.trim().length > 0);
  const nonBlankShortText = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((text) => text.trim().length > 0);
  const nonBlankLineText = fc
    .string({ minLength: 5, maxLength: 30 })
    .filter((text) => text.trim().length > 0);

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
   * 属性 19: 模板预览无占位符
   * 对于任何模板预览操作，返回的预览内容不应该包含未替换的变量占位符。
   */
  describe('Property 19: 模板预览无占位符', () => {
    it('预览内容不应包含 {time} 占位符', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 生成包含 {time} 变量的内容
            content: fc
              .array(nonBlankLongText, { minLength: 1, maxLength: 5 })
              .map((parts) => parts.join(' {time} ')),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 预览模板
            const previews = await service.previewTemplate(template.id);

            // 验证所有预览内容都不包含未替换的 {time} 占位符
            for (const preview of previews) {
              expect(preview).not.toContain('{time}');
              expect(preview.length).toBeGreaterThan(0);
            }

            // 验证至少有一个预览
            expect(previews.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('预览内容不应包含 {date} 占位符', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 生成包含 {date} 变量的内容
            content: fc
              .array(nonBlankLongText, { minLength: 1, maxLength: 5 })
              .map((parts) => parts.join(' {date} ')),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 预览模板
            const previews = await service.previewTemplate(template.id);

            // 验证所有预览内容都不包含未替换的 {date} 占位符
            for (const preview of previews) {
              expect(preview).not.toContain('{date}');
              expect(preview.length).toBeGreaterThan(0);
            }

            // 验证至少有一个预览
            expect(previews.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('预览内容不应包含 {random} 占位符', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 生成包含 {random} 变量的内容
            content: fc
              .array(nonBlankLongText, { minLength: 1, maxLength: 5 })
              .map((parts) => parts.join(' {random} ')),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 预览模板
            const previews = await service.previewTemplate(template.id);

            // 验证所有预览内容都不包含未替换的 {random} 占位符
            for (const preview of previews) {
              expect(preview).not.toContain('{random}');
              expect(preview.length).toBeGreaterThan(0);
            }

            // 验证至少有一个预览
            expect(previews.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('预览内容不应包含任何已知的占位符', async () => {
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
                  nonBlankShortText
                ),
                { minLength: 1, maxLength: 15 }
              )
              .map((parts) => parts.join(' ')),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 预览模板
            const previews = await service.previewTemplate(template.id);

            // 验证所有预览内容都不包含任何未替换的占位符
            for (const preview of previews) {
              expect(preview).not.toContain('{time}');
              expect(preview).not.toContain('{date}');
              expect(preview).not.toContain('{random}');
              expect(preview.length).toBeGreaterThan(0);
            }

            // 验证至少有一个预览
            expect(previews.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('多行模板的所有预览变体都不应包含占位符', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 生成多行内容，每行包含不同的变量
            content: fc
              .array(
                fc.oneof(
                  fc.constant('时间: {time}'),
                  fc.constant('日期: {date}'),
                  fc.constant('随机数: {random}'),
                  fc.constant('混合: {time} - {date} - {random}'),
                  nonBlankLineText
                ),
                { minLength: 2, maxLength: 10 }
              )
              .map((lines) => lines.join('\n')),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 预览模板（应返回所有行的预览）
            const previews = await service.previewTemplate(template.id);

            // 验证所有预览内容都不包含任何未替换的占位符
            for (const preview of previews) {
              expect(preview).not.toContain('{time}');
              expect(preview).not.toContain('{date}');
              expect(preview).not.toContain('{random}');
              expect(preview.length).toBeGreaterThan(0);
            }

            // 验证至少有一个预览
            expect(previews.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('预览应返回所有非空行的变体', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 生成固定的多行内容
            content: fc.constant('第一行 {time}\n第二行 {date}\n第三行 {random}'),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 预览模板
            const previews = await service.previewTemplate(template.id);

            // 应该有3个预览变体（3行非空内容）
            expect(previews.length).toBe(3);

            // 验证所有预览都不包含占位符
            for (const preview of previews) {
              expect(preview).not.toContain('{time}');
              expect(preview).not.toContain('{date}');
              expect(preview).not.toContain('{random}');
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('预览的 {time} 应被替换为 HH:mm 格式', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.constant('当前时间: {time}'),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 预览模板
            const previews = await service.previewTemplate(template.id);

            // 验证时间格式
            const timePattern = /\d{2}:\d{2}/;
            for (const preview of previews) {
              expect(preview).toMatch(timePattern);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('预览的 {date} 应被替换为 YYYY-MM-DD 格式', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.constant('今天是: {date}'),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 预览模板
            const previews = await service.previewTemplate(template.id);

            // 验证日期格式
            const datePattern = /\d{4}-\d{2}-\d{2}/;
            for (const preview of previews) {
              expect(preview).toMatch(datePattern);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('预览的 {random} 应被替换为 1-100 之间的数字', async () => {
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

            // 预览模板
            const previews = await service.previewTemplate(template.id);

            // 验证随机数范围
            for (const preview of previews) {
              const match = preview.match(/随机数: (\d+)/);
              expect(match).not.toBeNull();

              const randomNum = parseInt(match![1], 10);
              expect(randomNum).toBeGreaterThanOrEqual(1);
              expect(randomNum).toBeLessThanOrEqual(100);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('包含空行的多行模板预览应过滤空行', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 包含空行和有内容的行
            content: fc.constant('第一行 {time}\n\n第二行 {date}\n   \n第三行 {random}'),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 预览模板
            const previews = await service.previewTemplate(template.id);

            // 应该返回3个预览（3行非空内容，空行被过滤）
            expect(previews.length).toBe(3);

            // 验证所有预览都不包含占位符
            for (const preview of previews) {
              expect(preview).not.toContain('{time}');
              expect(preview).not.toContain('{date}');
              expect(preview).not.toContain('{random}');
              expect(preview.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
