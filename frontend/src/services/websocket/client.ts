import { WS_URL } from '../../config';

/**
 * WebSocket 消息类型
 */
export enum WsMessageType {
  // 服务端推送
  ACCOUNT_STATUS = 'account_status',
  TASK_STATUS = 'task_status',
  NEW_LOG = 'new_log',
  ERROR = 'error',

  // 客户端消息
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  PING = 'ping',
  PONG = 'pong',
}

/**
 * 服务端订阅类型
 */
export enum SubscriptionType {
  ACCOUNTS = 'accounts',
  TASKS = 'tasks',
  LOGS = 'logs',
  ALL = 'all',
}

/**
 * WebSocket 消息结构
 */
export interface WsMessage<T = any> {
  type: WsMessageType | string;
  data?: T;
  timestamp?: number;
}

/**
 * 消息处理器类型
 */
export type MessageHandler<T = any> = (data: T) => void;

/**
 * WebSocket 客户端配置
 */
export interface WsClientConfig {
  url?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

/**
 * WebSocket 客户端类
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private heartbeatInterval: number;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private isManualClose = false;

  constructor(config: WsClientConfig = {}) {
    this.url = config.url || WS_URL;
    this.reconnectInterval = config.reconnectInterval || 3000;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.heartbeatInterval = config.heartbeatInterval || 30000;
  }

  /**
   * 连接 WebSocket
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket 已连接');
      return;
    }

    try {
      this.ws = new WebSocket(this.url);
      this.setupEventHandlers();
    } catch (error) {
      console.error('WebSocket 连接失败:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.isManualClose = true;
    this.clearTimers();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * 发送消息
   */
  send(type: WsMessageType | string, data?: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message: WsMessage = {
        type,
        data,
        timestamp: Date.now(),
      };
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket 未连接，无法发送消息');
    }
  }

  /**
   * 订阅消息类型
   */
  subscribe(type: string, handler: MessageHandler): () => void {
    this.connect();

    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);

    const subscriptionType = this.getSubscriptionType(type);
    this.sendSubscription(WsMessageType.SUBSCRIBE, [subscriptionType]);

    // 返回取消订阅函数
    return () => this.unsubscribe(type, handler);
  }

  /**
   * 取消订阅
   */
  unsubscribe(type: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.messageHandlers.delete(type);
        const subscriptionType = this.getSubscriptionType(type);
        this.sendSubscription(WsMessageType.UNSUBSCRIBE, [subscriptionType]);
      }
    }
  }

  /**
   * 获取连接状态
   */
  getReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('WebSocket 连接成功');
      this.reconnectAttempts = 0;
      this.startHeartbeat();

      this.resubscribeAll();
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WsMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('解析 WebSocket 消息失败:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket 错误:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket 连接关闭');
      this.clearTimers();

      if (!this.isManualClose) {
        this.scheduleReconnect();
      }
    };
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(message: WsMessage): void {
    // 心跳响应不分发
    if (message.type === WsMessageType.PONG) {
      return;
    }

    // 分发消息给订阅者
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(message.data);
        } catch (error) {
          console.error('消息处理器执行失败:', error);
        }
      });
    }
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send(WsMessageType.PING);
    }, this.heartbeatInterval);
  }

  private getSubscriptionType(messageType: string): SubscriptionType {
    if (messageType === WsMessageType.ACCOUNT_STATUS) {
      return SubscriptionType.ACCOUNTS;
    }
    if (messageType === WsMessageType.TASK_STATUS) {
      return SubscriptionType.TASKS;
    }
    if (messageType === WsMessageType.NEW_LOG) {
      return SubscriptionType.LOGS;
    }
    return SubscriptionType.ALL;
  }

  private sendSubscription(
    action: WsMessageType.SUBSCRIBE | WsMessageType.UNSUBSCRIBE,
    subscriptions: SubscriptionType[]
  ): void {
    const uniqueSubscriptions = Array.from(new Set(subscriptions));
    this.send(action, { subscriptions: uniqueSubscriptions });
  }

  private resubscribeAll(): void {
    const subscriptions = new Set<SubscriptionType>();

    for (const messageType of this.messageHandlers.keys()) {
      subscriptions.add(this.getSubscriptionType(messageType));
    }

    if (subscriptions.size > 0) {
      this.sendSubscription(WsMessageType.SUBSCRIBE, Array.from(subscriptions));
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('WebSocket 重连次数已达上限');
      return;
    }

    this.reconnectAttempts++;
    console.log(
      `WebSocket 将在 ${this.reconnectInterval}ms 后重连 (第 ${this.reconnectAttempts} 次)`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectInterval);
  }

  /**
   * 清理定时器
   */
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

/**
 * 全局 WebSocket 客户端实例
 */
export const wsClient = new WebSocketClient();
