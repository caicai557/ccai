import Database from 'better-sqlite3';
import { ClientPool } from '../../telegram/ClientPool';
import { RateLimiter } from '../rateLimit/RateLimiter';
import { MessageHistoryDao } from '../../database/dao/MessageHistoryDao';
import { logger } from '../../utils/logger';

/**
 * 发送消息参数
 */
export interface SendMessageParams {
  accountId: string;
  targetId: string;
  targetType: 'group' | 'channel';
  content: string;
  parseMode?: 'markdown' | 'html';
}

/**
 * 发送评论参数
 */
export interface SendCommentParams {
  accountId: string;
  channelId: string;
  messageId: number;
  content: string;
}

/**
 * 发送结果
 */
export interface SendResult {
  success: boolean;
  messageId?: number;
  sentAt: Date;
  error?: SendError;
}

/**
 * 发送错误
 */
export interface SendError {
  code: string;
  message: string;
  isFloodWait: boolean;
  waitSeconds?: number;
  isRetryable: boolean;
}

/**
 * 新消息回调
 */
export type MessageCallback = (message: NewMessage) => Promise<void>;

/**
 * 新消息
 */
export interface NewMessage {
  id: number;
  channelId: string;
  content: string;
  senderId: string;
  sentAt: Date;
}

/**
 * 频道监听器
 */
interface ChannelListener {
  accountId: string;
  channelId: string;
  callback: MessageCallback;
  removeHandler?: () => void;
}

/**
 * 消息发送器
 * 负责实际的消息发送和评论操作
 */
export class MessageService {
  private clientPool: ClientPool;
  private rateLimiter: RateLimiter;
  private messageHistoryDao: MessageHistoryDao;
  private listeners: Map<string, ChannelListener> = new Map();

  constructor(db: Database.Database, rateLimiter?: RateLimiter) {
    this.clientPool = ClientPool.getInstance();
    this.rateLimiter = rateLimiter || new RateLimiter(db);
    this.messageHistoryDao = new MessageHistoryDao(db);
  }

  /**
   * 发送消息到群组或频道
   */
  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    const { accountId, targetId, targetType, content } = params;

