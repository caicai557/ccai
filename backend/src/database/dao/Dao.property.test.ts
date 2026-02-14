import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { AccountDao } from './AccountDao';
import { TemplateDao } from './TemplateDao';
import { TargetDao } from './TargetDao';
import { Account, Template, Target } from '../../types';
import { initSchema } from '../schema';

/**
 * 属性测试：数据持久化往返一致性
 * Feature: telegram-content-manager, Property 29: 数据持久化往返一致性
 * 验证需求: 8.2, 8.3, 8.4, 8.5
 */

describe('DAO Property Tests - 数据持久化往返一致性', () => {
  let db: Database.Database;
  let accountDao: AccountDao;
  let templateDao: TemplateDao;
  let targetDao: TargetDao;

  const resetCoreTables = () => {
    db.exec(`
      DELETE FROM message_history;
      DELETE FROM tasks;
      DELETE FROM targets;
      DELETE FROM templates;
      DELETE FROM accounts;
    `);
  };

  beforeEach(() => {
    // 使用内存数据库进行测试
    db = new Database(':memory:');
    initSchema(db);

    accountDao = new AccountDao(db);
    templateDao = new TemplateDao(db);
    targetDao = new TargetDao(db);
  });

  afterEach(() => {
    db.close();
  });

  /**
   * 属性29: AccountDao 数据持久化往返一致性
   * 对于任何有效的账号数据，写入数据库后立即读取应该返回相同的数据
   */
  test('属性29.1: AccountDao 创建后查询返回一致的数据', () => {
    fc.assert(
      fc.property(
        // 生成随机账号数据
        fc.record({
          phoneNumber: fc.string({ minLength: 10, maxLength: 15 }).map((s) => {
            const digits = s.replace(/\D/g, '');
            // 确保至少有10位数字
            return '+' + (digits.length >= 10 ? digits : digits.padEnd(10, '0'));
          }),
          session: fc.string({ minLength: 10, maxLength: 100 }).filter((s) => s.trim().length > 0),
          username: fc.option(
            fc
              .string({ minLength: 3, maxLength: 32 })
              .filter((s) => s.trim().length >= 3 && /^[a-zA-Z0-9_]+$/.test(s)),
            { nil: undefined }
          ),
          firstName: fc.option(
            fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
            { nil: undefined }
          ),
          lastName: fc.option(
            fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
            { nil: undefined }
          ),
          status: fc.constantFrom('online' as const, 'offline' as const, 'restricted' as const),
        }),
        (accountData) => {
          resetCoreTables();

          // 创建账号
          const created = accountDao.create(accountData);

          // 立即查询
          const retrieved = accountDao.findById(created.id);

          // 验证：查询结果应该存在
          expect(retrieved).toBeDefined();

          // 验证：核心字段应该一致
          expect(retrieved!.phoneNumber).toBe(accountData.phoneNumber);
          expect(retrieved!.session).toBe(accountData.session);
          expect(retrieved!.username).toBe(accountData.username || null);
          expect(retrieved!.firstName).toBe(accountData.firstName || null);
          expect(retrieved!.lastName).toBe(accountData.lastName || null);
          expect(retrieved!.status).toBe(accountData.status);

          // 验证：ID应该一致
          expect(retrieved!.id).toBe(created.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性29.2: AccountDao 更新后查询返回更新的数据
   */
  test('属性29.2: AccountDao 更新后查询返回更新的数据', () => {
    fc.assert(
      fc.property(
        // 生成初始账号数据
        fc.record({
          phoneNumber: fc
            .string({ minLength: 10, maxLength: 15 })
            .map((s) => '+' + s.replace(/\D/g, '')),
          session: fc.string({ minLength: 10, maxLength: 100 }),
          status: fc.constantFrom('online' as const, 'offline' as const, 'restricted' as const),
        }),
        // 生成更新数据
        fc.record({
          username: fc.option(fc.string({ minLength: 3, maxLength: 32 }), { nil: undefined }),
          firstName: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: undefined }),
          status: fc.constantFrom('online' as const, 'offline' as const, 'restricted' as const),
        }),
        (initialData, updateData) => {
          resetCoreTables();

          // 创建账号
          const created = accountDao.create(initialData);

          // 更新账号
          const updated = accountDao.update(created.id, updateData);

          // 立即查询
          const retrieved = accountDao.findById(created.id);

          // 验证：查询结果应该存在
          expect(retrieved).toBeDefined();
          expect(updated).toBeDefined();

          // 验证：更新的字段应该反映在查询结果中
          if (updateData.username !== undefined) {
            expect(retrieved!.username).toBe(updateData.username || null);
          }
          if (updateData.firstName !== undefined) {
            expect(retrieved!.firstName).toBe(updateData.firstName || null);
          }
          expect(retrieved!.status).toBe(updateData.status);

          // 验证：ID应该保持不变
          expect(retrieved!.id).toBe(created.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性29.3: TemplateDao 数据持久化往返一致性
   */
  test('属性29.3: TemplateDao 创建后查询返回一致的数据', () => {
    fc.assert(
      fc.property(
        fc.record({
          category: fc.constantFrom('group_message' as const, 'channel_comment' as const),
          content: fc.string({ minLength: 1, maxLength: 500 }),
          enabled: fc.boolean(),
          weight: fc.integer({ min: 1, max: 100 }),
        }),
        (templateData) => {
          resetCoreTables();

          // 创建模板
          const created = templateDao.create(templateData);

          // 立即查询
          const retrieved = templateDao.findById(created.id);

          // 验证：查询结果应该存在
          expect(retrieved).toBeDefined();

          // 验证：核心字段应该一致
          expect(retrieved!.category).toBe(templateData.category);
          expect(retrieved!.content).toBe(templateData.content);
          expect(retrieved!.enabled).toBe(templateData.enabled ? 1 : 0);
          expect(retrieved!.weight).toBe(templateData.weight);
          expect(retrieved!.id).toBe(created.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性29.4: TemplateDao 更新后查询返回更新的数据
   */
  test('属性29.4: TemplateDao 更新后查询返回更新的数据', () => {
    fc.assert(
      fc.property(
        // 初始数据
        fc.record({
          category: fc.constantFrom('group_message' as const, 'channel_comment' as const),
          content: fc.string({ minLength: 1, maxLength: 500 }),
          enabled: fc.boolean(),
          weight: fc.integer({ min: 1, max: 100 }),
        }),
        // 更新数据
        fc.record({
          content: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: undefined }),
          enabled: fc.option(fc.boolean(), { nil: undefined }),
          weight: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
        }),
        (initialData, updateData) => {
          resetCoreTables();

          // 创建模板
          const created = templateDao.create(initialData);

          // 更新模板
          const updated = templateDao.update(created.id, updateData);

          // 立即查询
          const retrieved = templateDao.findById(created.id);

          // 验证：查询结果应该存在
          expect(retrieved).toBeDefined();
          expect(updated).toBeDefined();

          // 验证：更新的字段应该反映在查询结果中
          if (updateData.content !== undefined) {
            expect(retrieved!.content).toBe(updateData.content);
          }
          if (updateData.enabled !== undefined) {
            expect(retrieved!.enabled).toBe(updateData.enabled ? 1 : 0);
          }
          if (updateData.weight !== undefined) {
            expect(retrieved!.weight).toBe(updateData.weight);
          }

          // 验证：ID应该保持不变
          expect(retrieved!.id).toBe(created.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性29.5: TargetDao 数据持久化往返一致性
   */
  test('属性29.5: TargetDao 创建后查询返回一致的数据', () => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constantFrom('group' as const, 'channel' as const),
          telegramId: fc.string({ minLength: 5, maxLength: 20 }),
          title: fc.string({ minLength: 1, maxLength: 255 }),
          enabled: fc.boolean(),
        }),
        (targetData) => {
          resetCoreTables();

          // 创建目标
          const created = targetDao.create(targetData);

          // 立即查询
          const retrieved = targetDao.findById(created.id);

          // 验证：查询结果应该存在
          expect(retrieved).toBeDefined();

          // 验证：核心字段应该一致
          expect(retrieved!.type).toBe(targetData.type);
          expect(retrieved!.telegramId).toBe(targetData.telegramId);
          expect(retrieved!.title).toBe(targetData.title);
          expect(retrieved!.enabled).toBe(targetData.enabled ? 1 : 0);
          expect(retrieved!.id).toBe(created.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性29.6: TargetDao 更新后查询返回更新的数据
   */
  test('属性29.6: TargetDao 更新后查询返回更新的数据', () => {
    fc.assert(
      fc.property(
        // 初始数据
        fc.record({
          type: fc.constantFrom('group' as const, 'channel' as const),
          telegramId: fc.string({ minLength: 5, maxLength: 20 }),
          title: fc.string({ minLength: 1, maxLength: 255 }),
          enabled: fc.boolean(),
        }),
        // 更新数据
        fc.record({
          title: fc.option(fc.string({ minLength: 1, maxLength: 255 }), { nil: undefined }),
          enabled: fc.option(fc.boolean(), { nil: undefined }),
        }),
        (initialData, updateData) => {
          resetCoreTables();

          // 创建目标
          const created = targetDao.create(initialData);

          // 更新目标
          const updated = targetDao.update(created.id, updateData);

          // 立即查询
          const retrieved = targetDao.findById(created.id);

          // 验证：查询结果应该存在
          expect(retrieved).toBeDefined();
          expect(updated).toBeDefined();

          // 验证：更新的字段应该反映在查询结果中
          if (updateData.title !== undefined) {
            expect(retrieved!.title).toBe(updateData.title);
          }
          if (updateData.enabled !== undefined) {
            expect(retrieved!.enabled).toBe(updateData.enabled ? 1 : 0);
          }

          // 验证：ID应该保持不变
          expect(retrieved!.id).toBe(created.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 属性29.7: 批量查询返回所有创建的记录
   */
  test('属性29.7: 批量创建后 findAll 返回所有记录', () => {
    fc.assert(
      fc.property(
        // 生成多个账号数据
        fc.array(
          fc.record({
            phoneNumber: fc.string({ minLength: 10, maxLength: 15 }).map((s) => {
              const digits = s.replace(/\D/g, '');
              return '+' + (digits.length >= 10 ? digits : digits.padEnd(10, '0'));
            }),
            session: fc
              .string({ minLength: 10, maxLength: 100 })
              .filter((s) => s.trim().length > 0),
            status: fc.constantFrom('online' as const, 'offline' as const, 'restricted' as const),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (accountsData) => {
          resetCoreTables();

          // 确保手机号唯一
          const uniqueAccounts = accountsData.filter(
            (acc, index, self) => self.findIndex((a) => a.phoneNumber === acc.phoneNumber) === index
          );

          // 创建所有账号
          const createdIds = uniqueAccounts.map((data) => accountDao.create(data).id);

          // 查询所有账号
          const allAccounts = accountDao.findAll();

          // 验证：返回的账号数量应该等于创建的数量
          expect(allAccounts.length).toBe(createdIds.length);

          // 验证：所有创建的ID都应该在查询结果中
          const retrievedIds = allAccounts.map((acc) => acc.id);
          createdIds.forEach((id) => {
            expect(retrievedIds).toContain(id);
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * 属性29.8: 删除后查询应该返回 undefined
   */
  test('属性29.8: 删除记录后查询应该返回 undefined', () => {
    fc.assert(
      fc.property(
        fc.record({
          phoneNumber: fc
            .string({ minLength: 10, maxLength: 15 })
            .map((s) => '+' + s.replace(/\D/g, '')),
          session: fc.string({ minLength: 10, maxLength: 100 }),
          status: fc.constantFrom('online' as const, 'offline' as const, 'restricted' as const),
        }),
        (accountData) => {
          resetCoreTables();

          // 创建账号
          const created = accountDao.create(accountData);

          // 验证创建成功
          expect(accountDao.findById(created.id)).toBeDefined();

          // 删除账号
          const deleted = accountDao.delete(created.id);
          expect(deleted).toBe(true);

          // 查询应该返回 undefined
          const retrieved = accountDao.findById(created.id);
          expect(retrieved).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
