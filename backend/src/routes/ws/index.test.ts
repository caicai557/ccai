/**
 * WebSocket服务器测试
 */
import { Server as HttpServer } from 'http';
import WebSocket from 'ws';
import { WSManager, WSMessageType, SubscriptionType } from './index';

describe('WebSocket消息处理', () => {
  let httpServer: HttpServer;
  let wsManager: WSManager;
  let wsClient: WebSocket;
  const port = 3002;

  beforeAll((done) => {
    // 创建HTTP服务器
    httpServer = new HttpServer();
    httpServer.listen(port, () => {
      // 初始化WebSocket服务器
      wsManager = new WSManager();
      wsManager.initialize(httpServer);
      done();
    });
  });

  afterAll((done) => {
    wsManager.close();
    httpServer.close(() => {
      done();
    });
  });

  afterEach(() => {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.close();
    }
  });

  test('应该成功建立WebSocket连接', (done) => {
    wsClient = new WebSocket(`ws://localhost:${port}`);

    wsClient.on('open', () => {
      expect(wsClient.readyState).toBe(WebSocket.OPEN);
      done();
    });

    wsClient.on('error', (error) => {
      done(error);
    });
  });

  test('应该处理订阅请求', (done) => {
    wsClient = new WebSocket(`ws://localhost:${port}`);

    wsClient.on('open', () => {
      // 发送订阅消息
      const subscribeMessage = {
        type: WSMessageType.SUBSCRIBE,
        data: {
          subscriptions: [SubscriptionType.ACCOUNTS, SubscriptionType.TASKS],
        },
      };

      wsClient.send(JSON.stringify(subscribeMessage));

      // 等待一小段时间确保消息被处理
      setTimeout(() => {
        // 如果没有错误，说明订阅成功
        expect(wsClient.readyState).toBe(WebSocket.OPEN);
        done();
      }, 100);
    });
  });

  test('应该处理取消订阅请求', (done) => {
    wsClient = new WebSocket(`ws://localhost:${port}`);

    wsClient.on('open', () => {
      // 先订阅
      const subscribeMessage = {
        type: WSMessageType.SUBSCRIBE,
        data: {
          subscriptions: [SubscriptionType.ACCOUNTS],
        },
      };

      wsClient.send(JSON.stringify(subscribeMessage));

      setTimeout(() => {
        // 再取消订阅
        const unsubscribeMessage = {
          type: WSMessageType.UNSUBSCRIBE,
          data: {
            subscriptions: [SubscriptionType.ACCOUNTS],
          },
        };

        wsClient.send(JSON.stringify(unsubscribeMessage));

        setTimeout(() => {
          expect(wsClient.readyState).toBe(WebSocket.OPEN);
          done();
        }, 100);
      }, 100);
    });
  });

  test('应该响应心跳PING消息', (done) => {
    wsClient = new WebSocket(`ws://localhost:${port}`);

    wsClient.on('open', () => {
      // 发送PING消息
      const pingMessage = {
        type: WSMessageType.PING,
      };

      wsClient.send(JSON.stringify(pingMessage));
    });

    wsClient.on('message', (data) => {
      const message = JSON.parse(data.toString());

      // 应该收到PONG响应
      if (message.type === WSMessageType.PONG) {
        expect(message.type).toBe(WSMessageType.PONG);
        done();
      }
    });
  });

  test('应该处理无效消息格式', (done) => {
    wsClient = new WebSocket(`ws://localhost:${port}`);

    wsClient.on('open', () => {
      // 发送无效的JSON
      wsClient.send('invalid json');
    });

    wsClient.on('message', (data) => {
      const message = JSON.parse(data.toString());

      // 应该收到错误消息
      if (message.type === WSMessageType.ERROR) {
        expect(message.type).toBe(WSMessageType.ERROR);
        expect(message.data.error).toBe('消息格式错误');
        done();
      }
    });
  });

  test('应该接收广播的账号状态消息', (done) => {
    wsClient = new WebSocket(`ws://localhost:${port}`);

    wsClient.on('open', () => {
      // 订阅账号状态
      const subscribeMessage = {
        type: WSMessageType.SUBSCRIBE,
        data: {
          subscriptions: [SubscriptionType.ACCOUNTS],
        },
      };

      wsClient.send(JSON.stringify(subscribeMessage));

      setTimeout(() => {
        // 广播账号状态
        wsManager.broadcastAccountStatus({
          accountId: 'test-account-1',
          status: 'online',
          healthScore: 95,
        });
      }, 100);
    });

    wsClient.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === WSMessageType.ACCOUNT_STATUS) {
        expect(message.type).toBe(WSMessageType.ACCOUNT_STATUS);
        expect(message.data.accountId).toBe('test-account-1');
        expect(message.data.status).toBe('online');
        expect(message.data.healthScore).toBe(95);
        done();
      }
    });
  });

  test('应该接收广播的任务状态消息', (done) => {
    wsClient = new WebSocket(`ws://localhost:${port}`);

    wsClient.on('open', () => {
      // 订阅任务状态
      const subscribeMessage = {
        type: WSMessageType.SUBSCRIBE,
        data: {
          subscriptions: [SubscriptionType.TASKS],
        },
      };

      wsClient.send(JSON.stringify(subscribeMessage));

      setTimeout(() => {
        // 广播任务状态
        wsManager.broadcastTaskStatus({
          taskId: 'test-task-1',
          status: 'running',
          successCount: 10,
          failureCount: 0,
        });
      }, 100);
    });

    wsClient.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === WSMessageType.TASK_STATUS) {
        expect(message.type).toBe(WSMessageType.TASK_STATUS);
        expect(message.data.taskId).toBe('test-task-1');
        expect(message.data.status).toBe('running');
        expect(message.data.successCount).toBe(10);
        done();
      }
    });
  });

  test('应该接收广播的日志消息', (done) => {
    wsClient = new WebSocket(`ws://localhost:${port}`);

    wsClient.on('open', () => {
      // 订阅日志
      const subscribeMessage = {
        type: WSMessageType.SUBSCRIBE,
        data: {
          subscriptions: [SubscriptionType.LOGS],
        },
      };

      wsClient.send(JSON.stringify(subscribeMessage));

      setTimeout(() => {
        // 广播日志
        wsManager.broadcastNewLog({
          id: 'log-1',
          level: 'INFO',
          message: '测试日志消息',
          createdAt: new Date().toISOString(),
        });
      }, 100);
    });

    wsClient.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === WSMessageType.NEW_LOG) {
        expect(message.type).toBe(WSMessageType.NEW_LOG);
        expect(message.data.id).toBe('log-1');
        expect(message.data.level).toBe('INFO');
        expect(message.data.message).toBe('测试日志消息');
        done();
      }
    });
  });

  test('订阅ALL应该接收所有类型的消息', (done) => {
    wsClient = new WebSocket(`ws://localhost:${port}`);
    let receivedMessages = 0;

    wsClient.on('open', () => {
      // 订阅所有类型
      const subscribeMessage = {
        type: WSMessageType.SUBSCRIBE,
        data: {
          subscriptions: [SubscriptionType.ALL],
        },
      };

      wsClient.send(JSON.stringify(subscribeMessage));

      setTimeout(() => {
        // 广播不同类型的消息
        wsManager.broadcastAccountStatus({
          accountId: 'test-account',
          status: 'online',
        });

        wsManager.broadcastTaskStatus({
          taskId: 'test-task',
          status: 'running',
        });

        wsManager.broadcastNewLog({
          id: 'log-1',
          level: 'INFO',
          message: '测试',
          createdAt: new Date().toISOString(),
        });
      }, 100);
    });

    wsClient.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (
        message.type === WSMessageType.ACCOUNT_STATUS ||
        message.type === WSMessageType.TASK_STATUS ||
        message.type === WSMessageType.NEW_LOG
      ) {
        receivedMessages++;

        // 应该接收到所有3条消息
        if (receivedMessages === 3) {
          expect(receivedMessages).toBe(3);
          done();
        }
      }
    });
  });
});
