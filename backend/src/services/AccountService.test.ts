import { AccountService } from './AccountService';
import { DaoFactory } from '../database/dao';
import Database from 'better-sqlite3';
import { runMigrations } from '../database/migrations';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ClientPool } from '../telegram/ClientPool';

/**
 * AccountService 单元测试
 *
 * 注意：这些测试需要真实的Telegram API凭证才能运行
 * 在CI/CD环境中，这些测试应该被跳过或使用mock
 */
describe('AccountService', () => {
  let accountService: AccountService;
  let accountDao: ReturnType<typeof DaoFactory.getInstance>['getAccountDao'];
  let db: Database.Database;
  const testDbPath = path.join(__dirname, '../../test-data/test.db');

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

  afterAll(() => {
    ClientPool.getInstance().stopBackgroundTasks();

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

  describe('addAccount', () => {
    it('应该拒绝重复添加相同手机号', async () => {
      const phoneNumber = '+1234567890';

      // 创建一个测试账号
      const account = accountDao.create({
        phoneNumber,
        session: '',
        status: 'offline',
      });

      try {
        await accountService.addAccount(phoneNumber);
        fail('应该抛出错误');
      } catch (error: any) {
        expect(error.message).toBe('该手机号已添加');
      } finally {
        // 清理测试数据
        accountDao.delete(account.id);
      }
    });
  });

  describe('verifyCode', () => {
    it('应该在账号不存在时抛出错误', async () => {
      try {
        await accountService.verifyCode('non-existent-id', '12345', 'hash');
        fail('应该抛出错误');
      } catch (error: any) {
        expect(error.message).toBe('账号不存在');
      }
    });

    it('应该在客户端不存在时抛出错误', async () => {
      // 创建一个测试账号
      const account = accountDao.create({
        phoneNumber: '+1234567890',
        session: '',
        status: 'offline',
      });

      try {
        await accountService.verifyCode(account.id, '12345', 'hash');
        fail('应该抛出错误');
      } catch (error: any) {
        expect(error.message).toBe('客户端不存在，请重新开始登录流程');
      } finally {
        // 清理测试数据
        accountDao.delete(account.id);
      }
    });
  });

  describe('verifyPassword', () => {
    it('应该在账号不存在时抛出错误', async () => {
      try {
        await accountService.verifyPassword('non-existent-id', 'password');
        fail('应该抛出错误');
      } catch (error: any) {
        expect(error.message).toBe('账号不存在');
      }
    });
  });

  describe('getAccounts', () => {
    it('应该返回所有账号列表', async () => {
      const accounts = await accountService.getAccounts();
      expect(Array.isArray(accounts)).toBe(true);
    });
  });

  describe('deleteAccount', () => {
    it('应该能够删除账号', async () => {
      // 创建一个测试账号
      const account = accountDao.create({
        phoneNumber: '+1234567890',
        session: '',
        status: 'offline',
      });

      await accountService.deleteAccount(account.id);

      // 验证账号已被删除
      const deletedAccount = accountDao.findById(account.id);
      expect(deletedAccount).toBeUndefined();
    });

    it('应该在账号不存在时抛出错误', async () => {
      try {
        await accountService.deleteAccount('non-existent-id');
        fail('应该抛出错误');
      } catch (error: any) {
        expect(error.message).toBe('账号不存在');
      }
    });
  });

  describe('checkAccountStatus', () => {
    it('应该在账号不存在时抛出错误', async () => {
      try {
        await accountService.checkAccountStatus('non-existent-id');
        fail('应该抛出错误');
      } catch (error: any) {
        expect(error.message).toBe('账号不存在');
      }
    });

    it('应该返回离线状态当账号没有会话时', async () => {
      // 创建一个测试账号
      const account = accountDao.create({
        phoneNumber: '+1234567890',
        session: '',
        status: 'offline',
      });

      try {
        const status = await accountService.checkAccountStatus(account.id);
        expect(status.status).toBe('offline');
        expect(status.isAuthorized).toBe(false);
      } finally {
        // 清理测试数据
        accountDao.delete(account.id);
      }
    });
  });

  describe('getAllAccounts', () => {
    it('应该返回所有账号列表', async () => {
      const accounts = await accountService.getAllAccounts();
      expect(Array.isArray(accounts)).toBe(true);
    });
  });

  describe('getAccount', () => {
    it('应该返回指定账号', async () => {
      // 创建一个测试账号
      const account = accountDao.create({
        phoneNumber: '+1234567890',
        session: '',
        status: 'offline',
      });

      try {
        const foundAccount = await accountService.getAccount(account.id);
        expect(foundAccount).not.toBeNull();
        expect(foundAccount?.phoneNumber).toBe('+1234567890');
      } finally {
        // 清理测试数据
        accountDao.delete(account.id);
      }
    });

    it('应该返回null当账号不存在时', async () => {
      const account = await accountService.getAccount('non-existent-id');
      expect(account).toBeNull();
    });
  });

  describe('exportAccountSession', () => {
    it('应该在账号不存在时抛出错误', async () => {
      try {
        await accountService.exportAccountSession('non-existent-id');
        fail('应该抛出错误');
      } catch (error: any) {
        expect(error.message).toContain('账号不存在');
      }
    });

    it('应该在账号未登录时抛出错误', async () => {
      // 创建一个测试账号
      const account = accountDao.create({
        phoneNumber: '+1234567890',
        session: '',
        status: 'offline',
      });

      try {
        await accountService.exportAccountSession(account.id);
        fail('应该抛出错误');
      } catch (error: any) {
        expect(error.message).toContain('账号未登录');
      } finally {
        // 清理测试数据
        accountDao.delete(account.id);
      }
    });
  });

  describe('importAccountFromSession', () => {
    it('应该在会话文件为空时抛出错误', async () => {
      const emptyBuffer = Buffer.from('', 'utf-8');

      try {
        await accountService.importAccountFromSession(emptyBuffer, 'test.session');
        fail('应该抛出错误');
      } catch (error: any) {
        expect(error.message).toContain('会话文件内容为空');
      }
    });

    it('应该在会话文件格式无效时抛出错误', async () => {
      const invalidBuffer = Buffer.from('invalid session data', 'utf-8');

      try {
        await accountService.importAccountFromSession(invalidBuffer, 'test.session');
        fail('应该抛出错误');
      } catch (error: any) {
        expect(error.message).toContain('无效的会话文件格式');
      }
    });

    it('应该支持解析Telethon SQLite会话文件格式', async () => {
      const tempSessionPath = path.join(
        os.tmpdir(),
        `telethon-test-${Date.now()}-${Math.random().toString(16).slice(2)}.session`
      );
      const sessionDb = new Database(tempSessionPath);

      try {
        sessionDb.exec(`
          CREATE TABLE sessions (
            dc_id INTEGER PRIMARY KEY,
            server_address TEXT,
            port INTEGER,
            auth_key BLOB,
            takeout_id INTEGER
          );
        `);

        const authKey = Buffer.alloc(256, 7);
        sessionDb
          .prepare(
            `
            INSERT INTO sessions (dc_id, server_address, port, auth_key, takeout_id)
            VALUES (?, ?, ?, ?, NULL)
          `
          )
          .run(5, '149.154.171.5', 443, authKey);
      } finally {
        sessionDb.close();
      }

      try {
        const sessionBuffer = fs.readFileSync(tempSessionPath);
        const parser = (accountService as any).parseSessionStringFromFile.bind(accountService);
        const parsed = await parser(sessionBuffer);

        expect(typeof parsed).toBe('string');
        expect(parsed.startsWith('1')).toBe(true);
      } finally {
        fs.rmSync(tempSessionPath, { force: true });
      }
    });
  });

  describe('checkAllAccountsStatus', () => {
    it('应该能够检查所有账号状态', async () => {
      // 创建测试账号
      const account = accountDao.create({
        phoneNumber: '+1234567890',
        session: '',
        status: 'offline',
      });

      try {
        await accountService.checkAllAccountsStatus();
        // 验证方法执行成功（不抛出错误）
        expect(true).toBe(true);
      } finally {
        // 清理测试数据
        accountDao.delete(account.id);
      }
    });
  });
});
