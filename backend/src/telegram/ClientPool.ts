import { TelegramClientWrapper } from './TelegramClientWrapper';
import { SessionManager } from './SessionManager';
import { logger } from '../utils/logger';

/**
 * 客户端元数据
 */
interface ClientMetadata {
  client: TelegramClientWrapper;
  lastUsed: Date;
  useCount: number;
  isHealthy: boolean;
}

/**
 * 连接池统计信息
 */
export interface PoolStats {
  totalClients: number;
  activeClients: number;
  idleClients: number;
  maxClients: number;
  healthyClients: number;
  unhealthyClients: number;
}

/**
 * Telegram客户端连接池
 * 管理多个Telegram客户端实例，提供连接复用、健康检查、自动清理等功能
 */
export class ClientPool {
  private static instance: ClientPool;
  private clients: Map<string, ClientMetadata> = new Map();
  private maxClients: number = 50;
  private sessionManager: SessionManager;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private idleTimeout: number = 30 * 60 * 1000; // 30分钟空闲超时

  private constructor() {
    this.sessionManager = SessionManager.getInstance();
    this.startCleanupTask();
    this.startHealthCheckTask();
  }

  static getInstance(): ClientPool {
    if (!ClientPool.instance) {
      ClientPool.instance = new ClientPool();
    }
    return ClientPool.instance;
  }

  /**
   * 添加客户端到连接池
   */
  addClient(accountId: string, client: TelegramClientWrapper): void {
    // 检查连接池是否已满
    if (this.clients.size >= this.maxClients) {
      logger.warn(`客户端连接池已满（${this.maxClients}），移除最旧的空闲客户端`);
      this.removeOldestIdleClient();
    }

    // 如果客户端已存在，先移除旧的
    if (this.clients.has(accountId)) {
      logger.debug(`客户端已存在，更新: ${accountId}`);
      this.evictClient(accountId);
    }

    // 添加新客户端
    this.clients.set(accountId, {
      client,
      lastUsed: new Date(),
      useCount: 0,
      isHealthy: true,
    });

    logger.info(`✅ 客户端已添加到连接池: ${accountId} (当前池大小: ${this.clients.size})`);
  }

  /**
   * 从连接池获取客户端
   * 如果客户端不存在，尝试从数据库恢复会话并创建新客户端
   */
  async getClient(accountId: string): Promise<TelegramClientWrapper | undefined> {
    const metadata = this.clients.get(accountId);

    if (metadata) {
      // 更新使用信息
      metadata.lastUsed = new Date();
      metadata.useCount++;
      logger.debug(`获取客户端: ${accountId} (使用次数: ${metadata.useCount})`);
      return metadata.client;
    }

    // 尝试从数据库恢复会话
    logger.debug(`客户端不在连接池中，尝试恢复会话: ${accountId}`);
    return await this.restoreClient(accountId);
  }

  /**
   * 从数据库恢复客户端
   */
  private async restoreClient(accountId: string): Promise<TelegramClientWrapper | undefined> {
    try {
      // 检查会话是否有效
      const isValid = await this.sessionManager.isSessionValid(accountId);
      if (!isValid) {
        logger.warn(`会话无效，无法恢复客户端: ${accountId}`);
        return undefined;
      }

      // 加载会话
      const sessionString = await this.sessionManager.loadSession(accountId);
      const sessionInfo = await this.sessionManager.getSessionInfo(accountId);

      if (!sessionInfo) {
        logger.warn(`无法获取会话信息: ${accountId}`);
        return undefined;
      }

      // 创建新客户端
      const client = new TelegramClientWrapper(accountId, sessionInfo.phoneNumber, sessionString);

      // 连接并验证
      await client.connect();
      const isAuthorized = await client.isUserAuthorized();

      if (!isAuthorized) {
        logger.warn(`客户端未授权: ${accountId}`);
        await client.disconnect();
        return undefined;
      }

      // 添加到连接池
      this.addClient(accountId, client);

      logger.info(`✅ 客户端已从会话恢复: ${accountId}`);
      return client;
    } catch (error) {
      logger.error(`恢复客户端失败: ${accountId}`, error);
      return undefined;
    }
  }

