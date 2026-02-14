import { useEffect, useRef } from 'react';
import { wsClient, WsMessageType, MessageHandler } from '../services/websocket/client';

/**
 * WebSocket Hook
 * 用于在组件中订阅 WebSocket 消息
 */
export const useWebSocket = <T = any>(
  messageType: WsMessageType | string,
  handler: MessageHandler<T>,
  deps: any[] = []
): void => {
  const handlerRef = useRef(handler);

  // 更新 handler 引用
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    // 确保连接已建立（幂等调用）
    wsClient.connect();

    // 包装 handler 以使用最新的引用
    const wrappedHandler = (data: T) => {
      handlerRef.current(data);
    };

    // 订阅消息
    const unsubscribe = wsClient.subscribe(messageType, wrappedHandler);

    // 组件卸载时取消订阅
    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageType, ...deps]);
};

/**
 * WebSocket 连接状态 Hook
 */
export const useWebSocketConnection = (): {
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
} => {
  useEffect(() => {
    // 组件挂载时连接
    wsClient.connect();

    // 组件卸载时断开连接
    return () => {
      wsClient.disconnect();
    };
  }, []);

  return {
    isConnected: wsClient.isConnected(),
    connect: () => wsClient.connect(),
    disconnect: () => wsClient.disconnect(),
  };
};
