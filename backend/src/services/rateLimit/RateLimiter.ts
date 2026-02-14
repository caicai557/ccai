import Database from 'better-sqlite3';
import { RateLimitDao } from '../../database/dao/RateLimitDao';
import { AccountDao } from '../../database/dao/AccountDao';

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  maxPerSecond: number; // 每秒最大发送数，默认1
  maxPerHour: number; // 每小时最大发送数，默认30
  maxPerDay: number; // 每天最大发送数，默认200
  minDelayMs: number; // 最小延迟（毫秒），默认1000
  maxDelayMs: number; // 最大延迟（毫秒），默认3000
}

/**
 * 速率状态
 */
export interface RateStatus {
  accountId: string;
  sentLastSecond: number;
  sentLastHour: number;
  sentLastDay: number;
  isFloodWaiting: boolean;
  floodWaitUntil?: Date;
  nextAvailableAt: Date;
}

/**
 * 速率限制器
 * 负责控制消息发送频率，防止触发Telegram的速率限制
 */
export class RateLimiter {
  private rateLimitDao: RateLimitDao;
  private accountDao: AccountDao;
  private config: RateLimitConfig;

  constructor(db: Database.Database, config?: Partial<RateLimitConfig>) {
    this.rateLimitDao = new RateLimitDao(db);
    this.accountDao = new AccountDao(db);

    // 默认配置
    this.config = {
      maxPerSecond: config?.maxPerSecond ?? 1,
      maxPerHour: config?.maxPerHour ?? 30,
      maxPerDay: config?.maxPerDay ?? 200,
      minDelayMs: config?.minDelayMs ?? 1000,
      maxDelayMs: config?.maxDelayMs ?? 3000,
    };
  }

  /**
   * 检查是否允许发送
   * 使用滑动窗口算法检查各时间窗口的发送次数
   */
  async canSend(accountId: string): Promise<boolean> {
    const now = Date.now();

    // 检查FloodWait状态
    const floodWait = this.rateLimitDao.getFloodWait(accountId);
    if (floodWait && floodWait.waitUntil > now) {
      return false;
    }

    // 如果FloodWait已过期，删除记录
    if (floodWait && floodWait.waitUntil <= now) {
      this.rateLimitDao.deleteFloodWait(accountId);
    }

    // 检查最近1秒的发送次数
    const oneSecondAgo = now - 1000;
    const sentLastSecond = this.rateLimitDao.findRecentByAccount(accountId, oneSecondAgo);
    if (sentLastSecond.length >= this.config.maxPerSecond) {
      return false;
    }

    // 检查最近1小时的发送次数
    const oneHourAgo = now - 60 * 60 * 1000;
    const sentLastHour = this.rateLimitDao.findRecentByAccount(accountId, oneHourAgo);
    if (sentLastHour.length >= this.config.maxPerHour) {
      return false;
    }

    // 检查最近1天的发送次数
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sentLastDay = this.rateLimitDao.findRecentByAccount(accountId, oneDayAgo);
    if (sentLastDay.length >= this.config.maxPerDay) {
      return false;
    }

    return true;
  }

  /**
   * 记录发送操作
   */
  async recordSend(accountId: string): Promise<void> {
    this.rateLimitDao.create({
      accountId,
      sentAt: Date.now(),
    });
  }

  /**
   * 处理FloodWait错误
   * 记录FloodWait状态到数据库
   */
  async handleFloodWait(accountId: string, waitSeconds: number): Promise<void> {
    const waitUntil = Date.now() + waitSeconds * 1000;
    this.rateLimitDao.setFloodWait(accountId, waitUntil);

    // 更新账号状态为受限
    const account = this.accountDao.findById(accountId);
    if (account) {
      this.accountDao.update(accountId, {
        status: 'restricted',
      });
    }
  }