  /**
   * 从连接池移除客户端
   */
  async removeClient(accountId: string): Promise<void> {
    const metadata = this.clients.get(accountId);
    if (metadata) {
      try {
        this.clients.delete(accountId);
        await this.disconnectClientSafely(metadata.client);
        logger.info(`✅ 客户端已从连接池移除: ${accountId}`);
      } catch (error) {
        logger.error(`移除客户端失败: ${accountId}`, error);
        // 即使断开连接失败，也要从池中移除
        this.clients.delete(accountId);
      }
    }
  }

  /**
   * 移除最旧的空闲客户端
   */
  private removeOldestIdleClient(): void {
    let oldestId: string | null = null;
    let oldestTime = new Date();

    // 查找最旧的空闲客户端
    for (const [accountId, metadata] of this.clients.entries()) {
      if (metadata.lastUsed < oldestTime) {
        oldestTime = metadata.lastUsed;
        oldestId = accountId;
      }
    }

    if (oldestId) {
      logger.info(`移除最旧的空闲客户端: ${oldestId}`);
      this.evictClient(oldestId);
    }
  }

  /**
   * 检查客户端是否存在
   */
  hasClient(accountId: string): boolean {
    return this.clients.has(accountId);
  }

  /**
   * 获取所有客户端ID
   */
  getAllClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * 获取活跃客户端ID列表（最近使用过的）
   */
  getActiveClientIds(withinMinutes: number = 30): string[] {
    const now = new Date();
    const threshold = new Date(now.getTime() - withinMinutes * 60 * 1000);

    return Array.from(this.clients.entries())
      .filter(([_, metadata]) => metadata.lastUsed >= threshold)
      .map(([accountId]) => accountId);
  }

  /**
   * 获取连接池大小
   */
  getPoolSize(): number {
    return this.clients.size;
  }

  /**
   * 获取连接池统计信息
   */
  getPoolStats(): PoolStats {
    const now = new Date();
    const activeThreshold = new Date(now.getTime() - 5 * 60 * 1000); // 5分钟内活跃

    let activeCount = 0;
    let healthyCount = 0;

    for (const metadata of this.clients.values()) {
      if (metadata.lastUsed >= activeThreshold) {
        activeCount++;
      }
      if (metadata.isHealthy) {
        healthyCount++;
      }
    }

    return {
      totalClients: this.clients.size,
      activeClients: activeCount,
      idleClients: this.clients.size - activeCount,
      maxClients: this.maxClients,
      healthyClients: healthyCount,
      unhealthyClients: this.clients.size - healthyCount,
    };
  }

  /**
   * 清空连接池
   */
  async clearPool(): Promise<void> {
    logger.info('正在清空客户端连接池...');

    const clientsToDisconnect = Array.from(this.clients.values()).map(
      (metadata) => metadata.client
    );
    this.clients.clear();
    const disconnectPromises = clientsToDisconnect.map((client) =>
      this.disconnectClientSafely(client)
    );

    await Promise.all(disconnectPromises);

    logger.info('✅ 客户端连接池已清空');
  }

  /**
   * 设置最大客户端数量
   */
  setMaxClients(max: number): void {
    if (max < 1) {
      throw new Error('最大客户端数量必须大于0');
    }

    this.maxClients = max;
    logger.info(`客户端连接池最大数量设置为: ${max}`);

    // 如果当前客户端数量超过新的最大值，移除多余的
    while (this.clients.size > this.maxClients) {
      this.removeOldestIdleClient();
    }
  }

  /**
   * 安全断开客户端连接，兼容测试桩对象（可能没有disconnect方法）
   */
  private async disconnectClientSafely(client: TelegramClientWrapper): Promise<void> {
    const disconnectFn = (client as unknown as { disconnect?: () => unknown }).disconnect;
    if (typeof disconnectFn !== 'function') {
      return;
    }

    try {
      await Promise.resolve(disconnectFn.call(client));
    } catch (error) {
      logger.error('断开客户端连接失败', error);
    }
  }

