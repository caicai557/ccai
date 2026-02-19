import { DaoFactory } from '../database/dao';
import { TelegramClientWrapper } from '../telegram/TelegramClientWrapper';
import { ClientPool } from '../telegram/ClientPool';
import { SessionManager } from '../telegram/SessionManager';
import { logger } from '../utils/logger';
import { Account, AccountPoolStatus } from '../types';
import { wsManager } from '../routes/ws';
import { StringSession } from 'telegram/sessions';
import { AuthKey } from 'telegram/crypto/AuthKey';
import { getTelegramConfig } from '../config';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * 账号服务
 */
export class AccountService {
  private accountDao = DaoFactory.getInstance().getAccountDao();
  private clientPool = ClientPool.getInstance();
  private sessionManager = SessionManager.getInstance();
  private readonly sqliteSessionMagic = Buffer.from('SQLite format 3\0', 'ascii');

  /**
   * 添加账号（开始登录流程）
   */
  async addAccount(phoneNumber: string): Promise<{ accountId: string; phoneCodeHash: string }> {
    // 检查账号是否已存在
    const existing = this.accountDao.findByPhoneNumber(phoneNumber);
    if (existing) {
      throw new Error('该手机号已添加');
    }

    // 启动登录流程前先校验 Telegram 凭证，避免创建脏账号记录
    getTelegramConfig();

    // 创建临时账号记录
    const tempAccount = this.accountDao.create({
      phoneNumber,
      session: '',
      status: 'offline',
    });
    let client: TelegramClientWrapper | null = null;

    try {
      // 创建Telegram客户端
      client = new TelegramClientWrapper(tempAccount.id, phoneNumber);

      // 发送验证码
      const phoneCodeHash = await client.sendCode();

      // 保存客户端到连接池
      this.clientPool.addClient(tempAccount.id, client);

      logger.info(`账号添加流程已启动: ${phoneNumber}`);

      return {
        accountId: tempAccount.id,
        phoneCodeHash,
      };
    } catch (error) {
      // 如果失败，删除临时账号
      if (client) {
        await client.disconnect();
      }
      this.accountDao.delete(tempAccount.id);
      throw error;
    }
  }

  /**
   * 验证验证码
   */
  async verifyCode(accountId: string, code: string, phoneCodeHash: string): Promise<void> {
    const account = this.accountDao.findById(accountId);
    if (!account) {
      throw new Error('账号不存在');
    }

    const client = await this.clientPool.getClient(accountId);
    if (!client) {
      throw new Error('客户端不存在，请重新开始登录流程');
    }

    try {
      await client.signIn(code, phoneCodeHash);

      // 获取用户信息
      const me = await client.getMe();

      // 保存会话
      await client.saveSession();

      // 更新账号信息
      this.accountDao.update(accountId, {
        username: me.username || undefined,
        firstName: me.firstName || undefined,
        lastName: me.lastName || undefined,
        status: 'online',
        lastActive: new Date().toISOString() as any,
      });

      logger.info(`✅ 账号验证成功: ${account.phoneNumber}`);
    } catch (error: any) {
      if (error.message === 'SESSION_PASSWORD_NEEDED') {
        // 需要两步验证
        throw error;
      }
      // 其他错误，删除账号
      this.accountDao.delete(accountId);
      await this.clientPool.removeClient(accountId);
      throw error;
    }
  }

