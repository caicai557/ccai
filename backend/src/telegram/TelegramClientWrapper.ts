import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram/tl';
import { getTelegramConfig } from '../config';
import { logger } from '../utils/logger';
import { SessionManager } from './SessionManager';

/**
 * 重连配置接口
 */
interface ReconnectConfig {
  maxAttempts: number; // 最大重连次数
  baseDelay: number; // 基础延迟（毫秒）
  maxDelay: number; // 最大延迟（毫秒）
  enableHeartbeat: boolean; // 是否启用心跳检测
  heartbeatInterval: number; // 心跳间隔（毫秒）
}

/**
 * Telegram客户端包装类
 */
export class TelegramClientWrapper {
  private client: TelegramClient;
  private accountId: string;
  private phoneNumber: string;
  private isConnected: boolean = false;
  private sessionManager: SessionManager;
  private reconnectAttempts: number = 0;
  private reconnectConfig: ReconnectConfig;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isReconnecting: boolean = false;
  private lastSuccessfulConnection: Date | null = null;
  private connectionFailures: number = 0;

  constructor(accountId: string, phoneNumber: string, session?: string) {
    this.accountId = accountId;
    this.phoneNumber = phoneNumber;
    this.sessionManager = SessionManager.getInstance();

    // 默认重连配置
    this.reconnectConfig = {
      maxAttempts: 5, // 最多重连5次
      baseDelay: 2000, // 基础延迟2秒
      maxDelay: 60000, // 最大延迟60秒
      enableHeartbeat: true, // 启用心跳检测
      heartbeatInterval: 60000, // 心跳间隔60秒
    };

    const config = getTelegramConfig();
    const stringSession = new StringSession(session || '');

    this.client = new TelegramClient(stringSession, parseInt(config.apiId), config.apiHash, {
      connectionRetries: 5,
      useWSS: false,
      autoReconnect: false, // 禁用内置自动重连，使用自定义逻辑
    });

    // 设置连接事件监听
    this.setupEventHandlers();
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // 监听连接状态变化
    this.client.addEventHandler((update: any) => {
      // 处理连接状态更新
      if (update.className === 'UpdateConnectionState') {
        this.handleConnectionStateChange(update.state);
      }
    });

    // 注意：GramJS 的错误处理通过 try-catch 而不是事件监听器
  }

  /**
   * 处理连接状态变化
   */
  private handleConnectionStateChange(state: number): void {
    switch (state) {
      case -1: // 断开连接
        logger.warn(`账号 ${this.phoneNumber} 连接断开`);
        this.isConnected = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
        break;

      case 0: // 连接中
        logger.debug(`账号 ${this.phoneNumber} 正在连接...`);
        break;

      case 1: // 已连接
        logger.info(`账号 ${this.phoneNumber} 连接成功`);
        this.isConnected = true;
        this.lastSuccessfulConnection = new Date();
        this.reconnectAttempts = 0;
        this.connectionFailures = 0;
        this.startHeartbeat();
        break;

      default:
        logger.debug(`账号 ${this.phoneNumber} 未知连接状态: ${state}`);
    }
  }

  /**
   * 处理连接错误（公开方法用于测试和扩展）
   */
  public handleConnectionError(error: Error): void {
    this.connectionFailures++;
    logger.error(
      `账号 ${this.phoneNumber} 连接错误 (失败次数: ${this.connectionFailures}):`,
      error
    );

    // 如果连接失败次数过多，增加重连延迟
    if (this.connectionFailures > 3) {
      logger.warn(`账号 ${this.phoneNumber} 连接失败次数过多，将使用更长的重连延迟`);
    }

    this.scheduleReconnect();
  }

  /**
   * 调度重连
   */
  private scheduleReconnect(): void {
    // 如果已经在重连中，不重复调度
    if (this.isReconnecting) {
      logger.debug(`账号 ${this.phoneNumber} 已在重连队列中，跳过`);
      return;
    }

    // 检查是否超过最大重连次数
    if (this.reconnectAttempts >= this.reconnectConfig.maxAttempts) {
      logger.error(
        `账号 ${this.phoneNumber} 重连次数已达上限 (${this.reconnectConfig.maxAttempts})，停止重连`
      );
      return;
    }

    // 清除之前的重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // 计算重连延迟（指数退避）
    const delay = this.calculateReconnectDelay();

    logger.info(
      `账号 ${this.phoneNumber} 将在 ${delay / 1000} 秒后尝试重连 (${this.reconnectAttempts + 1}/${this.reconnectConfig.maxAttempts})`
    );

    this.isReconnecting = true;
    this.reconnectTimer = setTimeout(() => {
      this.performReconnect();
    }, delay);
  }

  /**
   * 计算重连延迟（指数退避策略）
   */
  private calculateReconnectDelay(): number {
    // 指数退避: baseDelay * 2^attempts
    const exponentialDelay = this.reconnectConfig.baseDelay * Math.pow(2, this.reconnectAttempts);

    // 添加随机抖动（±20%）避免多个客户端同时重连
    const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);

