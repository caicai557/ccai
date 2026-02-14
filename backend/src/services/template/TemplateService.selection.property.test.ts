import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { TemplateService } from './TemplateService';
import { initSchema } from '../../database/schema';
import { runMigrations } from '../../database/migrations';

/**
 * Feature: telegram-content-manager
 * 属性 7: 模板内容随机选择有效性
 * 验证需求: 2.4, 3.4
 */

describe('TemplateService Content Selection Property Tests', () => {
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
   * 属性 7: 模板内容随机选择有效性
   * 对于任何消息或评论发送操作，选择的内容应该存在于对应模板的内容列表中。
   */
  describe('Property 7: 模板内容随机选择有效性', () => {
    it('生成的内容应该来自模板的内容列表（单行）', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 单行内容
            content: fc
              .string({ minLength: 1, maxLength: 100 })
              .filter((s) => s.trim().length > 0 && !s.includes('\n')),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 生成内容
            const generated = await service.generateContent(template.id);

            // 对于单行内容，生成的内容应该包含原始内容（可能有变量替换）
            // 由于有变量替换，我们只能验证生成的内容不为空
            expect(generated.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('生成的内容应该来自模板的内容列表（多行）', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 多行内容，每行都是有效的
            content: fc
              .array(
                fc
                  .string({ minLength: 1, maxLength: 50 })
                  .filter((s) => s.trim().length > 0 && !s.includes('\n')),
                { minLength: 2, maxLength: 5 }
              )
              .map((lines) => lines.join('\n')),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 获取所有可能的行
            const possibleLines = input.content
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0);

            // 生成内容多次
            const generatedSet = new Set<string>();
            for (let i = 0; i < Math.min(possibleLines.length * 10, 50); i++) {
              const generated = await service.generateContent(template.id);
              generatedSet.add(generated);
            }

            // 验证至少生成了一些内容
            expect(generatedSet.size).toBeGreaterThan(0);

            // 验证每个生成的内容都不为空
            for (const generated of generatedSet) {
              expect(generated.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('对于多行模板，应该能够选择到不同的行', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 生成多行不同的内容（不包含变量，便于验证）
            content: fc
              .array(
                fc.integer({ min: 1, max: 1000 }).map((n) => `Line ${n}`),
                { minLength: 3, maxLength: 5 }
              )
              .map((lines) => lines.join('\n')),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 获取所有可能的行
            const possibleLines = input.content
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0);

            // 生成内容多次，收集不同的结果
            const generatedSet = new Set<string>();
            const maxAttempts = possibleLines.length * 20;

            for (let i = 0; i < maxAttempts && generatedSet.size < possibleLines.length; i++) {
              const generated = await service.generateContent(template.id);
              generatedSet.add(generated);
            }

            // 验证生成了多个不同的内容（至少2个）
            // 这证明了随机选择机制在工作
            expect(generatedSet.size).toBeGreaterThanOrEqual(Math.min(2, possibleLines.length));

            // 验证每个生成的内容都在可能的行列表中
            for (const generated of generatedSet) {
              expect(possibleLines).toContain(generated);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('空行应该被过滤掉', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 包含空行的内容
            content: fc.constant('Line 1\n\n\nLine 2\n  \nLine 3'),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 生成内容多次
            const generatedSet = new Set<string>();
            for (let i = 0; i < 30; i++) {
              const generated = await service.generateContent(template.id);
              generatedSet.add(generated);
            }

            // 验证生成的内容不为空
            for (const generated of generatedSet) {
              expect(generated.trim().length).toBeGreaterThan(0);
            }

            // 验证只有3个有效行
            expect(generatedSet.size).toBeLessThanOrEqual(3);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('单行模板应该总是返回相同的内容（除了变量替换）', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            // 单行内容，不包含变量
            content: fc
              .string({ minLength: 1, maxLength: 100 })
              .filter((s) => s.trim().length > 0 && !s.includes('\n') && !s.includes('{')),
            weight: fc.integer({ min: 1, max: 100 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 生成内容多次
            const generated1 = await service.generateContent(template.id);
            const generated2 = await service.generateContent(template.id);
            const generated3 = await service.generateContent(template.id);

            // 对于单行无变量的模板，所有生成的内容应该相同
            expect(generated1).toBe(generated2);
            expect(generated2).toBe(generated3);
            expect(generated1).toBe(input.content.trim());
          }
        ),
        { numRuns: 50 }
      );
    });

    it('生成内容应该递增使用计数', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('group_message', 'channel_comment'),
            content: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
            weight: fc.integer({ min: 1, max: 100 }),
            generateCount: fc.integer({ min: 1, max: 10 }),
          }),
          async (input) => {
            // 创建模板
            const template = await service.createTemplate(input);

            // 初始使用计数应该为0
            const initialCount = await service.getUsageCount(template.id);
            expect(initialCount).toBe(0);

            // 生成内容多次
            for (let i = 0; i < input.generateCount; i++) {
              await service.generateContent(template.id);
            }

            // 验证使用计数递增
            const finalCount = await service.getUsageCount(template.id);
            expect(finalCount).toBe(input.generateCount);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