  /**
   * 验证两步验证密码
   */
  async verifyPassword(accountId: string, password: string): Promise<void> {
    const account = this.accountDao.findById(accountId);
    if (!account) {
      throw new Error('账号不存在');
    }

    const client = await this.clientPool.getClient(accountId);
    if (!client) {
      throw new Error('客户端不存在，请重新开始登录流程');
    }

    try {
      await client.signInWithPassword(password);

      // 获取用户信息
      const me = await client.getMe();

      // 保存会话
      await client.saveSession();

      // 更新账号信息
      this.accountDao.update(accountId, {
        username: me.username || undefined,
        firstName: me.firstName || undefined,
        lastName: me.lastName || undefined,
        status: 'online',
        lastActive: new Date().toISOString() as any,
      });

      logger.info(`✅ 账号两步验证成功: ${account.phoneNumber}`);
    } catch (error) {
      // 验证失败，删除账号
      this.accountDao.delete(accountId);
      await this.clientPool.removeClient(accountId);
      throw error;
    }
  }
  /**
   * 通过会话文件导入账号
   */
  async importAccountFromSession(sessionFile: Buffer, _filename: string): Promise<Account> {
    try {
      // 解析会话文件内容
      const sessionString = await this.parseSessionStringFromFile(sessionFile);

      // 创建临时客户端来验证会话
      const tempAccountId = `temp_${Date.now()}`;
      const tempClient = new TelegramClientWrapper(tempAccountId, '', sessionString);
      let importedClient: TelegramClientWrapper | null = null;
      let createdAccount: Account | null = null;

      try {
        // 连接并验证会话
        await tempClient.connect();
        const isValid = await tempClient.isUserAuthorized();

        if (!isValid) {
          throw new Error('会话已失效或无效');
        }

        // 获取用户信息
        const me = await tempClient.getMe();

        if (!me.phone) {
          throw new Error('无法从会话中获取手机号');
        }

        // 检查账号是否已存在
        const existing = this.accountDao.findByPhoneNumber(me.phone);
        if (existing) {
          throw new Error('该手机号已添加');
        }

        // 创建账号记录
        createdAccount = this.accountDao.create({
          phoneNumber: me.phone,
          username: me.username || undefined,
          firstName: me.firstName || undefined,
          lastName: me.lastName || undefined,
          addMethod: 'session',
          session: '',
          status: 'online',
        });

        // 更新账号ID并重新保存会话
        importedClient = new TelegramClientWrapper(createdAccount.id, me.phone, sessionString);
        await importedClient.connect();

        const isAuthorizedAfterImport = await importedClient.isUserAuthorized();
        if (!isAuthorizedAfterImport) {
          throw new Error('会话导入后授权验证失败');
        }

        await importedClient.saveSession();

        // 添加到连接池
        this.clientPool.addClient(createdAccount.id, importedClient);

        logger.info(`✅ 账号已从会话文件导入: ${me.phone}`);

        return this.accountDao.findById(createdAccount.id)!;
      } catch (error) {
        // 回滚已创建的资源，避免产生脏账号数据
        if (importedClient) {
          await importedClient.disconnect();
        }
        if (createdAccount) {
          await this.clientPool.removeClient(createdAccount.id);
          this.accountDao.delete(createdAccount.id);
        }
        throw error;
      } finally {
        // 清理临时客户端
        await tempClient.disconnect();
      }
    } catch (error) {
      logger.error('导入会话文件失败', error);
      throw new Error(`导入会话文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 从上传文件中解析 GramJS StringSession
   * 兼容纯文本 StringSession 与 Telethon SQLite .session 文件
   */
  private async parseSessionStringFromFile(sessionFile: Buffer): Promise<string> {
    if (!sessionFile || sessionFile.length === 0) {
      throw new Error('会话文件内容为空');
    }

    if (
      sessionFile.length >= this.sqliteSessionMagic.length &&
      sessionFile.subarray(0, this.sqliteSessionMagic.length).equals(this.sqliteSessionMagic)
    ) {
      return this.convertTelethonSqliteSession(sessionFile);
    }

    const sessionString = sessionFile
      .toString('utf-8')
      .trim()
      .replace(/^['"]|['"]$/g, '');

    if (!sessionString) {
      throw new Error('会话文件内容为空');
    }

    try {
      new StringSession(sessionString);
      return sessionString;
    } catch {
      throw new Error('无效的会话文件格式');
    }
  }

  /**
   * 将 Telethon SQLite .session 转换为 GramJS StringSession
   */
  private async convertTelethonSqliteSession(sessionFile: Buffer): Promise<string> {
    const tempSessionPath = path.join(
      os.tmpdir(),
      `telethon-session-${Date.now()}-${Math.random().toString(16).slice(2)}.session`
    );
    let db: Database.Database | null = null;

    try {
      fs.writeFileSync(tempSessionPath, sessionFile);
      db = new Database(tempSessionPath, { readonly: true, fileMustExist: true });

      const row = db
        .prepare(
          `
          SELECT
            dc_id AS dcId,
            server_address AS serverAddress,
            port,
            auth_key AS authKey
          FROM sessions
          WHERE auth_key IS NOT NULL AND length(auth_key) > 0
          ORDER BY dc_id DESC
          LIMIT 1
        `
        )
        .get() as
        | {
            dcId: number;
            serverAddress: string;
            port: number;
            authKey: Buffer | Uint8Array;
          }
        | undefined;

      if (!row || !row.authKey || !row.serverAddress || !row.port) {
        throw new Error('会话文件缺少有效的 sessions 记录');
      }

      const stringSession = new StringSession('');
      stringSession.setDC(Number(row.dcId), String(row.serverAddress), Number(row.port));

      const authKey = new AuthKey();
      await authKey.setKey(Buffer.from(row.authKey));
      stringSession.setAuthKey(authKey, Number(row.dcId));

      const convertedSession = stringSession.save();
      if (!convertedSession || !convertedSession.startsWith('1')) {
        throw new Error('会话文件转换失败');
      }

      return convertedSession;
    } catch (error) {
      logger.warn('SQLite会话文件转换失败', error);
      throw new Error('无效的会话文件格式');
    } finally {
      if (db) {
        db.close();
      }
      fs.rmSync(tempSessionPath, { force: true });
    }
  }

  /**
   * 导出账号会话文件
   */
  async exportAccountSession(accountId: string): Promise<Buffer> {
    try {
      const account = this.accountDao.findById(accountId);
      if (!account) {
        throw new Error('账号不存在');
      }

      if (!account.session) {
        throw new Error('账号未登录，无会话数据');
      }

      // 获取解密后的会话字符串
      const sessionString = await this.sessionManager.loadSession(accountId);

      // 转换为 Buffer
      const buffer = Buffer.from(sessionString, 'utf-8');

      logger.info(`✅ 账号会话已导出: ${account.phoneNumber}`);

      return buffer;
    } catch (error) {
      logger.error(`导出账号会话失败: ${accountId}`, error);
      throw new Error(`导出账号会话失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 获取账号列表
   */
  async getAccounts(poolStatus?: AccountPoolStatus): Promise<Account[]> {
    return this.accountDao.findAll(poolStatus);
  }

  /**
   * 获取所有账号（别名方法，符合设计文档接口）
   */
  async getAllAccounts(poolStatus?: AccountPoolStatus): Promise<Account[]> {
    return this.accountDao.findAll(poolStatus);
  }

  /**
   * 获取单个账号详情
   */
  async getAccount(accountId: string): Promise<Account | null> {
    const account = this.accountDao.findById(accountId);
    return account || null;
  }

  /**
   * 手动更新账号池运营状态
   */
  async updatePoolStatus(accountId: string, poolStatus: AccountPoolStatus): Promise<Account> {
    const account = this.accountDao.findById(accountId);
    if (!account) {
      throw new Error('账号不存在');
    }

    this.accountDao.updatePoolStatus(accountId, poolStatus);
    const updated = this.accountDao.findById(accountId);
    if (!updated) {
      throw new Error('账号状态更新失败');
    }

    return updated;
  }

  /**
   * 删除账号
   */
  async deleteAccount(accountId: string): Promise<void> {
    const account = this.accountDao.findById(accountId);
    if (!account) {
      throw new Error('账号不存在');
    }

    try {
      // TODO: 停止该账号的所有任务（需要 TaskService 实现后集成）
      // await this.taskService.stopAllTasksByAccount(accountId);

      // 从连接池移除客户端并断开连接
      // 删除账号时只清理池内已存在客户端，避免触发会话恢复导致不必要的网络连接重试
      if (this.clientPool.hasClient(accountId)) {
        const client = await this.clientPool.getClient(accountId);
        if (client) {
          await client.disconnect();
        }
      }
      await this.clientPool.removeClient(accountId);

      // 删除会话数据
      await this.sessionManager.deleteSession(accountId);

      // 删除账号记录（会级联删除相关数据）
      this.accountDao.delete(accountId);

      logger.info(`✅ 账号已删除: ${account.phoneNumber}`);
    } catch (error) {
      logger.error(`删除账号失败: ${account.phoneNumber}`, error);
      throw new Error(`删除账号失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 检查账号状态
   */
  async checkAccountStatus(accountId: string): Promise<{ status: string; isAuthorized: boolean }> {
    const account = this.accountDao.findById(accountId);
    if (!account) {
      throw new Error('账号不存在');
    }

    let client = await this.clientPool.getClient(accountId);

    // 如果客户端不在连接池中，尝试从会话恢复
    if (!client && account.session) {
      try {
        const sessionString = await this.sessionManager.loadSession(accountId);
        client = new TelegramClientWrapper(accountId, account.phoneNumber, sessionString);
        await client.connect();
        this.clientPool.addClient(accountId, client);
      } catch (error) {
        logger.error(`恢复账号会话失败: ${account.phoneNumber}`, error);
        this.accountDao.updateStatus(accountId, 'offline');

        // 推送状态变化
        wsManager.broadcastAccountStatus({
          accountId,
          status: 'offline',
          lastActiveAt: new Date().toISOString(),
        });

        return { status: 'offline', isAuthorized: false };
      }
    }

    if (!client) {
      this.accountDao.updateStatus(accountId, 'offline');

      // 推送状态变化
      wsManager.broadcastAccountStatus({
        accountId,
        status: 'offline',
        lastActiveAt: new Date().toISOString(),
      });

      return { status: 'offline', isAuthorized: false };
    }

    try {
      // 验证会话
      const isValid = await client.validateSession();

      if (isValid) {
        this.accountDao.updateStatus(accountId, 'online');

        // 推送状态变化
        wsManager.broadcastAccountStatus({
          accountId,
          status: 'online',
          lastActiveAt: new Date().toISOString(),
        });

        return { status: 'online', isAuthorized: true };
      } else {
        this.accountDao.updateStatus(accountId, 'offline');

        // 推送状态变化
        wsManager.broadcastAccountStatus({
          accountId,
          status: 'offline',
          lastActiveAt: new Date().toISOString(),
        });

        return { status: 'offline', isAuthorized: false };
      }
    } catch (error: any) {
      // 检查是否是账号受限错误
      if (error.message && error.message.includes('USER_DEACTIVATED')) {
        logger.warn(`账号已被限制: ${account.phoneNumber}`);
        this.accountDao.updateStatus(accountId, 'restricted');
        this.accountDao.updatePoolStatus(accountId, 'banned');

        // 推送状态变化
        wsManager.broadcastAccountStatus({
          accountId,
          status: 'restricted',
          lastActiveAt: new Date().toISOString(),
        });

        return { status: 'restricted', isAuthorized: false };
      }

      logger.error(`检查账号状态失败: ${account.phoneNumber}`, error);
      this.accountDao.updateStatus(accountId, 'offline');

      // 推送状态变化
      wsManager.broadcastAccountStatus({
        accountId,
        status: 'offline',
        lastActiveAt: new Date().toISOString(),
      });

      return { status: 'offline', isAuthorized: false };
    }
  }

  /**
   * 检查所有账号状态
   */
  async checkAllAccountsStatus(): Promise<void> {
    const accounts = this.accountDao.findAll();

    logger.info(`开始检查 ${accounts.length} 个账号的状态...`);

    for (const account of accounts) {
      try {
        await this.checkAccountStatus(account.id);
      } catch (error) {
        logger.error(`检查账号状态时出错: ${account.phoneNumber}`, error);
      }
    }

    logger.info('✅ 账号状态检查完成');
  }

  /**
   * 启动账号状态监控（每5分钟检查一次）
   */
  startStatusMonitoring(): void {
    // 立即执行一次检查
    this.checkAllAccountsStatus().catch((error) => {
      logger.error('账号状态检查失败', error);
    });

    // 每5分钟检查一次
    setInterval(
      () => {
        this.checkAllAccountsStatus().catch((error) => {
          logger.error('账号状态检查失败', error);
        });
      },
      5 * 60 * 1000
    ); // 5分钟

    logger.info('✅ 账号状态监控已启动（每5分钟检查一次）');
  }

  /**
   * 尝试重连账号
   */
  async reconnectAccount(accountId: string): Promise<boolean> {
    const account = this.accountDao.findById(accountId);
    if (!account) {
      throw new Error('账号不存在');
    }

    if (!account.session) {
      logger.warn(`账号无会话数据，无法重连: ${account.phoneNumber}`);
      return false;
    }

    try {
      logger.info(`尝试重连账号: ${account.phoneNumber}`);

      // 移除旧客户端
      await this.clientPool.removeClient(accountId);

      // 创建新客户端
      const sessionString = await this.sessionManager.loadSession(accountId);
      const client = new TelegramClientWrapper(accountId, account.phoneNumber, sessionString);

      // 连接并验证
      await client.connect();
      const isValid = await client.validateSession();

      if (!isValid) {
        logger.warn(`账号会话已失效: ${account.phoneNumber}`);
        this.accountDao.updateStatus(accountId, 'offline');
        return false;
      }

      // 添加到连接池
      this.clientPool.addClient(accountId, client);

      // 更新状态
      this.accountDao.updateStatus(accountId, 'online');

      logger.info(`✅ 账号重连成功: ${account.phoneNumber}`);
      return true;
    } catch (error: any) {
      // 检查是否是账号受限错误
      if (error.message && error.message.includes('USER_DEACTIVATED')) {
        logger.warn(`账号已被限制，无法重连: ${account.phoneNumber}`);
        this.accountDao.updateStatus(accountId, 'restricted');
        this.accountDao.updatePoolStatus(accountId, 'banned');
        return false;
      }

      logger.error(`账号重连失败: ${account.phoneNumber}`, error);
      this.accountDao.updateStatus(accountId, 'offline');
      return false;
    }
  }

  /**
   * 获取Telegram客户端
   */
  async getClient(accountId: string): Promise<TelegramClientWrapper> {
    const account = this.accountDao.findById(accountId);
    if (!account) {
      throw new Error('账号不存在');
    }

    let client = await this.clientPool.getClient(accountId);

    // 如果客户端不在连接池中，从会话恢复
    if (!client) {
      if (!account.session) {
        throw new Error('账号未登录');
      }

      const sessionString = await this.sessionManager.loadSession(accountId);
      client = new TelegramClientWrapper(accountId, account.phoneNumber, sessionString);

      // 连接并验证
      await client.connect();
      const isValid = await client.validateSession();

      if (!isValid) {
        throw new Error('账号会话已失效，请重新登录');
      }

      // 添加到连接池
      this.clientPool.addClient(accountId, client);

      // 更新状态
      this.accountDao.updateStatus(accountId, 'online');
    }

    return client;
  }

  /**
   * 清理过期会话
   */
  async cleanupExpiredSessions(daysOld: number = 30): Promise<number> {
    return await this.sessionManager.cleanupExpiredSessions(daysOld);
  }

  /**
   * 导出账号会话（用于备份）
   */
  async exportSession(accountId: string): Promise<string> {
    return await this.sessionManager.exportSession(accountId);
  }

  /**
   * 导入账号会话（用于恢复）
   */
  async importSession(accountId: string, encryptedSession: string): Promise<void> {
    await this.sessionManager.importSession(accountId, encryptedSession);
  }
}
