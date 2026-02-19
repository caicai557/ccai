import Database from 'better-sqlite3';
import { NewMessage as GramNewMessage } from 'telegram/events';
import { ClientPool } from '../../telegram/ClientPool';
import { RateLimiter } from '../rateLimit/RateLimiter';
import { MessageHistoryDao } from '../../database/dao/MessageHistoryDao';
import { AccountDao } from '../../database/dao/AccountDao';
import { logger } from '../../utils/logger';
import { AccountPoolStatus } from '../../types';

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
  commentEnabled?: boolean;
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
  private accountDao: AccountDao;
  private listeners: Map<string, ChannelListener> = new Map();
  private readonly channelPollIntervalMs: number = 15_000;
  private readonly channelPollFetchLimit: number = 5;
  private readonly maxTrackedMessageIds: number = 200;

  constructor(db: Database.Database, rateLimiter?: RateLimiter) {
    this.clientPool = ClientPool.getInstance();
    this.rateLimiter = rateLimiter || new RateLimiter(db);
    this.messageHistoryDao = new MessageHistoryDao(db);
    this.accountDao = new AccountDao(db);
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

        if (rateStatus.isFloodWaiting) {
          this.safeUpdatePoolStatus(accountId, 'cooldown');
        }

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
      } else {
        const nextPoolStatus = this.resolvePoolStatusFromError(error, sendError);
        if (nextPoolStatus) {
          this.safeUpdatePoolStatus(accountId, nextPoolStatus);
        }
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

        if (rateStatus.isFloodWaiting) {
          this.safeUpdatePoolStatus(accountId, 'cooldown');
        }

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
      const sentMessageId = this.extractResultMessageId(result);

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
        messageId: sentMessageId,
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
      } else {
        const nextPoolStatus = this.resolvePoolStatusFromError(error, sendError);
        if (nextPoolStatus) {
          this.safeUpdatePoolStatus(accountId, nextPoolStatus);
        }
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
    const normalizedTargetId = this.normalizePeerId(channelId);

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
      const lookupChannelId = this.toChannelLookupId(channelId);
      let latestKnownMessageId = await this.getLatestMessageId(rawClient, lookupChannelId);
      const processedMessageIds: Set<number> = new Set();

      const trimProcessedMessages = (): void => {
        while (processedMessageIds.size > this.maxTrackedMessageIds) {
          const oldestId = processedMessageIds.values().next().value;
          if (oldestId === undefined) {
            break;
          }
          processedMessageIds.delete(oldestId);
        }
      };

      const dispatchMessage = async (
        message: any,
        source: 'event' | 'poll',
        event?: any
      ): Promise<void> => {
        if (!message) {
          return;
        }

        const chatId = event
          ? this.extractChannelIdFromEvent(event)
          : this.extractChannelIdFromMessage(message);
        if (!chatId) {
          logger.debug(
            `频道监听忽略消息（无法提取频道ID）: account=${accountId}, target=${normalizedTargetId}, source=${source}`
          );
          return;
        }

        if (chatId !== normalizedTargetId) {
          logger.debug(
            `频道监听忽略消息（频道不匹配）: account=${accountId}, source=${chatId}, target=${normalizedTargetId}, message=${message.id}, via=${source}`
          );
          return;
        }

        const messageId = Number(message.id);
        if (!Number.isFinite(messageId) || messageId <= 0) {
          logger.debug(
            `频道监听忽略消息（消息ID无效）: account=${accountId}, channel=${chatId}, rawId=${message.id}, via=${source}`
          );
          return;
        }

        if (messageId <= latestKnownMessageId || processedMessageIds.has(messageId)) {
          return;
        }

        latestKnownMessageId = Math.max(latestKnownMessageId, messageId);
        processedMessageIds.add(messageId);
        trimProcessedMessages();

        const newMessage: NewMessage = {
          id: messageId,
          channelId: normalizedTargetId,
          content: String(message.message || ''),
          senderId: message.senderId?.toString() || '',
          sentAt: this.parseMessageDate(message.date),
          commentEnabled: this.resolveCommentAvailability(message),
        };

        logger.info(
          `收到频道新消息: account=${accountId}, channel=${normalizedTargetId}, message=${messageId}, via=${source}`
        );
        await callback(newMessage);
      };

      // 创建事件处理器
      const eventHandler = async (event: any) => {
        try {
          await dispatchMessage(event?.message, 'event', event);
        } catch (error) {
          logger.error(`处理新消息失败: ${accountId}:${channelId}`, error);
        }
      };

      // 添加实时事件监听器
      const eventBuilder = new GramNewMessage({});
      rawClient.addEventHandler(eventHandler, eventBuilder);

      // 轮询兜底：防止某些环境下事件漏触发
      const pollTimer = setInterval(() => {
        void (async () => {
          try {
            const recentMessages = await this.getRecentMessages(rawClient, lookupChannelId);
            for (const message of recentMessages) {
              await dispatchMessage(message, 'poll');
            }
          } catch (error) {
            logger.error(`频道轮询失败: ${accountId}:${channelId}`, error);
          }
        })();
      }, this.channelPollIntervalMs);

      // 保存监听器信息（包含原始客户端引用以便后续移除）
      this.listeners.set(listenerKey, {
        accountId,
        channelId,
        callback,
        removeHandler: () => {
          try {
            clearInterval(pollTimer);
            rawClient.removeEventHandler(eventHandler, eventBuilder);
            logger.debug(`移除事件处理器: ${accountId}:${channelId}`);
          } catch (error) {
            logger.error(`移除事件处理器失败: ${accountId}:${channelId}`, error);
          }
        },
      });

      logger.info(
        `✅ 开始监听频道: ${accountId} -> ${channelId} (实时事件 + ${this.channelPollIntervalMs / 1000}s轮询兜底, baseline=${latestKnownMessageId})`
      );
    } catch (error) {
      logger.error(`监听频道失败: ${accountId} -> ${channelId}`, error);
      throw error;
    }
  }

  private normalizePeerId(peerId: unknown): string {
    if (peerId === null || peerId === undefined) {
      return '';
    }

    const raw = String(peerId).trim();
    if (!raw) {
      return '';
    }

    // 频道消息事件常见为 -100xxxxxxxxxx，目标配置通常是 xxxxxxxxxx
    const withoutChannelPrefix = raw.replace(/^-100/, '');
    return withoutChannelPrefix.replace(/^-/, '');
  }

  private extractChannelIdFromEvent(event: any): string {
    const candidates: unknown[] = [
      event?.chatId,
      event?.message?.chatId,
      event?.originalUpdate?.message?.chatId,
      event?.message?.peerId?.channelId,
      event?.message?.peerId?.chatId,
      event?.originalUpdate?.message?.peerId?.channelId,
      event?.originalUpdate?.message?.peerId?.chatId,
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizePeerId(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return '';
  }

  private extractChannelIdFromMessage(message: any): string {
    const candidates: unknown[] = [
      message?.chatId,
      message?.peerId?.channelId,
      message?.peerId?.chatId,
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizePeerId(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return '';
  }

  private parseMessageDate(rawDate: unknown): Date {
    if (rawDate instanceof Date) {
      return rawDate;
    }

    if (typeof rawDate === 'number' && Number.isFinite(rawDate)) {
      return new Date(rawDate * 1000);
    }

    if (typeof rawDate === 'string' && rawDate.trim()) {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return new Date();
  }

  /**
   * 仅在字段明确可判定时返回 true/false，避免缺失字段被误判为 false。
   */
  private resolveCommentAvailability(message: any): boolean | undefined {
    const replies = message?.replies;
    if (!replies || typeof replies !== 'object') {
      return undefined;
    }

    const commentsFlag = (replies as { comments?: unknown }).comments;
    if (typeof commentsFlag === 'boolean') {
      return commentsFlag;
    }

    return undefined;
  }

  private toChannelLookupId(channelId: string): string {
    const normalized = this.normalizePeerId(channelId);
    if (!normalized) {
      return channelId;
    }
    return `-100${normalized}`;
  }

  private async getLatestMessageId(rawClient: any, lookupChannelId: string): Promise<number> {
    try {
      const recentMessages = await rawClient.getMessages(lookupChannelId, { limit: 1 });
      const normalized = this.normalizeMessageList(recentMessages);
      const latestId = Number(normalized[0]?.id || 0);
      return Number.isFinite(latestId) ? latestId : 0;
    } catch (error) {
      logger.warn(`初始化监听基线失败，回退到0: channel=${lookupChannelId}`, error);
      return 0;
    }
  }

  private async getRecentMessages(rawClient: any, lookupChannelId: string): Promise<any[]> {
    const recentMessages = await rawClient.getMessages(lookupChannelId, {
      limit: this.channelPollFetchLimit,
    });
    return this.normalizeMessageList(recentMessages)
      .filter((message) => message && message.id !== undefined && message.id !== null)
      .sort((left, right) => Number(left.id) - Number(right.id));
  }

  private normalizeMessageList(rawMessages: any): any[] {
    if (!rawMessages) {
      return [];
    }

    if (Array.isArray(rawMessages)) {
      return rawMessages;
    }

    try {
      return Array.from(rawMessages);
    } catch (_error) {
      return [];
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
    const errorMessage = this.extractErrorMessage(error);

    // FloodWait错误
    if (errorMessage.includes('FLOOD_WAIT')) {
      const match = errorMessage.match(/FLOOD_WAIT_(\d+)/);
      const waitSeconds = parseInt(match?.[1] || '60', 10);

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
      errorMessage.includes('CHAT_WRITE_FORBIDDEN') ||
      errorMessage.includes('CHAT_ADMIN_REQUIRED') ||
      errorMessage.includes('USER_BANNED_IN_CHANNEL') ||
      errorMessage.includes('CHANNEL_PRIVATE')
    ) {
      return {
        code: 'PERMISSION_DENIED',
        message: '没有权限发送消息',
        isFloodWait: false,
        isRetryable: false,
      };
    }

    // 频道消息未开启评论（或消息无法作为评论锚点）
    if (errorMessage.includes('MSG_ID_INVALID')) {
      return {
        code: 'COMMENT_NOT_AVAILABLE',
        message: '该消息未开启评论或无法评论',
        isFloodWait: false,
        isRetryable: false,
      };
    }

    // 网络错误
    if (
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      errorMessage.includes('network') ||
      errorMessage.includes('timeout')
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
      message: errorMessage || '未知错误',
      isFloodWait: false,
      isRetryable: false,
    };
  }

  private extractErrorMessage(error: any): string {
    if (!error) {
      return '';
    }

    if (typeof error.errorMessage === 'string' && error.errorMessage.trim()) {
      return error.errorMessage;
    }

    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message;
    }

    return '';
  }

  private extractResultMessageId(result: any): number | undefined {
    const directId = Number(result?.id);
    if (Number.isFinite(directId) && directId > 0) {
      return directId;
    }

    const updates = Array.isArray(result?.updates) ? result.updates : [];
    for (const update of updates) {
      const updateMessageId = Number(update?.message?.id);
      if (Number.isFinite(updateMessageId) && updateMessageId > 0) {
        return updateMessageId;
      }
    }

    return undefined;
  }

  private resolvePoolStatusFromError(
    error: any,
    sendError: SendError
  ): AccountPoolStatus | undefined {
    const rawMessage = this.extractErrorMessage(error).toUpperCase();

    if (
      rawMessage.includes('USER_DEACTIVATED') ||
      rawMessage.includes('AUTH_KEY_UNREGISTERED') ||
      rawMessage.includes('PHONE_NUMBER_BANNED')
    ) {
      return 'banned';
    }

    if (sendError.code === 'NETWORK_ERROR' || sendError.code === 'CLIENT_NOT_FOUND') {
      return 'error';
    }

    if (sendError.code === 'UNKNOWN_ERROR' || sendError.code === 'PERMISSION_DENIED') {
      return 'error';
    }

    return undefined;
  }

  private safeUpdatePoolStatus(accountId: string, status: AccountPoolStatus): void {
    const account = this.accountDao.findById(accountId);
    if (!account) {
      return;
    }

    // banned 只允许人工恢复，避免被自动逻辑误覆盖。
    if (account.poolStatus === 'banned' && status !== 'banned') {
      return;
    }

    if (account.poolStatus !== status) {
      this.accountDao.updatePoolStatus(accountId, status);
    }
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
