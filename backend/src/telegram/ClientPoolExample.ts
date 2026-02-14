import { ClientPool } from './ClientPool';
import { TelegramClientWrapper } from './TelegramClientWrapper';
import { logger } from '../utils/logger';

/**
 * 客户端连接池使用示例
 *
 * 这个文件展示了如何使用ClientPool来管理多个Telegram客户端实例
 */

/**
 * 示例1: 基本使用
 */
export async function basicUsageExample() {
  // 获取连接池单例
  const pool = ClientPool.getInstance();

  // 创建客户端
  const client = new TelegramClientWrapper('account-1', '+1234567890');

  // 添加到连接池
  pool.addClient('account-1', client);

  // 从连接池获取客户端
  const retrievedClient = await pool.getClient('account-1');

  if (retrievedClient) {
    logger.info('成功从连接池获取客户端');
  }

  // 使用完毕后移除
  await pool.removeClient('account-1');
}

/**
 * 示例2: 管理多个客户端
 */
export async function multipleClientsExample() {
  const pool = ClientPool.getInstance();

  // 添加多个客户端
  const accounts = [
    { id: 'account-1', phone: '+1234567890' },
    { id: 'account-2', phone: '+0987654321' },
    { id: 'account-3', phone: '+1122334455' },
  ];

  for (const account of accounts) {
    const client = new TelegramClientWrapper(account.id, account.phone);
    pool.addClient(account.id, client);
  }

  // 获取所有客户端ID
  const allIds = pool.getAllClientIds();
  logger.info(`连接池中有 ${allIds.length} 个客户端`);

  // 获取统计信息
  const stats = pool.getPoolStats();
  logger.info('连接池统计:', stats);
}

/**
 * 示例3: 自动恢复会话
 */
export async function sessionRestoreExample() {
  const pool = ClientPool.getInstance();

  // 尝试获取客户端，如果不在连接池中，会自动从数据库恢复会话
  const client = await pool.getClient('existing-account-id');

  if (client) {
    logger.info('客户端已从会话恢复');

    // 检查是否已授权
    const isAuthorized = await client.isUserAuthorized();
    logger.info(`客户端授权状态: ${isAuthorized}`);
  } else {
    logger.warn('无法恢复客户端会话');
  }
}

/**
 * 示例4: 配置连接池
 */
export function configurePoolExample() {
  const pool = ClientPool.getInstance();

  // 设置最大客户端数量
  pool.setMaxClients(20);

  // 设置空闲超时时间（30分钟）
  pool.setIdleTimeout(30 * 60 * 1000);

  logger.info('连接池配置已更新');
}

/**
 * 示例5: 监控连接池状态
 */
export function monitorPoolExample() {
  const pool = ClientPool.getInstance();

  // 获取详细统计信息
  const stats = pool.getPoolStats();

  logger.info('=== 连接池状态 ===');
  logger.info(`总客户端数: ${stats.totalClients}`);
  logger.info(`活跃客户端: ${stats.activeClients}`);
  logger.info(`空闲客户端: ${stats.idleClients}`);
  logger.info(`健康客户端: ${stats.healthyClients}`);
  logger.info(`不健康客户端: ${stats.unhealthyClients}`);
  logger.info(`最大容量: ${stats.maxClients}`);

  // 获取最近30分钟内活跃的客户端
  const activeIds = pool.getActiveClientIds(30);
  logger.info(`最近30分钟活跃的客户端: ${activeIds.join(', ')}`);
}

/**
 * 示例6: 健康检查和重连
 */
export async function healthCheckExample() {
  const pool = ClientPool.getInstance();

  // 获取统计信息，查看不健康的客户端
  const stats = pool.getPoolStats();

  if (stats.unhealthyClients > 0) {
    logger.warn(`发现 ${stats.unhealthyClients} 个不健康的客户端`);

    // 尝试重新连接不健康的客户端
    await pool.reconnectUnhealthyClients();

    // 再次检查
    const newStats = pool.getPoolStats();
    logger.info(`重连后健康客户端数: ${newStats.healthyClients}`);
  }
}

/**
 * 示例7: 清理和销毁
 */
export async function cleanupExample() {
  const pool = ClientPool.getInstance();

  // 清空连接池（断开所有客户端）
  await pool.clearPool();
  logger.info('连接池已清空');

  // 或者完全销毁连接池（包括停止后台任务）
  await pool.destroy();
  logger.info('连接池已销毁');
}

/**
 * 示例8: 错误处理
 */
export async function errorHandlingExample() {
  const pool = ClientPool.getInstance();

  try {
    // 尝试获取不存在的客户端
    const client = await pool.getClient('non-existent-account');

    if (!client) {
      logger.warn('客户端不存在或无法恢复');
      // 处理客户端不存在的情况
    }
  } catch (error) {
    logger.error('获取客户端时发生错误:', error);
  }

  try {
    // 设置无效的配置
    pool.setMaxClients(-1);
  } catch (error) {
    logger.error('配置错误:', error);
  }
}

/**
 * 完整的工作流程示例
 */
export async function completeWorkflowExample() {
  const pool = ClientPool.getInstance();

  try {
    // 1. 配置连接池
    pool.setMaxClients(10);
    pool.setIdleTimeout(30 * 60 * 1000);

    // 2. 添加客户端
    const client = new TelegramClientWrapper('my-account', '+1234567890');
    await client.connect();
    pool.addClient('my-account', client);

    // 3. 使用客户端发送消息
    const retrievedClient = await pool.getClient('my-account');
    if (retrievedClient) {
      await retrievedClient.sendMessage('chat-id', '你好！');
    }

    // 4. 监控状态
    const stats = pool.getPoolStats();
    logger.info('当前连接池状态:', stats);

    // 5. 定期健康检查
    setInterval(
      async () => {
        const currentStats = pool.getPoolStats();
        if (currentStats.unhealthyClients > 0) {
          await pool.reconnectUnhealthyClients();
        }
      },
      10 * 60 * 1000
    ); // 每10分钟检查一次
  } catch (error) {
    logger.error('工作流程执行失败:', error);
  }
}
