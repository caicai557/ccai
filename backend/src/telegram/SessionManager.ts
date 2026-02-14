import { StringSession } from 'telegram/sessions';
import { logger } from '../utils/logger';
import { encrypt, decrypt } from '../utils/crypto';
import { DaoFactory } from '../database/dao';

/**
 * 会话信息接口
 */
export interface SessionInfo {
  accountId: string;
  phoneNumber: string;
  encryptedSession: string;
  createdAt: Date;
  lastUsed: Date;
}

/**
 * 会话管理器
 * 负责Telegram会话的持久化、恢复和验证
 */
export class SessionManager {
  private static instance: SessionManager;

  private constructor() {}

  private get accountDao() {
    return DaoFactory.getInstance().getAccountDao();
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * 保存会话
   * @param accountId 账号ID
   * @param sessionString 会话字符串
   */
  async saveSession(accountId: string, sessionString: string): Promise<void> {
    try {
      // 验证会话字符串不为空
      if (!sessionString || sessionString.trim() === '') {
        throw new Error('会话字符串不能为空');
      }

      // 加密会话字符串
      const encryptedSession = encrypt(sessionString);

      // 更新数据库
      this.accountDao.update(accountId, {
        session: encryptedSession,
        lastActive: this.now() as any,
      });

      logger.info(`✅ 会话已保存: 账号 ${accountId}`);
    } catch (error) {
      logger.error(`保存会话失败: 账号 ${accountId}`, error);
      throw new Error(`保存会话失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 加载会话
   * @param accountId 账号ID
   * @returns 解密后的会话字符串
   */
  async loadSession(accountId: string): Promise<string> {
    try {
      const account = this.accountDao.findById(accountId);

      if (!account) {
        throw new Error('账号不存在');
      }

      if (!account.session) {
        throw new Error('账号未登录，没有可用的会话');
      }

      // 解密会话字符串
      const sessionString = decrypt(account.session);

      // 更新最后使用时间
      this.accountDao.update(accountId, {
        lastActive: this.now() as any,
      });

      logger.debug(`会话已加载: 账号 ${accountId}`);

      return sessionString;
    } catch (error) {
      logger.error(`加载会话失败: 账号 ${accountId}`, error);
      throw new Error(`加载会话失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 获取当前时间字符串
   */
  private now(): string {
    return new Date().toISOString();
  }

  /**
   * 创建StringSession对象
   * @param accountId 账号ID
   * @returns StringSession实例
   */
  async createStringSession(accountId: string): Promise<StringSession> {
    try {
      const sessionString = await this.loadSession(accountId);
      return new StringSession(sessionString);
    } catch (_error) {
      // 如果加载失败，返回空会话
      logger.warn(`创建StringSession失败，返回空会话: 账号 ${accountId}`);
      return new StringSession('');
    }
  }

  /**
   * 验证会话是否有效
   * @param accountId 账号ID
   * @returns 会话是否有效
   */
  async isSessionValid(accountId: string): Promise<boolean> {
    try {
      const account = this.accountDao.findById(accountId);

      if (!account || !account.session) {
        return false;
      }

      // 尝试解密会话
      decrypt(account.session);

      return true;
    } catch (error) {
      logger.error(`会话验证失败: 账号 ${accountId}`, error);
      return false;
    }
  }

  /**
   * 删除会话
   * @param accountId 账号ID
   */
  async deleteSession(accountId: string): Promise<void> {
    try {
      this.accountDao.update(accountId, {
        session: '',
        status: 'offline',
      });

      logger.info(`✅ 会话已删除: 账号 ${accountId}`);
    } catch (error) {
      logger.error(`删除会话失败: 账号 ${accountId}`, error);
      throw new Error(`删除会话失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 获取会话信息
   * @param accountId 账号ID
   * @returns 会话信息
   */
  async getSessionInfo(accountId: string): Promise<SessionInfo | null> {
    try {
      const account = this.accountDao.findById(accountId);

      if (!account) {
        return null;
      }

      return {
        accountId: account.id,
        phoneNumber: account.phoneNumber,
        encryptedSession: account.session || '',
        createdAt: new Date(account.createdAt as any),
        lastUsed: new Date((account.lastActive as any) || account.createdAt),
      };
    } catch (error) {
      logger.error(`获取会话信息失败: 账号 ${accountId}`, error);
      return null;
    }
  }

  /**
   * 清理过期会话
   * @param daysOld 多少天未使用的会话视为过期
   * @returns 清理的会话数量
   */
  async cleanupExpiredSessions(daysOld: number = 30): Promise<number> {
    try {
      const accounts = this.accountDao.findAll();
      let cleanedCount = 0;

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() - daysOld);

      for (const account of accounts) {
        const lastActive = new Date(account.lastActive || account.createdAt);

        if (lastActive < expiryDate && account.session) {
          await this.deleteSession(account.id);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info(`✅ 已清理 ${cleanedCount} 个过期会话（${daysOld}天未使用）`);
      }

      return cleanedCount;
    } catch (error) {
      logger.error('清理过期会话失败', error);
      throw new Error(`清理过期会话失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 导出会话（用于备份）
   * @param accountId 账号ID
   * @returns 加密的会话字符串
   */
  async exportSession(accountId: string): Promise<string> {
    try {
      const account = this.accountDao.findById(accountId);

      if (!account || !account.session) {
        throw new Error('账号不存在或未登录');
      }

      logger.info(`会话已导出: 账号 ${accountId}`);

      return account.session;
    } catch (error) {
      logger.error(`导出会话失败: 账号 ${accountId}`, error);
      throw new Error(`导出会话失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 导入会话（用于恢复）
   * @param accountId 账号ID
   * @param encryptedSession 加密的会话字符串
   */
  async importSession(accountId: string, encryptedSession: string): Promise<void> {
    try {
      // 验证会话格式
      decrypt(encryptedSession);

      // 更新数据库
      this.accountDao.update(accountId, {
        session: encryptedSession,
        lastActive: this.now() as any,
      });

      logger.info(`✅ 会话已导入: 账号 ${accountId}`);
    } catch (error) {
      logger.error(`导入会话失败: 账号 ${accountId}`, error);
      throw new Error(`导入会话失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 获取所有有效会话的账号ID列表
   * @returns 账号ID列表
   */
  async getActiveSessionIds(): Promise<string[]> {
    try {
      const accounts = this.accountDao.findAll();

      const activeIds = accounts
        .filter((account) => account.session && account.session.trim() !== '')
        .map((account) => account.id);

      return activeIds;
    } catch (error) {
      logger.error('获取活跃会话列表失败', error);
      return [];
    }
  }
}
