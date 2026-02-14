import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { AccountService } from './AccountService';
import { DaoFactory } from '../database/dao';
import { runMigrations } from '../database/migrations';
import fs from 'fs';
import path from 'path';
import { encrypt } from '../utils/crypto';
import { ClientPool } from '../telegram/ClientPool';

/**
 * AccountService 会话文件操作属性测试
 * Feature: telegram-content-manager
 *
 * 属性 1: 会话文件往返一致性
 * 验证需求: 1.13, 8.2
 *
 * 属性 2: 会话文件验证拒绝无效输入
 * 验证需求: 1.5
 */

describe('AccountService Session Property Tests - 会话文件操作', () => {
  let accountService: AccountService;
  let accountDao: ReturnType<typeof DaoFactory.getInstance>['getAccountDao'];
  let db: Database.Database;
  const testDbPath = path.join(__dirname, '../../test-data/session-property-test.db');
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
    accountService = new AccountService();
    accountDao = DaoFactory.getInstance().getAccountDao();
  });

  /**
   * 属性 2: 会话文件验证拒绝无效输入
   * 验证需求: 1.5
   *
   * 对于任何无效或损坏的会话文件，系统应该拒绝导入并返回明确的错误信息。
   */
  describe('属性 2: 会话文件验证拒绝无效输入', () => {
    test('属性 2.1: 空会话文件应该被拒绝', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成空字符串或只包含空白字符的字符串
          fc.constantFrom('', '   ', '\n', '\t', '  \n  '),
          async (emptyContent) => {
            const emptyBuffer = Buffer.from(emptyContent, 'utf-8');

            await expect(
              accountService.importAccountFromSession(emptyBuffer, 'test.session')
            ).rejects.toThrow('会话文件内容为空');
          }
        ),
        { numRuns: 10 }
      );
    });

    test('属性 2.2: 格式无效的会话文件应该被拒绝', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成不符合GramJS StringSession格式的字符串
          // GramJS StringSession应该以'1'开头且长度至少100
          fc.oneof(
            // 不以'1'开头的字符串
            fc
              .string({ minLength: 100, maxLength: 200 })
              .filter((s) => !s.startsWith('1'))
              .map((s) => (s.startsWith('1') ? '2' + s.slice(1) : s)),
            // 长度不足100的字符串
            fc.string({ minLength: 1, maxLength: 99 }),
            // 随机无效格式
            fc.constantFrom(
              'invalid',
              '0' + 'x'.repeat(100),
              '2' + 'a'.repeat(100),
              'not-a-session-string'
            )
          ),
          async (invalidContent) => {
            const invalidBuffer = Buffer.from(invalidContent, 'utf-8');

            await expect(
              accountService.importAccountFromSession(invalidBuffer, 'test.session')
            ).rejects.toThrow();
          }
        ),
        { numRuns: 50 }
      );
    });

    test('属性 2.3: 非UTF-8编码的会话文件应该被拒绝或处理', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成随机字节数组
          fc.uint8Array({ minLength: 10, maxLength: 200 }),
          async (randomBytes) => {
            const buffer = Buffer.from(randomBytes);

            // 尝试导入，应该抛出错误或被正确处理
            await expect(
              accountService.importAccountFromSession(buffer, 'test.session')
            ).rejects.toThrow();
          }
        ),
        { numRuns: 50 }
      );
    });

    test('属性 2.4: 会话文件长度边界测试', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成边界长度的字符串
          fc.integer({ min: 0, max: 150 }),
          async (length) => {
            const content = '1' + 'a'.repeat(Math.max(0, length - 1));
            const buffer = Buffer.from(content, 'utf-8');

            if (length < 100) {
              // 长度不足应该被拒绝
              await expect(
                accountService.importAccountFromSession(buffer, 'test.session')
              ).rejects.toThrow('无效的会话文件格式');
            } else {
              // 长度足够但内容无效，应该在后续验证中失败
              await expect(
                accountService.importAccountFromSession(buffer, 'test.session')
              ).rejects.toThrow();
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * 属性 1: 会话文件往返一致性
   * 验证需求: 1.13, 8.2
   *
   * 对于任何有效的账号会话，导出为会话文件后再导入，
   * 应该能够成功建立连接并获得相同的账号信息。
   *
   * 注意：由于需要真实的Telegram连接，这个测试使用模拟的会话数据
   * 来验证导出导入的数据一致性，而不是实际的Telegram连接。
   */
  describe('属性 1: 会话文件往返一致性', () => {
    test('属性 1.1: 导出的会话文件应该包含有效的会话数据', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据
          fc.record({
            phoneNumber: phoneArbitrary,
            // 模拟有效的GramJS StringSession格式
            sessionString: fc
              .string({ minLength: 100, maxLength: 200 })
              .map((s) => '1' + s.slice(1)),
          }),
          async (accountData) => {
            // 确保手机号唯一
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            // 创建一个带有会话的账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              session: encrypt(accountData.sessionString),
              status: 'online',
            });

            try {
              // 导出会话文件
              const exportedBuffer = await accountService.exportAccountSession(account.id);

              // 验证：导出的Buffer应该不为空
              expect(exportedBuffer).toBeDefined();
              expect(exportedBuffer.length).toBeGreaterThan(0);

              // 验证：导出的内容应该是有效的UTF-8字符串
              const exportedString = exportedBuffer.toString('utf-8');
              expect(exportedString).toBeTruthy();
              expect(exportedString.length).toBeGreaterThan(0);

              // 验证：导出的会话字符串应该符合GramJS格式
              expect(exportedString.startsWith('1')).toBe(true);
              expect(exportedString.length).toBeGreaterThanOrEqual(100);
            } finally {
              // 清理测试数据
              accountDao.delete(account.id);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    test('属性 1.2: 导出后的会话数据应该与原始会话数据一致', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据
          fc.record({
            phoneNumber: phoneArbitrary,
            // 模拟有效的GramJS StringSession格式
            sessionString: fc
              .string({ minLength: 100, maxLength: 200 })
              .map((s) => '1' + s.slice(1)),
          }),
          async (accountData) => {
            // 确保手机号唯一
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            // 创建一个带有会话的账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              session: encrypt(accountData.sessionString),
              status: 'online',
            });

            try {
              // 导出会话文件
              const exportedBuffer = await accountService.exportAccountSession(account.id);
              const exportedString = exportedBuffer.toString('utf-8');

              // 验证：导出的会话字符串应该与原始会话字符串一致
              expect(exportedString).toBe(accountData.sessionString);
            } finally {
              // 清理测试数据
              accountDao.delete(account.id);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    test('属性 1.3: 账号不存在时导出应该失败', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成随机的不存在的账号ID
          fc.uuid(),
          async (nonExistentId) => {
            // 确保ID不存在
            const account = accountDao.findById(nonExistentId);
            if (account) {
              accountDao.delete(nonExistentId);
            }

            // 尝试导出不存在的账号
            await expect(accountService.exportAccountSession(nonExistentId)).rejects.toThrow(
              '账号不存在'
            );
          }
        ),
        { numRuns: 20 }
      );
    });

    test('属性 1.4: 账号未登录时导出应该失败', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据（无会话）
          fc.record({
            phoneNumber: phoneArbitrary,
          }),
          async (accountData) => {
            // 确保手机号唯一
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            // 创建一个没有会话的账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              session: '', // 空会话
              status: 'offline',
            });

            try {
              // 尝试导出会话
              await expect(accountService.exportAccountSession(account.id)).rejects.toThrow(
                '账号未登录'
              );
            } finally {
              // 清理测试数据
              accountDao.delete(account.id);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    test('属性 1.5: 多次导出同一账号应该返回相同的会话数据', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成账号数据
          fc.record({
            phoneNumber: phoneArbitrary,
            sessionString: fc
              .string({ minLength: 100, maxLength: 200 })
              .map((s) => '1' + s.slice(1)),
          }),
          // 生成导出次数
          fc.integer({ min: 2, max: 5 }),
          async (accountData, exportCount) => {
            // 确保手机号唯一
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            // 创建一个带有会话的账号
            const account = accountDao.create({
              phoneNumber: uniquePhone,
              session: encrypt(accountData.sessionString),
              status: 'online',
            });

            try {
              // 多次导出
              const exports: string[] = [];
              for (let i = 0; i < exportCount; i++) {
                const exportedBuffer = await accountService.exportAccountSession(account.id);
                exports.push(exportedBuffer.toString('utf-8'));
              }

              // 验证：所有导出的内容应该完全一致
              const firstExport = exports[0];
              exports.forEach((exp) => {
                expect(exp).toBe(firstExport);
              });
            } finally {
              // 清理测试数据
              accountDao.delete(account.id);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * 属性 1.6: 会话数据完整性验证
   * 验证导出的会话数据不会丢失或损坏
   */
  describe('属性 1.6: 会话数据完整性', () => {
    test('属性 1.6.1: 导出的会话数据长度应该与原始数据一致', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            phoneNumber: phoneArbitrary,
            sessionString: fc
              .string({ minLength: 100, maxLength: 500 })
              .map((s) => '1' + s.slice(1)),
          }),
          async (accountData) => {
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            const account = accountDao.create({
              phoneNumber: uniquePhone,
              session: encrypt(accountData.sessionString),
              status: 'online',
            });

            try {
              const exportedBuffer = await accountService.exportAccountSession(account.id);
              const exportedString = exportedBuffer.toString('utf-8');

              // 验证：长度应该一致
              expect(exportedString.length).toBe(accountData.sessionString.length);
            } finally {
              accountDao.delete(account.id);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    test('属性 1.6.2: 导出的会话数据应该保持字符完整性', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            phoneNumber: phoneArbitrary,
            // 包含各种字符的会话字符串
            sessionString: fc
              .string({ minLength: 100, maxLength: 200 })
              .map((s) => '1' + s.slice(1)),
          }),
          async (accountData) => {
            const uniquePhone = buildUniquePhone(accountData.phoneNumber);

            const account = accountDao.create({
              phoneNumber: uniquePhone,
              session: encrypt(accountData.sessionString),
              status: 'online',
            });

            try {
              const exportedBuffer = await accountService.exportAccountSession(account.id);
              const exportedString = exportedBuffer.toString('utf-8');

              // 验证：每个字符都应该一致
              for (let i = 0; i < accountData.sessionString.length; i++) {
                expect(exportedString[i]).toBe(accountData.sessionString[i]);
              }
            } finally {
              accountDao.delete(account.id);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
