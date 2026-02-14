import { ClientPool } from './ClientPool';
import { TelegramClientWrapper } from './TelegramClientWrapper';

/**
 * 客户端连接池单元测试
 */
describe('ClientPool', () => {
  let clientPool: ClientPool;

  beforeEach(() => {
    // 获取连接池实例
    clientPool = ClientPool.getInstance();
  });

  afterEach(async () => {
    // 清理连接池
    await clientPool.clearPool();
  });

  describe('基本功能', () => {
    test('应该是单例模式', () => {
      const instance1 = ClientPool.getInstance();
      const instance2 = ClientPool.getInstance();
      expect(instance1).toBe(instance2);
    });

    test('应该能够添加客户端', () => {
      const mockClient = {} as TelegramClientWrapper;
      clientPool.addClient('test-account-1', mockClient);

      expect(clientPool.hasClient('test-account-1')).toBe(true);
      expect(clientPool.getPoolSize()).toBe(1);
    });

    test('应该能够获取客户端', async () => {
      const mockClient = {} as TelegramClientWrapper;
      clientPool.addClient('test-account-1', mockClient);

      const retrieved = await clientPool.getClient('test-account-1');
      expect(retrieved).toBe(mockClient);
    });

    test('应该能够移除客户端', async () => {
      const mockClient = {
        disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as TelegramClientWrapper;

      clientPool.addClient('test-account-1', mockClient);
      expect(clientPool.hasClient('test-account-1')).toBe(true);

      await clientPool.removeClient('test-account-1');
      expect(clientPool.hasClient('test-account-1')).toBe(false);
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    test('应该能够获取所有客户端ID', () => {
      const mockClient1 = {} as TelegramClientWrapper;
      const mockClient2 = {} as TelegramClientWrapper;

      clientPool.addClient('account-1', mockClient1);
      clientPool.addClient('account-2', mockClient2);

      const ids = clientPool.getAllClientIds();
      expect(ids).toHaveLength(2);
      expect(ids).toContain('account-1');
      expect(ids).toContain('account-2');
    });

    test('应该能够清空连接池', async () => {
      const mockClient1 = {
        disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as TelegramClientWrapper;
      const mockClient2 = {
        disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as TelegramClientWrapper;

      clientPool.addClient('account-1', mockClient1);
      clientPool.addClient('account-2', mockClient2);

      await clientPool.clearPool();

      expect(clientPool.getPoolSize()).toBe(0);
      expect(mockClient1.disconnect).toHaveBeenCalled();
      expect(mockClient2.disconnect).toHaveBeenCalled();
    });
  });

  describe('连接池容量管理', () => {
    test('应该能够设置最大客户端数量', () => {
      clientPool.setMaxClients(10);
      // 验证设置成功（通过日志或其他方式）
      expect(() => clientPool.setMaxClients(10)).not.toThrow();
    });

    test('设置无效的最大客户端数量应该抛出错误', () => {
      expect(() => clientPool.setMaxClients(0)).toThrow('最大客户端数量必须大于0');
      expect(() => clientPool.setMaxClients(-1)).toThrow('最大客户端数量必须大于0');
    });

    test('当连接池满时应该移除最旧的客户端', async () => {
      clientPool.setMaxClients(2);

      const mockClient1 = {
        disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as TelegramClientWrapper;
      const mockClient2 = {
        disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as TelegramClientWrapper;
      const mockClient3 = {
        disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as TelegramClientWrapper;

      clientPool.addClient('account-1', mockClient1);
      await new Promise((resolve) => setTimeout(resolve, 10)); // 确保时间差异

      clientPool.addClient('account-2', mockClient2);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 添加第三个客户端应该移除第一个
      clientPool.addClient('account-3', mockClient3);

      expect(clientPool.getPoolSize()).toBe(2);
      expect(clientPool.hasClient('account-1')).toBe(false);
      expect(clientPool.hasClient('account-2')).toBe(true);
      expect(clientPool.hasClient('account-3')).toBe(true);
    });
  });

  describe('统计信息', () => {
    test('应该能够获取连接池统计信息', () => {
      const mockClient = {} as TelegramClientWrapper;
      clientPool.addClient('account-1', mockClient);

      const stats = clientPool.getPoolStats();

      expect(stats.totalClients).toBe(1);
      expect(stats.maxClients).toBeGreaterThan(0);
      expect(stats.healthyClients).toBeGreaterThanOrEqual(0);
      expect(stats.unhealthyClients).toBeGreaterThanOrEqual(0);
    });

    test('应该能够获取活跃客户端列表', async () => {
      const mockClient = {} as TelegramClientWrapper;
      clientPool.addClient('account-1', mockClient);

      // 刚添加的客户端应该是活跃的
      const activeIds = clientPool.getActiveClientIds(30);
      expect(activeIds).toContain('account-1');
    });
  });

  describe('空闲超时管理', () => {
    test('应该能够设置空闲超时时间', () => {
      expect(() => clientPool.setIdleTimeout(60000)).not.toThrow();
    });

    test('设置无效的空闲超时时间应该抛出错误', () => {
      expect(() => clientPool.setIdleTimeout(-1)).toThrow('空闲超时时间不能为负数');
    });
  });

  describe('后台任务管理', () => {
    test('应该能够停止后台任务', () => {
      expect(() => clientPool.stopBackgroundTasks()).not.toThrow();
    });

    test('应该能够销毁连接池', async () => {
      const mockClient = {
        disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as TelegramClientWrapper;

      clientPool.addClient('account-1', mockClient);

      await clientPool.destroy();

      expect(clientPool.getPoolSize()).toBe(0);
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });
});