    try {
      // 检查速率限制
      const canSend = await this.rateLimiter.canSend(accountId);
      if (!canSend) {
        const rateStatus = await this.rateLimiter.getRateStatus(accountId);
        logger.warn(`账号 ${accountId} 速率限制中，下次可用时间: ${rateStatus.nextAvailableAt}`);

        const sendError: SendError = {
          code: 'RATE_LIMIT_EXCEEDED',
          message: '超过速率限制',
          isFloodWait: rateStatus.isFloodWaiting,
          waitSeconds: rateStatus.floodWaitUntil
            ? Math.ceil((rateStatus.floodWaitUntil.getTime() - Date.now()) / 1000)
            : undefined,
          isRetryable: true,
        };

        this.recordFailedHistory({
          accountId,
          targetId,
          type: 'group_message',
          content,
          error: sendError.message,
        });

        return {
          success: false,
          sentAt: new Date(),
          error: sendError,
        };
      }

      // 添加随机延迟
      await this.rateLimiter.waitRandomDelay();

      // 获取客户端
      const client = await this.clientPool.getClient(accountId);
      if (!client) {
        logger.error(`无法获取客户端: ${accountId}`);

        const sendError: SendError = {
          code: 'CLIENT_NOT_FOUND',
          message: '客户端不存在或未连接',
          isFloodWait: false,
          isRetryable: false,
        };

        this.recordFailedHistory({
          accountId,
          targetId,
          type: 'group_message',
          content,
          error: sendError.message,
        });

        return {
          success: false,
          sentAt: new Date(),
          error: sendError,
        };
      }

      // 确保客户端已连接
      if (!client.getIsConnected()) {
        await client.connect();
      }

      // 发送消息
      const result = await client.sendMessage(targetId, content);

      // 记录发送操作
      await this.rateLimiter.recordSend(accountId);

      // 更新健康度评分
      await this.rateLimiter.updateAccountHealthScore(accountId);

      // 记录消息历史
      this.messageHistoryDao.create({
        accountId,
        targetId,
        type: targetType === 'group' ? 'group_message' : 'group_message',
        content,
        status: 'success',
      });

      logger.info(`✅ 消息发送成功: ${accountId} -> ${targetType}:${targetId}`);

      return {
        success: true,
        messageId: result.id,
        sentAt: new Date(),
      };
    } catch (error: any) {
      logger.error(`消息发送失败: ${accountId} -> ${targetId}`, error);

      // 解析错误
      const sendError = this.parseError(error);

      this.recordFailedHistory({
        accountId,
        targetId,
        type: targetType === 'group' ? 'group_message' : 'group_message',
        content,
        error: sendError.message,
      });

      // 处理FloodWait错误
      if (sendError.isFloodWait && sendError.waitSeconds) {
        await this.rateLimiter.handleFloodWait(accountId, sendError.waitSeconds);
        logger.warn(`账号 ${accountId} 触发FloodWait，等待 ${sendError.waitSeconds} 秒`);
      }

      return {
        success: false,
        sentAt: new Date(),
        error: sendError,
      };
    }
  }

  /**
   * 发送评论到频道消息
   */
  async sendComment(params: SendCommentParams): Promise<SendResult> {
    const { accountId, channelId, messageId, content } = params;

    try {
      // 检查速率限制
      const canSend = await this.rateLimiter.canSend(accountId);
      if (!canSend) {
        const rateStatus = await this.rateLimiter.getRateStatus(accountId);
        logger.warn(`账号 ${accountId} 速率限制中，下次可用时间: ${rateStatus.nextAvailableAt}`);

        const sendError: SendError = {
          code: 'RATE_LIMIT_EXCEEDED',
          message: '超过速率限制',
          isFloodWait: rateStatus.isFloodWaiting,
          waitSeconds: rateStatus.floodWaitUntil
            ? Math.ceil((rateStatus.floodWaitUntil.getTime() - Date.now()) / 1000)
            : undefined,
          isRetryable: true,
        };

        this.recordFailedHistory({
          accountId,
          targetId: channelId,
          type: 'channel_comment',
          content,
          error: sendError.message,
        });

        return {
          success: false,
          sentAt: new Date(),
          error: sendError,
        };
      }

      // 添加随机延迟
      await this.rateLimiter.waitRandomDelay();

      // 获取客户端
      const client = await this.clientPool.getClient(accountId);
      if (!client) {
        logger.error(`无法获取客户端: ${accountId}`);

        const sendError: SendError = {
          code: 'CLIENT_NOT_FOUND',
          message: '客户端不存在或未连接',
          isFloodWait: false,
          isRetryable: false,
        };

        this.recordFailedHistory({
          accountId,
          targetId: channelId,
          type: 'channel_comment',
          content,
          error: sendError.message,
        });

        return {
          success: false,
          sentAt: new Date(),
          error: sendError,
        };
      }

      // 确保客户端已连接
      if (!client.getIsConnected()) {
        await client.connect();
      }

      // 发送评论（回复消息）
      const result = await client.sendComment(channelId, messageId, content);

      // 记录发送操作
      await this.rateLimiter.recordSend(accountId);

      // 更新健康度评分
      await this.rateLimiter.updateAccountHealthScore(accountId);

      // 记录消息历史
      this.messageHistoryDao.create({
        accountId,
        targetId: channelId,
        type: 'channel_comment',
        content,
        status: 'success',
      });

      logger.info(`✅ 评论发送成功: ${accountId} -> channel:${channelId}, message:${messageId}`);

      return {
        success: true,
        messageId: result.id,
        sentAt: new Date(),
      };
    } catch (error: any) {
      logger.error(`评论发送失败: ${accountId} -> ${channelId}:${messageId}`, error);

      // 解析错误
      const sendError = this.parseError(error);

      this.recordFailedHistory({
        accountId,
        targetId: channelId,
        type: 'channel_comment',
        content,
        error: sendError.message,
      });

      // 处理FloodWait错误
      if (sendError.isFloodWait && sendError.waitSeconds) {
        await this.rateLimiter.handleFloodWait(accountId, sendError.waitSeconds);
        logger.warn(`账号 ${accountId} 触发FloodWait，等待 ${sendError.waitSeconds} 秒`);
      }

      return {
        success: false,
        sentAt: new Date(),
        error: sendError,
      };
    }
  }

  /**
   * 监听频道新消息
   */
  async listenToChannel(
    accountId: string,
    channelId: string,
    callback: MessageCallback
  ): Promise<void> {
    const listenerKey = `${accountId}:${channelId}`;

    // 如果已经在监听，先停止
    if (this.listeners.has(listenerKey)) {
      await this.stopListening(accountId, channelId);
    }

    try {
      // 获取客户端
      const client = await this.clientPool.getClient(accountId);
      if (!client) {
        throw new Error(`无法获取客户端: ${accountId}`);
      }

      // 确保客户端已连接
      if (!client.getIsConnected()) {
        await client.connect();
      }

      // 获取原始 TelegramClient
      const rawClient = client.getRawClient();

      // 创建事件处理器
      const eventHandler = async (event: any) => {
        try {
          const message = event.message;
          if (!message) return;

          // 获取消息所属的频道ID
          const chatId = message.chatId?.toString();
          if (chatId !== channelId) return;

          // 构造新消息对象
          const newMessage: NewMessage = {
            id: message.id,
            channelId: chatId,
            content: message.message || '',
            senderId: message.senderId?.toString() || '',
            sentAt: new Date(message.date * 1000),
          };

          // 调用回调函数
          await callback(newMessage);
        } catch (error) {
          logger.error(`处理新消息失败: ${accountId}:${channelId}`, error);
        }
      };

      // 添加事件监听器
      // 注意：这里简化实现，实际使用时需要根据 GramJS 的 NewMessage 事件
      rawClient.addEventHandler(eventHandler);

      // 保存监听器信息（包含原始客户端引用以便后续移除）
      this.listeners.set(listenerKey, {
        accountId,
        channelId,
        callback,
        removeHandler: () => {
          // 移除事件处理器
          // 注意：GramJS 的 removeEventHandler 可能需要不同的参数
          // 这里提供一个占位实现，实际使用时需要根据 GramJS API 调整
          try {
            // 简化实现：直接从监听器列表中移除
            logger.debug(`移除事件处理器: ${accountId}:${channelId}`);
          } catch (error) {
            logger.error(`移除事件处理器失败: ${accountId}:${channelId}`, error);
          }
        },
      });

      logger.info(`✅ 开始监听频道: ${accountId} -> ${channelId}`);
    } catch (error) {
      logger.error(`监听频道失败: ${accountId} -> ${channelId}`, error);
      throw error;
    }
  }

  /**
   * 停止监听频道
   */
  async stopListening(accountId: string, channelId: string): Promise<void> {
    const listenerKey = `${accountId}:${channelId}`;
    const listener = this.listeners.get(listenerKey);

    if (listener && listener.removeHandler) {
      listener.removeHandler();
      this.listeners.delete(listenerKey);
      logger.info(`✅ 停止监听频道: ${accountId} -> ${channelId}`);
    }
  }

  /**
   * 停止所有监听
   */
  async stopAllListening(): Promise<void> {
    for (const listener of this.listeners.values()) {
      if (listener.removeHandler) {
        listener.removeHandler();
      }
    }
    this.listeners.clear();
    logger.info('✅ 已停止所有频道监听');
  }

  /**
   * 获取活跃的监听器列表
   */
  getActiveListeners(): Array<{ accountId: string; channelId: string }> {
    return Array.from(this.listeners.values()).map((listener) => ({
      accountId: listener.accountId,
      channelId: listener.channelId,
    }));
  }

  /**
   * 解析错误
   */
  private parseError(error: any): SendError {
    // FloodWait错误
    if (error.errorMessage && error.errorMessage.includes('FLOOD_WAIT')) {
      const match = error.errorMessage.match(/FLOOD_WAIT_(\d+)/);
      const waitSeconds = match ? parseInt(match[1], 10) : 60;

      return {
        code: 'FLOOD_WAIT',
        message: `触发速率限制，需要等待 ${waitSeconds} 秒`,
        isFloodWait: true,
        waitSeconds,
        isRetryable: true,
      };
    }

    // 权限错误
    if (
      error.errorMessage &&
      (error.errorMessage.includes('CHAT_WRITE_FORBIDDEN') ||
        error.errorMessage.includes('USER_BANNED_IN_CHANNEL') ||
        error.errorMessage.includes('CHANNEL_PRIVATE'))
    ) {
      return {
        code: 'PERMISSION_DENIED',
        message: '没有权限发送消息',
        isFloodWait: false,
        isRetryable: false,
      };
    }

    // 网络错误
    if (
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.message?.includes('network') ||
      error.message?.includes('timeout')
    ) {
      return {
        code: 'NETWORK_ERROR',
        message: '网络连接错误',
        isFloodWait: false,
        isRetryable: true,
      };
    }

    // 未知错误
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message || '未知错误',
      isFloodWait: false,
      isRetryable: false,
    };
  }

  private recordFailedHistory(params: {
    accountId: string;
    targetId: string;
    type: 'group_message' | 'channel_comment';
    content: string;
    error: string;
  }): void {
    this.messageHistoryDao.create({
      accountId: params.accountId,
      targetId: params.targetId,
      type: params.type,
      content: params.content,
      status: 'failed',
      error: params.error,
    });
  }

  /**
   * 判断错误是否可重试
   */
  isRetryable(error: SendError): boolean {
    return error.isRetryable;
  }

  /**
   * 获取重试延迟时间（毫秒）
   * 使用指数退避策略
   */
  getRetryDelay(attemptNumber: number): number {
    // 指数退避: 1秒, 2秒, 4秒
    const baseDelay = 1000;
    const maxDelay = 4000;
    const delay = Math.min(baseDelay * Math.pow(2, attemptNumber - 1), maxDelay);
    return delay;
  }

  /**
   * 带重试的发送消息
   */
  async sendMessageWithRetry(
    params: SendMessageParams,
    maxRetries: number = 3
  ): Promise<SendResult> {
    let lastResult: SendResult | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      lastResult = await this.sendMessage(params);

      // 如果成功，直接返回
      if (lastResult.success) {
        return lastResult;
      }

      // 如果不可重试，直接返回
      if (lastResult.error && !this.isRetryable(lastResult.error)) {
        logger.warn(`错误不可重试，停止重试: ${lastResult.error.code}`);
        return lastResult;
      }

      // 如果是FloodWait，不重试其他操作
      if (lastResult.error?.isFloodWait) {
        logger.warn(`触发FloodWait，停止重试`);
        return lastResult;
      }

      // 如果还有重试机会，等待后重试
      if (attempt < maxRetries) {
        const delay = this.getRetryDelay(attempt);
        logger.info(`第 ${attempt} 次尝试失败，${delay}ms 后重试...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return lastResult!;
  }

  /**
   * 带重试的发送评论
   */
  async sendCommentWithRetry(
    params: SendCommentParams,
    maxRetries: number = 3
  ): Promise<SendResult> {
    let lastResult: SendResult | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      lastResult = await this.sendComment(params);

      // 如果成功，直接返回
      if (lastResult.success) {
        return lastResult;
      }

      // 如果不可重试，直接返回
      if (lastResult.error && !this.isRetryable(lastResult.error)) {
        logger.warn(`错误不可重试，停止重试: ${lastResult.error.code}`);
        return lastResult;
      }

      // 如果是FloodWait，不重试其他操作
      if (lastResult.error?.isFloodWait) {
        logger.warn(`触发FloodWait，停止重试`);
        return lastResult;
      }

      // 如果还有重试机会，等待后重试
      if (attempt < maxRetries) {
        const delay = this.getRetryDelay(attempt);
        logger.info(`第 ${attempt} 次尝试失败，${delay}ms 后重试...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return lastResult!;
  }

  /**
   * 获取消息历史DAO
   */
  getMessageHistoryDao(): MessageHistoryDao {
    return this.messageHistoryDao;
  }

  /**
   * 获取账号的消息历史
   */
  getAccountHistory(accountId: string, limit?: number) {
    return this.messageHistoryDao.findByAccountId(accountId, limit);
  }

  /**
   * 获取目标的消息历史
   */
  getTargetHistory(targetId: string, limit?: number) {
    return this.messageHistoryDao.findByTargetId(targetId, limit);
  }

  /**
   * 获取账号的消息统计
   */
  getAccountStats(accountId: string, days?: number) {
    return this.messageHistoryDao.getAccountStats(accountId, days);
  }

  /**
   * 获取目标的消息统计
   */
  getTargetStats(targetId: string, days?: number) {
    return this.messageHistoryDao.getTargetStats(targetId, days);
  }

  /**
   * 清理过期的消息历史
   */
  cleanupOldHistory(days: number = 30): number {
    return this.messageHistoryDao.deleteOlderThanDays(days);
  }
}
