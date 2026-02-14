/**
 * WebSocket服务器
 * 提供实时状态推送功能
 */
import { Server as HttpServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { logger } from '../../utils/logger';

/**
 * WebSocket消息类型
 */
export enum WSMessageType {
  // 客户端消息
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  PING = 'ping',

  // 服务器消息
  PONG = 'pong',
  ACCOUNT_STATUS = 'account_status',
  TASK_STATUS = 'task_status',
  NEW_LOG = 'new_log',
  ERROR = 'error',
}

/**
 * 订阅类型
 */
export enum SubscriptionType {
  ACCOUNTS = 'accounts',
  TASKS = 'tasks',
  LOGS = 'logs',
  ALL = 'all',
}

/**
 * WebSocket消息接口
 */
export interface WSMessage {
  type: WSMessageType;
  data?: any;
}

/**
 * 客户端订阅消息
 */
export interface SubscribeMessage extends WSMessage {
  type: WSMessageType.SUBSCRIBE;
  data: {
    subscriptions: SubscriptionType[];
  };
}

/**
 * 客户端取消订阅消息
 */
export interface UnsubscribeMessage extends WSMessage {
  type: WSMessageType.UNSUBSCRIBE;
  data: {
    subscriptions: SubscriptionType[];
  };
}

/**
 * 账号状态变化消息
 */
export interface AccountStatusMessage extends WSMessage {
  type: WSMessageType.ACCOUNT_STATUS;
  data: {
    accountId: string;
    status: string;
    healthScore?: number;
    lastActiveAt?: string;
  };
}

/**
 * 任务状态变化消息
 */
export interface TaskStatusMessage extends WSMessage {
  type: WSMessageType.TASK_STATUS;
  data: {
    taskId: string;
    status: string;
    lastExecutedAt?: string;
    nextExecutionAt?: string;
    successCount?: number;
    failureCount?: number;
  };
}

/**
 * 新日志消息
 */
export interface NewLogMessage extends WSMessage {
  type: WSMessageType.NEW_LOG;
  data: {
    id: string;
    level: string;
    message: string;
    accountId?: string;
    taskId?: string;
    createdAt: string;
  };
}

/**
 * 客户端连接信息
 */
interface ClientConnection {
  ws: WebSocket;
  subscriptions: Set<SubscriptionType>;
  isAlive: boolean;
}

/**
 * WebSocket服务器管理器
 */
export class WSManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  /**
   * 初始化WebSocket服务器
   */
  initialize(server: HttpServer): void {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    // 启动心跳检测
    this.startHeartbeat();

    logger.info('✅ WebSocket服务器初始化完成');
  }

  /**
   * 处理新连接
   */
  private handleConnection(ws: WebSocket): void {
    logger.info('WebSocket客户端已连接');

    // 初始化客户端连接信息
    const client: ClientConnection = {
      ws,
      subscriptions: new Set(),
      isAlive: true,
    };

    this.clients.set(ws, client);

    // 设置pong响应处理
    ws.on('pong', () => {
      const clientInfo = this.clients.get(ws);
      if (clientInfo) {
        clientInfo.isAlive = true;
      }
    });

    // 处理消息
    ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(ws, data);
    });

    // 处理断开连接
    ws.on('close', () => {
      this.handleDisconnection(ws);
    });

    // 处理错误
    ws.on('error', (error: Error) => {
      logger.error('WebSocket错误:', error);
    });
  }

  /**
   * 处理客户端消息
   */
  private handleMessage(ws: WebSocket, data: WebSocket.Data): void {
    try {
      const message: WSMessage = JSON.parse(data.toString());

      switch (message.type) {
        case WSMessageType.SUBSCRIBE:
          this.handleSubscribe(ws, message as SubscribeMessage);
          break;

        case WSMessageType.UNSUBSCRIBE:
          this.handleUnsubscribe(ws, message as UnsubscribeMessage);
          break;

        case WSMessageType.PING:
          this.handlePing(ws);
          break;

        default:
          logger.warn(`未知的WebSocket消息类型: ${message.type}`);
      }
    } catch (error) {
      logger.error('处理WebSocket消息失败:', error);
      this.sendError(ws, '消息格式错误');
    }
  }

  /**
   * 处理订阅请求
   */
  private handleSubscribe(ws: WebSocket, message: SubscribeMessage): void {
    const client = this.clients.get(ws);
    if (!client) return;

    const { subscriptions } = message.data;

    subscriptions.forEach((sub) => {
      client.subscriptions.add(sub);
    });

    logger.info(`客户端订阅: ${subscriptions.join(', ')}`);
  }

  /**
   * 处理取消订阅请求
   */
  private handleUnsubscribe(ws: WebSocket, message: UnsubscribeMessage): void {
    const client = this.clients.get(ws);
    if (!client) return;

    const { subscriptions } = message.data;

    subscriptions.forEach((sub) => {
      client.subscriptions.delete(sub);
    });

    logger.info(`客户端取消订阅: ${subscriptions.join(', ')}`);
  }

  /**
   * 处理心跳ping
   */
  private handlePing(ws: WebSocket): void {
    const message: WSMessage = {
      type: WSMessageType.PONG,
    };

    this.sendMessage(ws, message);
  }

  /**
   * 处理断开连接
   */
  private handleDisconnection(ws: WebSocket): void {
    this.clients.delete(ws);
    logger.info('WebSocket客户端已断开连接');
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat(): void {
    // 每30秒检测一次
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, ws) => {
        if (!client.isAlive) {
          // 客户端未响应，断开连接
          logger.warn('客户端心跳超时，断开连接');
          ws.terminate();
          this.clients.delete(ws);
          return;
        }

        // 标记为未响应，等待pong
        client.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  /**
   * 发送消息给指定客户端
   */
  private sendMessage(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * 发送错误消息
   */
  private sendError(ws: WebSocket, error: string): void {
    const message: WSMessage = {
      type: WSMessageType.ERROR,
      data: { error },
    };

    this.sendMessage(ws, message);
  }

  /**
   * 广播消息给所有订阅了指定类型的客户端
   */
  private broadcast(message: WSMessage, subscriptionType: SubscriptionType): void {
    this.clients.forEach((client) => {
      // 检查客户端是否订阅了该类型或订阅了所有类型
      if (
        client.subscriptions.has(subscriptionType) ||
        client.subscriptions.has(SubscriptionType.ALL)
      ) {
        this.sendMessage(client.ws, message);
      }
    });
  }

  /**
   * 推送账号状态变化
   */
  broadcastAccountStatus(data: AccountStatusMessage['data']): void {
    const message: AccountStatusMessage = {
      type: WSMessageType.ACCOUNT_STATUS,
      data,
    };

    this.broadcast(message, SubscriptionType.ACCOUNTS);
    logger.debug(`广播账号状态: ${data.accountId} - ${data.status}`);
  }

  /**
   * 推送任务状态变化
   */
  broadcastTaskStatus(data: TaskStatusMessage['data']): void {
    const message: TaskStatusMessage = {
      type: WSMessageType.TASK_STATUS,
      data,
    };

    this.broadcast(message, SubscriptionType.TASKS);
    logger.debug(`广播任务状态: ${data.taskId} - ${data.status}`);
  }

  /**
   * 推送新日志记录
   */
  broadcastNewLog(data: NewLogMessage['data']): void {
    const message: NewLogMessage = {
      type: WSMessageType.NEW_LOG,
      data,
    };

    this.broadcast(message, SubscriptionType.LOGS);
    logger.debug(`广播新日志: ${data.level} - ${data.message}`);
  }

  /**
   * 关闭WebSocket服务器
   */
  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    this.clients.forEach((client) => {
      client.ws.close();
    });

    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    logger.info('WebSocket服务器已关闭');
  }
}

// 导出单例实例
export const wsManager = new WSManager();
