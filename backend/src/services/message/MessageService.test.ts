import Database from 'better-sqlite3';
import { MessageService } from './MessageService';
import { initSchema } from '../../database/schema';
import { DaoFactory } from '../../database/dao';
import { ClientPool } from '../../telegram/ClientPool';

describe('MessageService', () => {
  let db: Database.Database;
  let messageService: MessageService;

  beforeEach(() => {
    // 创建内存数据库
    db = new Database(':memory:');
    initSchema(db);

    // 初始化 DaoFactory
    DaoFactory.initialize(db);

    // 创建 MessageService 实例
    messageService = new MessageService(db);
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    ClientPool.getInstance().stopBackgroundTasks();
  });

  describe('错误处理', () => {
    it('应该正确解析 FloodWait 错误', () => {
      const error = {
        errorMessage: 'FLOOD_WAIT_60',
      };

      const sendError = (messageService as any).parseError(error);

      expect(sendError.code).toBe('FLOOD_WAIT');
      expect(sendError.isFloodWait).toBe(true);
      expect(sendError.waitSeconds).toBe(60);
      expect(sendError.isRetryable).toBe(true);
    });

    it('应该正确解析权限错误', () => {
      const error = {
        errorMessage: 'CHAT_WRITE_FORBIDDEN',
      };

      const sendError = (messageService as any).parseError(error);

      expect(sendError.code).toBe('PERMISSION_DENIED');
      expect(sendError.isFloodWait).toBe(false);
      expect(sendError.isRetryable).toBe(false);
    });

    it('应该正确解析网络错误', () => {
      const error = {
        code: 'ETIMEDOUT',
        message: 'Connection timeout',
      };

      const sendError = (messageService as any).parseError(error);

      expect(sendError.code).toBe('NETWORK_ERROR');
      expect(sendError.isFloodWait).toBe(false);
      expect(sendError.isRetryable).toBe(true);
    });

    it('应该正确解析未知错误', () => {
      const error = {
        message: 'Something went wrong',
      };

      const sendError = (messageService as any).parseError(error);

      expect(sendError.code).toBe('UNKNOWN_ERROR');
      expect(sendError.isFloodWait).toBe(false);
      expect(sendError.isRetryable).toBe(false);
    });
  });

  describe('重试逻辑', () => {
    it('应该正确判断错误是否可重试', () => {
      const retryableError = {
        code: 'NETWORK_ERROR',
        message: '网络连接错误',
        isFloodWait: false,
        isRetryable: true,
      };

      const nonRetryableError = {
        code: 'PERMISSION_DENIED',
        message: '没有权限发送消息',
        isFloodWait: false,
        isRetryable: false,
      };

      expect(messageService.isRetryable(retryableError)).toBe(true);
      expect(messageService.isRetryable(nonRetryableError)).toBe(false);
    });

    it('应该使用指数退避计算重试延迟', () => {
      const delay1 = messageService.getRetryDelay(1);
      const delay2 = messageService.getRetryDelay(2);
      const delay3 = messageService.getRetryDelay(3);

      expect(delay1).toBe(1000); // 1秒
      expect(delay2).toBe(2000); // 2秒
      expect(delay3).toBe(4000); // 4秒
    });
  });

  describe('消息历史', () => {
    it('应该能够获取消息历史DAO', () => {
      const dao = messageService.getMessageHistoryDao();
      expect(dao).toBeDefined();
    });

    it('应该能够记录消息历史', () => {
      const dao = messageService.getMessageHistoryDao();

      const history = dao.create({
        accountId: 'test-account',
        targetId: 'test-target',
        type: 'group_message',
        content: '测试消息',
        status: 'success',
      });

      expect(history.id).toBeDefined();
      expect(history.accountId).toBe('test-account');
      expect(history.targetId).toBe('test-target');
      expect(history.type).toBe('group_message');
      expect(history.content).toBe('测试消息');
      expect(history.status).toBe('success');
    });

    it('应该能够查询账号的消息历史', () => {
      const dao = messageService.getMessageHistoryDao();

      // 创建测试数据
      dao.create({
        accountId: 'account-1',
        targetId: 'target-1',
        type: 'group_message',
        content: '消息1',
        status: 'success',
      });

      dao.create({
        accountId: 'account-1',
        targetId: 'target-2',
        type: 'group_message',
        content: '消息2',
        status: 'success',
      });

      dao.create({
        accountId: 'account-2',
        targetId: 'target-1',
        type: 'group_message',
        content: '消息3',
        status: 'success',
      });

      // 查询 account-1 的历史
      const history = messageService.getAccountHistory('account-1');

      expect(history).toHaveLength(2);
      expect(history.every((h) => h.accountId === 'account-1')).toBe(true);
    });

    it('应该能够获取账号的消息统计', () => {
      const dao = messageService.getMessageHistoryDao();

      // 创建测试数据
      dao.create({
        accountId: 'account-1',
        targetId: 'target-1',
        type: 'group_message',
        content: '消息1',
        status: 'success',
      });

      dao.create({
        accountId: 'account-1',
        targetId: 'target-2',
        type: 'group_message',
        content: '消息2',
        status: 'success',
      });

      dao.create({
        accountId: 'account-1',
        targetId: 'target-3',
        type: 'group_message',
        content: '消息3',
        status: 'failed',
        error: '发送失败',
      });

      // 获取统计
      const stats = messageService.getAccountStats('account-1');

      expect(stats.total).toBe(3);
      expect(stats.success).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.successRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('监听器管理', () => {
    it('应该能够获取活跃的监听器列表', () => {
      const listeners = messageService.getActiveListeners();
      expect(Array.isArray(listeners)).toBe(true);
      expect(listeners).toHaveLength(0);
    });
  });
});