  /**
   * 获取账号速率状态
   */
  async getRateStatus(accountId: string): Promise<RateStatus> {
    const now = Date.now();

    // 获取FloodWait状态
    const floodWait = this.rateLimitDao.getFloodWait(accountId);
    const isFloodWaiting = floodWait ? floodWait.waitUntil > now : false;

    // 统计各时间窗口的发送次数
    const oneSecondAgo = now - 1000;
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const sentLastSecond = this.rateLimitDao.findRecentByAccount(accountId, oneSecondAgo).length;
    const sentLastHour = this.rateLimitDao.findRecentByAccount(accountId, oneHourAgo).length;
    const sentLastDay = this.rateLimitDao.findRecentByAccount(accountId, oneDayAgo).length;

    // 计算下次可用时间
    let nextAvailableAt = new Date(now);
    if (isFloodWaiting && floodWait) {
      nextAvailableAt = new Date(floodWait.waitUntil);
    } else if (sentLastSecond >= this.config.maxPerSecond) {
      // 如果1秒内已达上限，需要等到最早的记录过期
      const records = this.rateLimitDao.findRecentByAccount(accountId, oneSecondAgo);
      if (records.length > 0) {
        const oldestRecord = records[records.length - 1];
        if (oldestRecord) {
          nextAvailableAt = new Date(oldestRecord.sentAt + 1000);
        }
      }
    }

    return {
      accountId,
      sentLastSecond,
      sentLastHour,
      sentLastDay,
      isFloodWaiting,
      floodWaitUntil: floodWait ? new Date(floodWait.waitUntil) : undefined,
      nextAvailableAt,
    };
  }

  /**
   * 重置账号速率限制
   * 清除该账号的所有速率记录和FloodWait状态
   */
  async resetRateLimit(accountId: string): Promise<void> {
    this.rateLimitDao.deleteByAccount(accountId);
    this.rateLimitDao.deleteFloodWait(accountId);
  }

  /**
   * 生成随机延迟（毫秒）
   * 在配置的范围内生成随机延迟，模拟真人操作
   */
  generateRandomDelay(): number {
    const min = this.config.minDelayMs;
    const max = this.config.maxDelayMs;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 等待随机延迟
   */
  async waitRandomDelay(): Promise<void> {
    const delay = this.generateRandomDelay();
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * 计算账号健康度评分
   * 基于成功率和限制次数计算评分（0-100）
   */
  async calculateHealthScore(accountId: string): Promise<number> {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // 获取最近24小时的发送记录
    const recentRecords = this.rateLimitDao.findRecentByAccount(accountId, oneDayAgo);
    const totalOperations = recentRecords.length;

    // 如果没有操作记录，返回默认分数100
    if (totalOperations === 0) {
      return 100;
    }

    // 检查是否处于FloodWait状态
    const floodWait = this.rateLimitDao.getFloodWait(accountId);
    const isFloodWaiting = floodWait ? floodWait.waitUntil > now : false;

    // 基础分数
    let score = 100;

    // 如果当前处于FloodWait状态，扣30分
    if (isFloodWaiting) {
      score -= 30;
    }

    // 根据使用频率调整分数
    // 如果接近每日限制，降低分数
    const usageRatio = totalOperations / this.config.maxPerDay;
    if (usageRatio > 0.9) {
      score -= 20; // 使用超过90%，扣20分
    } else if (usageRatio > 0.7) {
      score -= 10; // 使用超过70%，扣10分
    }

    // 确保分数在0-100范围内
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 更新账号健康度评分
   * 计算并更新账号的健康度评分到数据库
   */
  async updateAccountHealthScore(accountId: string): Promise<number> {
    const healthScore = await this.calculateHealthScore(accountId);

    // 更新账号的健康度评分
    this.accountDao.update(accountId, {
      healthScore,
    });

    return healthScore;
  }

  /**
   * 清理过期的速率记录
   * 删除超过指定天数的记录以节省空间
   */
  async cleanupOldRecords(daysToKeep: number = 7): Promise<number> {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const deleted = this.rateLimitDao.deleteOlderThan(cutoffTime);

    // 同时清理过期的FloodWait记录
    const deletedFloodWaits = this.rateLimitDao.deleteExpiredFloodWaits();

    return deleted + deletedFloodWaits;
  }

  /**
   * 获取配置
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }
}
