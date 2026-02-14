import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { AccountService } from './AccountService';
import { DaoFactory } from '../database/dao';
import { runMigrations } from '../database/migrations';
import fs from 'fs';
import path from 'path';
import { ClientPool } from '../telegram/ClientPool';

/**
 * AccountService 账号列表属性测试
 * Feature: telegram-content-manager
 *
 * 属性 4: 账号列表数据完整性
 * 验证需求: 1.8
 *
 * 对于任何账号列表查询，返回的每个账号对象都应该包含
 * 手机号、昵称、添加方式和在线状态字段。
 */

describe('AccountService List Property Tests - 账号列表数据完整性', () => {
  let accountService: AccountService;
  let accountDao: ReturnType<ReturnType<typeof DaoFactory.getInstance>['getAccountDao']>;
  let db: Database.Database;
  const testDbPath = path.join(__dirname, '../../test-data/list-property-test.db');

  // 辅助函数：生成唯一的手机号（在最外层定义，所有测试都可以使用）
  let phoneCounter = 0;
  const generateUniquePhone = (basePhone: string): string => {
    phoneCounter++;
    const timestamp = Date.now();
    // 确保手机号至少有 10 位数字
    const cleanPhone = basePhone.replace(/\D/g, '').padEnd(10, '0');
    return `+${cleanPhone}${timestamp}${phoneCounter}`;
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

    // 先创建表结构
    const { createTables } = require('../database/schema');
    createTables(db);

    // 然后运行迁移
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
    // 重新初始化 DaoFactory（确保数据库连接有效）
    if (!db || !db.open) {
      db = new Database(testDbPath);
      db.pragma('foreign_keys = ON');
      DaoFactory.initialize(db);
    }

    accountService = new AccountService();
    accountDao = DaoFactory.getInstance().getAccountDao();

    // 使用 DAO 清理所有账号（确保事务正确提交）
    try {
      const allAccounts = accountDao.findAll();
      for (const account of allAccounts) {
        accountDao.delete(account.id);
      }
    } catch (error) {
      // 如果清理失败，记录错误但继续
      console.error('清理账号时出错:', error);
    }
  });

  /**
   * 属性 4: 账号列表数据完整性
   * 验证需求: 1.8
   *
   * 对于任何账号列表查询，返回的每个账号对象都应该包含
   * 手机号、昵称、添加方式和在线状态字段。
   */
  describe('属性 4: 账号列表数据完整性', () => {
    test('属性 4.1: 所有账号都应该包含必需字段', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成多个账号数据
          fc.array(
            fc.record({
              phoneNumber: fc
                .string({ minLength: 10, maxLength: 15 })
                .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
              username: fc.option(fc.string({ minLength: 3, maxLength: 20 }), { nil: undefined }),
              firstName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
              lastName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
              addMethod: fc.constantFrom('phone' as const, 'session' as const),
              status: fc.constantFrom('online' as const, 'offline' as const, 'restricted' as const),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (accountsData) => {
            // 创建多个账号
            const createdAccounts = accountsData.map((data, index) => {
              const uniquePhone = generateUniquePhone(data.phoneNumber);
              return accountDao.create({
                phoneNumber: uniquePhone,
                username: data.username,
                firstName: data.firstName,
                lastName: data.lastName,
                addMethod: data.addMethod,
                session: '',
                status: data.status,
              });
            });

            try {
              // 获取账号列表
              const accounts = await accountService.getAllAccounts();

              // 验证：返回的账号数量应该至少包含我们创建的账号
              expect(accounts.length).toBeGreaterThanOrEqual(createdAccounts.length);

              // 验证：每个账号都应该包含必需字段
              for (const account of accounts) {
                // 必需字段：手机号
                expect(account.phoneNumber).toBeDefined();
                expect(typeof account.phoneNumber).toBe('string');
                expect(account.phoneNumber.length).toBeGreaterThan(0);

                // 必需字段：添加方式
                expect(account.addMethod).toBeDefined();
                expect(['phone', 'session']).toContain(account.addMethod);

                // 必需字段：在线状态
                expect(account.status).toBeDefined();
                expect(['online', 'offline', 'restricted']).toContain(account.status);

                // 可选字段：昵称（username、firstName、lastName）
                // 如果存在，应该是字符串类型
                if (account.username !== undefined && account.username !== null) {
                  expect(typeof account.username).toBe('string');
                }
                if (account.firstName !== undefined && account.firstName !== null) {
                  expect(typeof account.firstName).toBe('string');
                }
                if (account.lastName !== undefined && account.lastName !== null) {
                  expect(typeof account.lastName).toBe('string');
                }

                // 其他必需字段
                expect(account.id).toBeDefined();
                expect(typeof account.id).toBe('string');
                expect(account.createdAt).toBeDefined();
                expect(account.updatedAt).toBeDefined();
              }
            } finally {
              // 清理测试账号
              for (const account of createdAccounts) {
                try {
                  accountDao.delete(account.id);
                } catch {
                  // 忽略删除错误
                }
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    test('属性 4.2: 空账号列表应该返回空数组', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          // 确保没有账号
          const allAccounts = accountDao.findAll();
          for (const account of allAccounts) {
            accountDao.delete(account.id);
          }

          // 获取账号列表
          const accounts = await accountService.getAllAccounts();

          // 验证：应该返回空数组
          expect(Array.isArray(accounts)).toBe(true);
          expect(accounts.length).toBe(0);
        }),
        { numRuns: 10 }
      );
    });

    test('属性 4.3: 账号列表应该包含所有创建的账号', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成多个账号数据
          fc.array(
            fc.record({
              phoneNumber: fc
                .string({ minLength: 10, maxLength: 15 })
                .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
              username: fc.option(fc.string({ minLength: 3, maxLength: 20 }), { nil: undefined }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (accountsData) => {
            // 创建多个账号
            const createdAccounts = accountsData.map((data, index) => {
              const uniquePhone = generateUniquePhone(data.phoneNumber);
              return accountDao.create({
                phoneNumber: uniquePhone,
                username: data.username,
                session: '',
                status: 'offline',
              });
            });

            try {
              // 获取账号列表
              const accounts = await accountService.getAllAccounts();

              // 验证：所有创建的账号都应该在列表中
              for (const createdAccount of createdAccounts) {
                const found = accounts.find((acc) => acc.id === createdAccount.id);
                expect(found).toBeDefined();
                expect(found?.phoneNumber).toBe(createdAccount.phoneNumber);
                expect(found?.username).toBe(createdAccount.username);
              }
            } finally {
              // 清理测试账号
              for (const account of createdAccounts) {
                try {
                  accountDao.delete(account.id);
                } catch {
                  // 忽略删除错误
                }
              }
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('属性 4.4: 账号列表中的数据应该与数据库一致', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据
          fc.array(
            fc.record({
              phoneNumber: fc
                .string({ minLength: 10, maxLength: 15 })
                .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
              username: fc.option(fc.string({ minLength: 3, maxLength: 20 }), { nil: undefined }),
              firstName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
              lastName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
              addMethod: fc.constantFrom('phone' as const, 'session' as const),
              status: fc.constantFrom('online' as const, 'offline' as const, 'restricted' as const),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (accountsData) => {
            // 创建多个账号
            const createdAccounts = accountsData.map((data, index) => {
              const uniquePhone = generateUniquePhone(data.phoneNumber);
              return accountDao.create({
                phoneNumber: uniquePhone,
                username: data.username,
                firstName: data.firstName,
                lastName: data.lastName,
                addMethod: data.addMethod,
                session: '',
                status: data.status,
              });
            });

            try {
              // 获取账号列表
              const accounts = await accountService.getAllAccounts();

              // 验证：列表中的每个账号数据应该与数据库一致
              for (const createdAccount of createdAccounts) {
                const foundInList = accounts.find((acc) => acc.id === createdAccount.id);
                const foundInDb = accountDao.findById(createdAccount.id);

                expect(foundInList).toBeDefined();
                expect(foundInDb).toBeDefined();

                // 验证数据一致性
                expect(foundInList?.phoneNumber).toBe(foundInDb?.phoneNumber);
                expect(foundInList?.username).toBe(foundInDb?.username);
                expect(foundInList?.firstName).toBe(foundInDb?.firstName);
                expect(foundInList?.lastName).toBe(foundInDb?.lastName);
                expect(foundInList?.addMethod).toBe(foundInDb?.addMethod);
                expect(foundInList?.status).toBe(foundInDb?.status);
              }
            } finally {
              // 清理测试账号
              for (const account of createdAccounts) {
                try {
                  accountDao.delete(account.id);
                } catch {
                  // 忽略删除错误
                }
              }
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('属性 4.5: 账号列表应该包含所有状态的账号', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成不同状态的账号
          fc.tuple(
            fc.record({
              phoneNumber: fc
                .string({ minLength: 10, maxLength: 15 })
                .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
            }),
            fc.record({
              phoneNumber: fc
                .string({ minLength: 10, maxLength: 15 })
                .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
            }),
            fc.record({
              phoneNumber: fc
                .string({ minLength: 10, maxLength: 15 })
                .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
            })
          ),
          async ([onlineData, offlineData, restrictedData]) => {
            // 创建不同状态的账号
            const onlineAccount = accountDao.create({
              phoneNumber: generateUniquePhone(onlineData.phoneNumber),
              session: '',
              status: 'online',
            });

            const offlineAccount = accountDao.create({
              phoneNumber: generateUniquePhone(offlineData.phoneNumber),
              session: '',
              status: 'offline',
            });

            const restrictedAccount = accountDao.create({
              phoneNumber: generateUniquePhone(restrictedData.phoneNumber),
              session: '',
              status: 'restricted',
            });

            try {
              // 获取账号列表
              const accounts = await accountService.getAllAccounts();

              // 验证：所有状态的账号都应该在列表中
              const foundOnline = accounts.find((acc) => acc.id === onlineAccount.id);
              const foundOffline = accounts.find((acc) => acc.id === offlineAccount.id);
              const foundRestricted = accounts.find((acc) => acc.id === restrictedAccount.id);

              expect(foundOnline).toBeDefined();
              expect(foundOnline?.status).toBe('online');

              expect(foundOffline).toBeDefined();
              expect(foundOffline?.status).toBe('offline');

              expect(foundRestricted).toBeDefined();
              expect(foundRestricted?.status).toBe('restricted');
            } finally {
              // 清理测试账号
              accountDao.delete(onlineAccount.id);
              accountDao.delete(offlineAccount.id);
              accountDao.delete(restrictedAccount.id);
            }
          }
        ),
        { numRuns: 5 }
      );
    });

    test('属性 4.6: 账号列表应该包含所有添加方式的账号', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成不同添加方式的账号
          fc.tuple(
            fc.record({
              phoneNumber: fc
                .string({ minLength: 10, maxLength: 15 })
                .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
            }),
            fc.record({
              phoneNumber: fc
                .string({ minLength: 10, maxLength: 15 })
                .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
            })
          ),
          async ([phoneData, sessionData]) => {
            // 创建不同添加方式的账号
            const phoneAccount = accountDao.create({
              phoneNumber: generateUniquePhone(phoneData.phoneNumber),
              addMethod: 'phone',
              session: '',
              status: 'offline',
            });

            const sessionAccount = accountDao.create({
              phoneNumber: generateUniquePhone(sessionData.phoneNumber),
              addMethod: 'session',
              session: '',
              status: 'offline',
            });

            try {
              // 获取账号列表
              const accounts = await accountService.getAllAccounts();

              // 验证：所有添加方式的账号都应该在列表中
              const foundPhone = accounts.find((acc) => acc.id === phoneAccount.id);
              const foundSession = accounts.find((acc) => acc.id === sessionAccount.id);

              expect(foundPhone).toBeDefined();
              expect(foundPhone?.addMethod).toBe('phone');

              expect(foundSession).toBeDefined();
              expect(foundSession?.addMethod).toBe('session');
            } finally {
              // 清理测试账号
              accountDao.delete(phoneAccount.id);
              accountDao.delete(sessionAccount.id);
            }
          }
        ),
        { numRuns: 5 }
      );
    });

    test('属性 4.7: getAccounts 和 getAllAccounts 应该返回相同的结果', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据
          fc.array(
            fc.record({
              phoneNumber: fc
                .string({ minLength: 10, maxLength: 15 })
                .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
            }),
            { minLength: 1, maxLength: 5 } // 改为至少创建 1 个账号
          ),
          async (accountsData) => {
            // 创建账号
            const createdAccounts = accountsData.map((data, index) => {
              const uniquePhone = generateUniquePhone(data.phoneNumber);
              return accountDao.create({
                phoneNumber: uniquePhone,
                session: '',
                status: 'offline',
              });
            });

            try {
              // 使用两个方法获取账号列表
              const accountsFromGetAccounts = await accountService.getAccounts();
              const accountsFromGetAllAccounts = await accountService.getAllAccounts();

              // 验证：两个方法应该返回相同数量的账号
              expect(accountsFromGetAccounts.length).toBe(accountsFromGetAllAccounts.length);

              // 验证：我们创建的账号在两个列表中都存在
              const createdIds = new Set(createdAccounts.map((acc) => acc.id));
              const foundInGetAccounts = accountsFromGetAccounts.filter((acc) =>
                createdIds.has(acc.id)
              );
              const foundInGetAllAccounts = accountsFromGetAllAccounts.filter((acc) =>
                createdIds.has(acc.id)
              );

              // 验证：我们创建的账号数量应该一致
              expect(foundInGetAccounts.length).toBe(createdAccounts.length);
              expect(foundInGetAllAccounts.length).toBe(createdAccounts.length);

              // 验证：两个列表中我们创建的账号数据应该一致
              for (const account of foundInGetAccounts) {
                const found = foundInGetAllAccounts.find((acc) => acc.id === account.id);
                expect(found).toBeDefined();
                expect(found?.phoneNumber).toBe(account.phoneNumber);
              }
            } finally {
              // 清理测试账号
              for (const account of createdAccounts) {
                try {
                  accountDao.delete(account.id);
                } catch {
                  // 忽略删除错误
                }
              }
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('属性 4.8: 账号列表中不应该包含已删除的账号', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据
          fc.array(
            fc.record({
              phoneNumber: fc
                .string({ minLength: 10, maxLength: 15 })
                .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (accountsData) => {
            // 创建多个账号
            const createdAccounts = accountsData.map((data, index) => {
              const uniquePhone = generateUniquePhone(data.phoneNumber);
              return accountDao.create({
                phoneNumber: uniquePhone,
                session: '',
                status: 'offline',
              });
            });

            try {
              // 删除第一个账号
              const deletedAccount = createdAccounts[0];
              accountDao.delete(deletedAccount.id);

              // 获取账号列表
              const accounts = await accountService.getAllAccounts();

              // 验证：已删除的账号不应该在列表中
              const foundDeleted = accounts.find((acc) => acc.id === deletedAccount.id);
              expect(foundDeleted).toBeUndefined();

              // 验证：其他账号应该在列表中
              for (let i = 1; i < createdAccounts.length; i++) {
                const found = accounts.find((acc) => acc.id === createdAccounts[i].id);
                expect(found).toBeDefined();
              }
            } finally {
              // 清理测试账号
              for (const account of createdAccounts) {
                try {
                  accountDao.delete(account.id);
                } catch {
                  // 忽略删除错误
                }
              }
            }
          }
        ),
        { numRuns: 5 }
      );
    });

    test('属性 4.9: 账号列表应该按创建时间倒序排列', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据
          fc.array(
            fc.record({
              phoneNumber: fc
                .string({ minLength: 10, maxLength: 15 })
                .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (accountsData) => {
            // 创建多个账号（按顺序创建，确保时间戳递增）
            const createdAccounts = [];
            for (let i = 0; i < accountsData.length; i++) {
              const uniquePhone = generateUniquePhone(accountsData[i].phoneNumber);
              const account = accountDao.create({
                phoneNumber: uniquePhone,
                session: '',
                status: 'offline',
              });
              createdAccounts.push(account);

              // 添加小延迟确保时间戳不同
              await new Promise((resolve) => setTimeout(resolve, 10));
            }

            try {
              // 获取账号列表
              const accounts = await accountService.getAllAccounts();

              // 过滤出我们创建的账号
              const createdIds = new Set(createdAccounts.map((acc) => acc.id));
              const ourAccounts = accounts.filter((acc) => createdIds.has(acc.id));

              // 验证：我们创建的账号应该按创建时间倒序排列
              for (let i = 0; i < ourAccounts.length - 1; i++) {
                const current = new Date(ourAccounts[i].createdAt).getTime();
                const next = new Date(ourAccounts[i + 1].createdAt).getTime();
                expect(current).toBeGreaterThanOrEqual(next);
              }
            } finally {
              // 清理测试账号
              for (const account of createdAccounts) {
                try {
                  accountDao.delete(account.id);
                } catch {
                  // 忽略删除错误
                }
              }
            }
          }
        ),
        { numRuns: 5 }
      );
    });

    test('属性 4.10: 账号列表中的每个账号都应该有唯一的ID', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据
          fc.array(
            fc.record({
              phoneNumber: fc
                .string({ minLength: 10, maxLength: 15 })
                .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (accountsData) => {
            // 创建多个账号
            const createdAccounts = accountsData.map((data, index) => {
              const uniquePhone = generateUniquePhone(data.phoneNumber);
              return accountDao.create({
                phoneNumber: uniquePhone,
                session: '',
                status: 'offline',
              });
            });

            try {
              // 获取账号列表
              const accounts = await accountService.getAllAccounts();

              // 验证：所有账号ID应该唯一
              const ids = accounts.map((acc) => acc.id);
              const uniqueIds = new Set(ids);
              expect(uniqueIds.size).toBe(ids.length);
            } finally {
              // 清理测试账号
              for (const account of createdAccounts) {
                try {
                  accountDao.delete(account.id);
                } catch {
                  // 忽略删除错误
                }
              }
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * 属性 4.11: 账号列表的边界条件测试
   */
  describe('属性 4.11: 账号列表的边界条件', () => {
    test('属性 4.11.1: 单个账号的列表应该正确返回', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            phoneNumber: fc
              .string({ minLength: 10, maxLength: 15 })
              .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
            username: fc.option(fc.string({ minLength: 3, maxLength: 20 }), { nil: undefined }),
          }),
          async (accountData) => {
            const uniquePhone = generateUniquePhone(accountData.phoneNumber);

            // 创建单个账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              username: accountData.username,
              session: '',
              status: 'offline',
            });

            try {
              // 获取账号列表
              const accounts = await accountService.getAllAccounts();

              // 验证：列表应该包含这个账号
              expect(accounts.length).toBeGreaterThanOrEqual(1);
              const found = accounts.find((acc) => acc.id === account.id);
              expect(found).toBeDefined();
              expect(found?.phoneNumber).toBe(uniquePhone);

              // 数据库将 undefined 存储为 NULL，读取时返回 null
              if (accountData.username === undefined) {
                expect(found?.username == null).toBe(true);
              } else {
                expect(found?.username).toBe(accountData.username);
              }
            } finally {
              // 清理测试账号
              accountDao.delete(account.id);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('属性 4.11.2: 大量账号的列表应该正确返回', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成较多账号数据
          fc.array(
            fc.record({
              phoneNumber: fc
                .string({ minLength: 10, maxLength: 15 })
                .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
            }),
            { minLength: 10, maxLength: 20 }
          ),
          async (accountsData) => {
            // 创建多个账号
            const createdAccounts = accountsData.map((data, index) => {
              const uniquePhone = generateUniquePhone(data.phoneNumber);
              return accountDao.create({
                phoneNumber: uniquePhone,
                session: '',
                status: 'offline',
              });
            });

            try {
              // 获取账号列表
              const accounts = await accountService.getAllAccounts();

              // 验证：列表应该包含所有创建的账号
              expect(accounts.length).toBeGreaterThanOrEqual(createdAccounts.length);

              for (const createdAccount of createdAccounts) {
                const found = accounts.find((acc) => acc.id === createdAccount.id);
                expect(found).toBeDefined();
              }
            } finally {
              // 清理测试账号
              for (const account of createdAccounts) {
                try {
                  accountDao.delete(account.id);
                } catch {
                  // 忽略删除错误
                }
              }
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('属性 4.11.3: 包含特殊字符的账号应该正确显示', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            phoneNumber: fc
              .string({ minLength: 10, maxLength: 15 })
              .map((s) => '+' + s.replace(/\D/g, '').slice(0, 15)),
            username: fc.option(
              fc
                .string({ minLength: 3, maxLength: 20 })
                .map((s) => s.replace(/[^a-zA-Z0-9_]/g, '')),
              { nil: undefined }
            ),
            firstName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            lastName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          }),
          async (accountData) => {
            const uniquePhone = generateUniquePhone(accountData.phoneNumber);

            // 创建账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              username: accountData.username,
              firstName: accountData.firstName,
              lastName: accountData.lastName,
              session: '',
              status: 'offline',
            });

            try {
              // 获取账号列表
              const accounts = await accountService.getAllAccounts();

              // 验证：账号应该在列表中且数据完整
              const found = accounts.find((acc) => acc.id === account.id);
              expect(found).toBeDefined();
              expect(found?.phoneNumber).toBe(uniquePhone);

              // 数据库将 undefined 存储为 NULL，读取时返回 null
              // 所以我们需要比较时考虑 undefined 和 null 的等价性
              if (accountData.username === undefined) {
                expect(found?.username == null).toBe(true); // null 或 undefined
              } else {
                expect(found?.username).toBe(accountData.username);
              }

              if (accountData.firstName === undefined) {
                expect(found?.firstName == null).toBe(true);
              } else {
                expect(found?.firstName).toBe(accountData.firstName);
              }

              if (accountData.lastName === undefined) {
                expect(found?.lastName == null).toBe(true);
              } else {
                expect(found?.lastName).toBe(accountData.lastName);
              }
            } finally {
              // 清理测试账号
              accountDao.delete(account.id);
            }
          }
        ),
        { numRuns: 5 }
      );
    });
  });
});
