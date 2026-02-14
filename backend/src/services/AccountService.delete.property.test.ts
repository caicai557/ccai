import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { AccountService } from './AccountService';
import { DaoFactory } from '../database/dao';
import { runMigrations } from '../database/migrations';
import fs from 'fs';
import path from 'path';
import { encrypt } from '../utils/crypto';
import { ClientPool } from '../telegram/ClientPool';
import { SessionManager } from '../telegram/SessionManager';

/**
 * AccountService 账号删除属性测试
 * Feature: telegram-content-manager
 *
 * 属性 3: 账号删除完全性
 * 验证需求: 1.9
 *
 * 对于任何账号，删除操作后该账号应该无法从数据库中查询到，
 * 且所有关联的任务应该被停止。
 */

describe('AccountService Delete Property Tests - 账号删除完全性', () => {
  let accountService: AccountService;
  let accountDao: ReturnType<typeof DaoFactory.getInstance>['getAccountDao'];
  let db: Database.Database;
  const testDbPath = path.join(__dirname, '../../test-data/delete-property-test.db');
  let phoneSuffixCounter = 0;

  const phoneArbitrary = fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 10, maxLength: 15 })
    .map((digits) => `+${digits.join('')}`);

  const buildUniquePhone = (base: string): string => {
    phoneSuffixCounter += 1;
    return `${base}-${Date.now()}-${phoneSuffixCounter}`;
  };

  beforeAll(() => {
    // 确保测试数据目录存在
    const testDataDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    // 如果测试数据库已存在，删除它
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // 创建测试数据库
    db = new Database(testDbPath);
    db.pragma('foreign_keys = ON');

    // 运行迁移
    runMigrations(db);

    // 初始化DaoFactory
    DaoFactory.initialize(db);
  });

  afterAll(async () => {
    await ClientPool.getInstance().stopBackgroundTasks();

    // 关闭数据库连接
    if (db) {
      db.close();
    }

    // 清理测试数据库
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  beforeEach(() => {
    db.exec(`
      DELETE FROM task_executions;
      DELETE FROM rate_records;
      DELETE FROM rate_limits;
      DELETE FROM message_history;
      DELETE FROM logs;
      DELETE FROM tasks;
      DELETE FROM templates;
      DELETE FROM targets;
      DELETE FROM accounts;
    `);

    accountService = new AccountService();
    accountDao = DaoFactory.getInstance().getAccountDao();
  });

  /**
   * 属性 3: 账号删除完全性
   * 验证需求: 1.9
   *
   * 对于任何账号，删除操作后该账号应该无法从数据库中查询到，
   * 且所有关联的任务应该被停止。
   */
  describe('属性 3: 账号删除完全性', () => {
    test('属性 3.1: 删除账号后应该无法从数据库查询到', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据
          fc.record({
            phoneNumber: phoneArbitrary,
            username: fc.option(fc.string({ minLength: 3, maxLength: 20 }), { nil: undefined }),
            firstName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            lastName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            addMethod: fc.constantFrom('phone' as const, 'session' as const),
            status: fc.constantFrom('online' as const, 'offline' as const, 'restricted' as const),
          }),
          async (accountData) => {
            // 确保手机号唯一
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            // 创建账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              username: accountData.username,
              firstName: accountData.firstName,
              lastName: accountData.lastName,
              addMethod: accountData.addMethod,
              session: '',
              status: accountData.status,
            });

            // 验证账号已创建
            const foundBefore = accountDao.findById(account.id);
            expect(foundBefore).toBeDefined();
            expect(foundBefore?.id).toBe(account.id);

            // 删除账号
            await accountService.deleteAccount(account.id);

            // 验证：账号应该无法从数据库查询到
            const foundAfter = accountDao.findById(account.id);
            expect(foundAfter).toBeUndefined();

            // 验证：通过手机号也无法查询到
            const foundByPhone = accountDao.findByPhoneNumber(uniquePhone);
            expect(foundByPhone).toBeUndefined();

            // 验证：在所有账号列表中也不存在
            const allAccounts = accountDao.findAll();
            const existsInList = allAccounts.some((acc) => acc.id === account.id);
            expect(existsInList).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('属性 3.2: 删除不存在的账号应该抛出错误', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成随机的不存在的账号ID
          fc.uuid(),
          async (nonExistentId) => {
            // 确保ID不存在
            const account = accountDao.findById(nonExistentId);
            if (account) {
              await accountService.deleteAccount(nonExistentId);
            }

            // 尝试删除不存在的账号
            await expect(accountService.deleteAccount(nonExistentId)).rejects.toThrow('账号不存在');
          }
        ),
        { numRuns: 50 }
      );
    });

    test('属性 3.3: 删除账号后会话数据应该被清理', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成带会话的账号数据
          fc.record({
            phoneNumber: phoneArbitrary,
            sessionString: fc
              .string({ minLength: 100, maxLength: 200 })
              .map((s) => '1' + s.slice(1)),
          }),
          async (accountData) => {
            // 确保手机号唯一
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            // 创建带会话的账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              session: encrypt(accountData.sessionString),
              status: 'online',
            });

            // 验证会话数据存在
            expect(account.session).toBeTruthy();

            // 删除账号
            await accountService.deleteAccount(account.id);

            // 验证：账号已被删除
            const foundAfter = accountDao.findById(account.id);
            expect(foundAfter).toBeUndefined();

            // 验证：会话管理器中的会话数据应该被清理
            // 尝试加载会话应该失败
            const sessionManager = SessionManager.getInstance();
            await expect(sessionManager.loadSession(account.id)).rejects.toThrow();
          }
        ),
        { numRuns: 50 }
      );
    });

    test('属性 3.4: 删除账号后客户端连接应该被清理', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据
          fc.record({
            phoneNumber: phoneArbitrary,
          }),
          async (accountData) => {
            // 确保手机号唯一
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            // 创建账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              session: '',
              status: 'offline',
            });

            // 删除账号
            await accountService.deleteAccount(account.id);

            // 验证：客户端连接池中不应该存在该账号的客户端
            const clientPool = ClientPool.getInstance();
            expect(clientPool.hasClient(account.id)).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    test('属性 3.5: 多次删除同一账号应该只有第一次成功', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据
          fc.record({
            phoneNumber: phoneArbitrary,
          }),
          async (accountData) => {
            // 确保手机号唯一
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            // 创建账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              session: '',
              status: 'offline',
            });

            // 第一次删除应该成功
            await expect(accountService.deleteAccount(account.id)).resolves.not.toThrow();

            // 第二次删除应该失败
            await expect(accountService.deleteAccount(account.id)).rejects.toThrow('账号不存在');

            // 第三次删除也应该失败
            await expect(accountService.deleteAccount(account.id)).rejects.toThrow('账号不存在');
          }
        ),
        { numRuns: 50 }
      );
    });

    test('属性 3.6: 删除账号不应该影响其他账号', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成多个账号数据
          fc.array(
            fc.record({
              phoneNumber: phoneArbitrary,
              username: fc.option(fc.string({ minLength: 3, maxLength: 20 }), { nil: undefined }),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (accountsData) => {
            // 创建多个账号
            const accounts = accountsData.map((data, index) => {
              const uniquePhone = buildUniquePhone(`${data.phoneNumber}-${index}`);
              return accountDao.create({
                phoneNumber: uniquePhone,
                username: data.username,
                session: '',
                status: 'offline',
              });
            });

            try {
              // 选择第一个账号删除
              const accountToDelete = accounts[0];
              const otherAccounts = accounts.slice(1);

              // 删除第一个账号
              await accountService.deleteAccount(accountToDelete.id);

              // 验证：被删除的账号不存在
              const deletedAccount = accountDao.findById(accountToDelete.id);
              expect(deletedAccount).toBeUndefined();

              // 验证：其他账号仍然存在且数据完整
              for (const otherAccount of otherAccounts) {
                const found = accountDao.findById(otherAccount.id);
                expect(found).toBeDefined();
                expect(found?.id).toBe(otherAccount.id);
                expect(found?.phoneNumber).toBe(otherAccount.phoneNumber);
                expect(found?.username).toBe(otherAccount.username);
              }
            } finally {
              // 清理所有测试账号
              for (const account of accounts) {
                try {
                  await accountService.deleteAccount(account.id);
                } catch {
                  // 忽略已删除的账号
                }
              }
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    test('属性 3.7: 删除账号应该是原子操作', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据
          fc.record({
            phoneNumber: phoneArbitrary,
            sessionString: fc
              .string({ minLength: 100, maxLength: 200 })
              .map((s) => '1' + s.slice(1)),
          }),
          async (accountData) => {
            // 确保手机号唯一
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            // 创建带会话的账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              session: encrypt(accountData.sessionString),
              status: 'online',
            });

            // 删除账号
            await accountService.deleteAccount(account.id);

            // 验证：所有相关数据都应该被清理
            // 1. 数据库中的账号记录
            const foundInDb = accountDao.findById(account.id);
            expect(foundInDb).toBeUndefined();

            // 2. 客户端连接池
            const clientPool = ClientPool.getInstance();
            expect(clientPool.hasClient(account.id)).toBe(false);

            // 3. 会话数据
            const sessionManager = SessionManager.getInstance();
            await expect(sessionManager.loadSession(account.id)).rejects.toThrow();

            // 验证：删除是完全的，没有残留数据
            const allAccounts = accountDao.findAll();
            const exists = allAccounts.some((acc) => acc.id === account.id);
            expect(exists).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    test('属性 3.8: 删除账号后无法通过任何方式查询到', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据
          fc.record({
            phoneNumber: phoneArbitrary,
            username: fc.string({ minLength: 3, maxLength: 20 }),
            firstName: fc.string({ minLength: 1, maxLength: 50 }),
            lastName: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          async (accountData) => {
            // 确保手机号唯一
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            // 创建账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              username: accountData.username,
              firstName: accountData.firstName,
              lastName: accountData.lastName,
              session: '',
              status: 'offline',
            });

            const accountId = account.id;

            // 删除账号
            await accountService.deleteAccount(accountId);

            // 验证：通过ID查询不到
            const foundById = accountDao.findById(accountId);
            expect(foundById).toBeUndefined();

            // 验证：通过手机号查询不到
            const foundByPhone = accountDao.findByPhoneNumber(uniquePhone);
            expect(foundByPhone).toBeUndefined();

            // 验证：在所有账号列表中不存在
            const allAccounts = accountDao.findAll();
            const existsInList = allAccounts.some((acc) => acc.id === accountId);
            expect(existsInList).toBe(false);

            // 验证：通过AccountService的方法也查询不到
            const foundByService = await accountService.getAccount(accountId);
            expect(foundByService).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    test('属性 3.9: 批量删除账号应该全部成功', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成多个账号数据
          fc.array(
            fc.record({
              phoneNumber: phoneArbitrary,
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (accountsData) => {
            // 创建多个账号
            const accounts = accountsData.map((data, index) => {
              const uniquePhone = buildUniquePhone(`${data.phoneNumber}-${index}`);
              return accountDao.create({
                phoneNumber: uniquePhone,
                session: '',
                status: 'offline',
              });
            });

            const accountIds = accounts.map((acc) => acc.id);

            // 删除所有账号
            for (const accountId of accountIds) {
              await accountService.deleteAccount(accountId);
            }

            // 验证：所有账号都已被删除
            for (const accountId of accountIds) {
              const found = accountDao.findById(accountId);
              expect(found).toBeUndefined();
            }

            // 验证：数据库中不存在这些账号
            const allAccounts = accountDao.findAll();
            for (const accountId of accountIds) {
              const exists = allAccounts.some((acc) => acc.id === accountId);
              expect(exists).toBe(false);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    test('属性 3.10: 删除账号的操作应该是幂等的（多次调用结果一致）', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据
          fc.record({
            phoneNumber: phoneArbitrary,
          }),
          async (accountData) => {
            // 确保手机号唯一
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            // 创建账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              session: '',
              status: 'offline',
            });

            // 第一次删除
            await accountService.deleteAccount(account.id);

            // 验证账号已删除
            const found1 = accountDao.findById(account.id);
            expect(found1).toBeUndefined();

            // 尝试第二次删除（应该抛出错误）
            await expect(accountService.deleteAccount(account.id)).rejects.toThrow('账号不存在');

            // 验证账号仍然不存在（状态一致）
            const found2 = accountDao.findById(account.id);
            expect(found2).toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * 属性 3.11: 删除账号的边界条件测试
   */
  describe('属性 3.11: 删除账号的边界条件', () => {
    test('属性 3.11.1: 删除刚创建的账号应该成功', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            phoneNumber: phoneArbitrary,
          }),
          async (accountData) => {
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            // 创建账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              session: '',
              status: 'offline',
            });

            // 立即删除
            await accountService.deleteAccount(account.id);

            // 验证删除成功
            const found = accountDao.findById(account.id);
            expect(found).toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });

    test('属性 3.11.2: 删除不同状态的账号都应该成功', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            phoneNumber: phoneArbitrary,
            status: fc.constantFrom('online' as const, 'offline' as const, 'restricted' as const),
          }),
          async (accountData) => {
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            // 创建不同状态的账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              session: '',
              status: accountData.status,
            });

            // 删除账号
            await accountService.deleteAccount(account.id);

            // 验证删除成功
            const found = accountDao.findById(account.id);
            expect(found).toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });

    test('属性 3.11.3: 删除不同添加方式的账号都应该成功', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            phoneNumber: phoneArbitrary,
            addMethod: fc.constantFrom('phone' as const, 'session' as const),
          }),
          async (accountData) => {
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            // 创建不同添加方式的账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              addMethod: accountData.addMethod,
              session: '',
              status: 'offline',
            });

            // 删除账号
            await accountService.deleteAccount(account.id);

            // 验证删除成功
            const found = accountDao.findById(account.id);
            expect(found).toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