    // 限制在最大延迟范围内
    const delay = Math.min(exponentialDelay + jitter, this.reconnectConfig.maxDelay);

    return Math.floor(delay);
  }

  /**
   * 执行重连
   */
  private async performReconnect(): Promise<void> {
    this.reconnectAttempts++;
    this.isReconnecting = false;

    try {
      logger.info(
        `开始重连账号 ${this.phoneNumber} (尝试 ${this.reconnectAttempts}/${this.reconnectConfig.maxAttempts})`
      );

      // 先断开旧连接
      if (this.isConnected) {
        try {
          await this.client.disconnect();
        } catch (error) {
          logger.debug(`断开旧连接时出错（可忽略）:`, error);
        }
      }

      // 尝试重新连接
      await this.connect();

      // 验证连接是否成功
      const isAuthorized = await this.isUserAuthorized();

      if (isAuthorized) {
        logger.info(`✅ 账号 ${this.phoneNumber} 重连成功`);
        this.reconnectAttempts = 0;
        this.connectionFailures = 0;
        this.lastSuccessfulConnection = new Date();
      } else {
        throw new Error('重连后未授权');
      }
    } catch (error) {
      logger.error(`账号 ${this.phoneNumber} 重连失败:`, error);

      // 如果还有重连机会，继续调度
      if (this.reconnectAttempts < this.reconnectConfig.maxAttempts) {
        this.scheduleReconnect();
      } else {
        logger.error(`账号 ${this.phoneNumber} 已达最大重连次数，放弃重连`);
      }
    }
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat(): void {
    if (!this.reconnectConfig.enableHeartbeat) {
      return;
    }

    // 清除旧的心跳定时器
    this.stopHeartbeat();

    logger.debug(`启动心跳检测: ${this.phoneNumber}`);

    this.heartbeatTimer = setInterval(() => {
      this.performHeartbeat();
    }, this.reconnectConfig.heartbeatInterval);
  }

  /**
   * 停止心跳检测
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger.debug(`停止心跳检测: ${this.phoneNumber}`);
    }
  }

  /**
   * 执行心跳检测
   */
  private async performHeartbeat(): Promise<void> {
    try {
      // 检查连接状态
      if (!this.isConnected) {
        logger.warn(`心跳检测: 账号 ${this.phoneNumber} 未连接`);
        this.scheduleReconnect();
        return;
      }

      // 发送简单的 API 调用验证连接（使用 getMe 代替 Ping）
      await this.client.getMe();

      logger.debug(`心跳检测成功: ${this.phoneNumber}`);
    } catch (error) {
      logger.error(`心跳检测失败: ${this.phoneNumber}`, error);
      this.isConnected = false;
      this.scheduleReconnect();
    }
  }

  /**
   * 手动触发重连
   */
  async manualReconnect(): Promise<void> {
    logger.info(`手动触发重连: ${this.phoneNumber}`);

    // 重置重连计数
    this.reconnectAttempts = 0;
    this.connectionFailures = 0;

    // 清除现有定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.isReconnecting = false;

    // 立即执行重连
    await this.performReconnect();
  }

  /**
   * 设置重连配置
   */
  setReconnectConfig(config: Partial<ReconnectConfig>): void {
    this.reconnectConfig = {
      ...this.reconnectConfig,
      ...config,
    };

    logger.info(`更新重连配置: ${this.phoneNumber}`, this.reconnectConfig);

    // 如果心跳配置改变，重启心跳
    if (config.enableHeartbeat !== undefined || config.heartbeatInterval !== undefined) {
      this.stopHeartbeat();
      if (this.isConnected && this.reconnectConfig.enableHeartbeat) {
        this.startHeartbeat();
      }
    }
  }

  /**
   * 获取重连状态
   */
  getReconnectStatus(): {
    isReconnecting: boolean;
    reconnectAttempts: number;
    maxAttempts: number;
    lastSuccessfulConnection: Date | null;
    connectionFailures: number;
  } {
    return {
      isReconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
      maxAttempts: this.reconnectConfig.maxAttempts,
      lastSuccessfulConnection: this.lastSuccessfulConnection,
      connectionFailures: this.connectionFailures,
    };
  }

  /**
   * 连接到Telegram
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      logger.debug(`账号 ${this.phoneNumber} 已连接`);
      return;
    }

    try {
      await this.client.connect();
      this.isConnected = true;
      logger.info(`✅ 账号 ${this.phoneNumber} 连接成功`);
    } catch (error) {
      logger.error(`账号 ${this.phoneNumber} 连接失败:`, error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      // 停止心跳和重连定时器
      this.stopHeartbeat();
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      await this.client.disconnect();
      this.isConnected = false;
      logger.info(`账号 ${this.phoneNumber} 已断开连接`);
    } catch (error) {
      logger.error(`账号 ${this.phoneNumber} 断开连接失败:`, error);
    }
  }

  /**
   * 发送验证码
   */
  async sendCode(): Promise<string> {
    await this.connect();

    try {
      const result = await this.client.sendCode(
        {
          apiId: parseInt(getTelegramConfig().apiId),
          apiHash: getTelegramConfig().apiHash,
        },
        this.phoneNumber
      );

      logger.info(`验证码已发送到 ${this.phoneNumber}`);
      return result.phoneCodeHash;
    } catch (error) {
      logger.error(`发送验证码失败:`, error);
      throw error;
    }
  }

  /**
   * 使用验证码登录
   */
  async signIn(phoneCode: string, phoneCodeHash: string): Promise<void> {
    try {
      await this.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: this.phoneNumber,
          phoneCodeHash: phoneCodeHash,
          phoneCode: phoneCode,
        })
      );

      logger.info(`✅ 账号 ${this.phoneNumber} 登录成功`);
    } catch (error: any) {
      if (error.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        logger.info(`账号 ${this.phoneNumber} 需要两步验证密码`);
        throw new Error('SESSION_PASSWORD_NEEDED');
      }
      logger.error(`登录失败:`, error);
      throw error;
    }
  }

  /**
   * 使用两步验证密码登录
   */
  async signInWithPassword(password: string): Promise<void> {
    try {
      // 使用 start 方法处理两步验证
      await this.client.start({
        phoneNumber: this.phoneNumber,
        password: async () => password,
        phoneCode: async () => {
          throw new Error('验证码已在之前步骤处理');
        },
        onError: (err) => {
          logger.error(`两步验证错误:`, err);
        },
      });

      logger.info(`✅ 账号 ${this.phoneNumber} 两步验证成功`);
    } catch (error) {
      logger.error(`两步验证失败:`, error);
      throw error;
    }
  }

  /**
   * 获取会话字符串
   */
  getSession(): string {
    return this.client.session.save() as unknown as string;
  }

  /**
   * 保存会话到数据库
   */
  async saveSession(): Promise<void> {
    try {
      const sessionString = this.getSession();
      await this.sessionManager.saveSession(this.accountId, sessionString);
      logger.debug(`会话已保存: ${this.phoneNumber}`);
    } catch (error) {
      logger.error(`保存会话失败: ${this.phoneNumber}`, error);
      throw error;
    }
  }

  /**
   * 验证会话是否有效
   */
  async validateSession(): Promise<boolean> {
    try {
      const isValid = await this.sessionManager.isSessionValid(this.accountId);

      if (!isValid) {
        logger.warn(`会话无效: ${this.phoneNumber}`);
        return false;
      }

      // 检查是否已授权
      const isAuthorized = await this.isUserAuthorized();

      if (!isAuthorized) {
        logger.warn(`会话已过期: ${this.phoneNumber}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`验证会话失败: ${this.phoneNumber}`, error);
      return false;
    }
  }

  /**
   * 获取当前用户信息
   */
  async getMe(): Promise<Api.User> {
    await this.connect();
    const me = await this.client.getMe();
    return me as Api.User;
  }

  /**
   * 发送消息到群组
   */
  async sendMessage(chatId: string | number, message: string): Promise<Api.Message> {
    await this.connect();

    try {
      const result = await this.client.sendMessage(chatId, { message });
      logger.info(`消息已发送到 ${chatId}`);
      return result;
    } catch (error) {
      logger.error(`发送消息失败:`, error);
      throw error;
    }
  }

  /**
   * 发送评论到频道消息
   */
  async sendComment(
    channelId: string | number,
    messageId: number,
    comment: string
  ): Promise<Api.Message> {
    await this.connect();

    try {
      const result = await this.client.invoke(
        new Api.messages.SendMessage({
          peer: channelId,
          message: comment,
          replyTo: new Api.InputReplyToMessage({ replyToMsgId: messageId }),
        })
      );

      logger.info(`评论已发送到频道 ${channelId} 的消息 ${messageId}`);
      return result as unknown as Api.Message;
    } catch (error) {
      logger.error(`发送评论失败:`, error);
      throw error;
    }
  }

  /**
   * 获取对话实体
   */
  async getEntity(entityId: string | number): Promise<Api.TypeEntityLike> {
    await this.connect();
    return await this.client.getEntity(entityId);
  }

  /**
   * 检查是否已登录
   */
  async isUserAuthorized(): Promise<boolean> {
    try {
      await this.connect();
      return await this.client.isUserAuthorized();
    } catch (_error) {
      return false;
    }
  }

  /**
   * 获取原始客户端（用于高级操作）
   */
  getRawClient(): TelegramClient {
    return this.client;
  }

  /**
   * 获取账号ID
   */
  getAccountId(): string {
    return this.accountId;
  }

  /**
   * 获取手机号
   */
  getPhoneNumber(): string {
    return this.phoneNumber;
  }

  /**
   * 检查连接状态
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }
}