  /**
   * 立即从连接池驱逐客户端，并在后台安全断连
   */
  private evictClient(accountId: string): void {
    const metadata = this.clients.get(accountId);
    if (!metadata) {
      return;
    }

    this.clients.delete(accountId);
    void this.disconnectClientSafely(metadata.client);
  }

  /**
   * 设置空闲超时时间（毫秒）
   */
  setIdleTimeout(timeoutMs: number): void {
    if (timeoutMs < 0) {
      throw new Error('空闲超时时间不能为负数');
    }

    this.idleTimeout = timeoutMs;
    logger.info(`空闲超时时间设置为: ${timeoutMs}ms`);
  }

  /**
   * 启动清理任务
   * 定期清理空闲超时的客户端
   */
  private startCleanupTask(): void {
    // 每5分钟执行一次清理
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupIdleClients();
      },
      5 * 60 * 1000
    );

    logger.debug('客户端连接池清理任务已启动');
  }

  /**
   * 清理空闲超时的客户端
   */
  private async cleanupIdleClients(): Promise<void> {
    const now = new Date();
    const threshold = new Date(now.getTime() - this.idleTimeout);
    const toRemove: string[] = [];

    // 查找空闲超时的客户端
    for (const [accountId, metadata] of this.clients.entries()) {
      if (metadata.lastUsed < threshold) {
        toRemove.push(accountId);
      }
    }

    // 移除空闲客户端
    if (toRemove.length > 0) {
      logger.info(`清理 ${toRemove.length} 个空闲超时的客户端`);

      for (const accountId of toRemove) {
        await this.removeClient(accountId);
      }
    }
  }

  /**
   * 启动健康检查任务
   * 定期检查客户端连接状态
   */
  private startHealthCheckTask(): void {
    // 每10分钟执行一次健康检查
    this.healthCheckInterval = setInterval(
      () => {
        this.performHealthCheck();
      },
      10 * 60 * 1000
    );

    logger.debug('客户端连接池健康检查任务已启动');
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    logger.debug('开始执行客户端健康检查...');

    for (const [accountId, metadata] of this.clients.entries()) {
      try {
        const isConnected = metadata.client.getIsConnected();
        const isAuthorized = await metadata.client.isUserAuthorized();

        metadata.isHealthy = isConnected && isAuthorized;

        if (!metadata.isHealthy) {
          logger.warn(`客户端健康检查失败: ${accountId}`);
        }
      } catch (error) {
        logger.error(`健康检查异常: ${accountId}`, error);
        metadata.isHealthy = false;
      }
    }

    const stats = this.getPoolStats();
    logger.debug(`健康检查完成 - 健康: ${stats.healthyClients}, 不健康: ${stats.unhealthyClients}`);
  }

  /**
   * 重新连接不健康的客户端
   */
  async reconnectUnhealthyClients(): Promise<void> {
    logger.info('开始重新连接不健康的客户端...');

    const reconnectPromises: Promise<void>[] = [];

    for (const [accountId, metadata] of this.clients.entries()) {
      if (!metadata.isHealthy) {
        reconnectPromises.push(
          (async () => {
            try {
              logger.info(`尝试重新连接: ${accountId}`);
              await metadata.client.connect();

              const isAuthorized = await metadata.client.isUserAuthorized();
              if (isAuthorized) {
                metadata.isHealthy = true;
                logger.info(`✅ 重新连接成功: ${accountId}`);
              } else {
                logger.warn(`重新连接后未授权: ${accountId}`);
              }
            } catch (error) {
              logger.error(`重新连接失败: ${accountId}`, error);
            }
          })()
        );
      }
    }

    await Promise.all(reconnectPromises);
    logger.info('不健康客户端重连任务完成');
  }

  /**
   * 停止所有后台任务
   */
  stopBackgroundTasks(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.debug('清理任务已停止');
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.debug('健康检查任务已停止');
    }
  }

  /**
   * 销毁连接池
   * 清空所有客户端并停止后台任务
   */
  async destroy(): Promise<void> {
    logger.info('正在销毁客户端连接池...');

    this.stopBackgroundTasks();
    await this.clearPool();

    logger.info('✅ 客户端连接池已销毁');
  }
}
