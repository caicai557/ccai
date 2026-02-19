import { message, notification } from 'antd';
import type { ArgsProps as NotificationArgsProps } from 'antd/es/notification';

/**
 * Toast通知工具
 * 提供统一的消息提示接口
 */

const defaultMessageDuration = 3;
const duplicateErrorSuppressMs = 1500;
let lastErrorMessage = '';
let lastErrorAt = 0;

// 消息提示配置（maxCount 仅支持 message.config）
message.config({
  duration: defaultMessageDuration,
  maxCount: 3,
});

// 通知配置
const notificationConfig: Partial<NotificationArgsProps> = {
  duration: 4.5,
  placement: 'topRight',
};

/**
 * 成功消息
 */
export const showSuccess = (content: string, duration?: number): void => {
  message.success({
    content,
    duration: duration ?? defaultMessageDuration,
  });
};

/**
 * 错误消息
 */
export const showError = (content: string, duration?: number): void => {
  const now = Date.now();
  if (content === lastErrorMessage && now - lastErrorAt < duplicateErrorSuppressMs) {
    return;
  }
  lastErrorMessage = content;
  lastErrorAt = now;

  message.error({
    content,
    duration: duration ?? defaultMessageDuration,
  });
};

/**
 * 警告消息
 */
export const showWarning = (content: string, duration?: number): void => {
  message.warning({
    content,
    duration: duration ?? defaultMessageDuration,
  });
};

/**
 * 信息消息
 */
export const showInfo = (content: string, duration?: number): void => {
  message.info({
    content,
    duration: duration ?? defaultMessageDuration,
  });
};

/**
 * 加载中消息
 */
export const showLoading = (content: string = '加载中...'): (() => void) => {
  const hide = message.loading({
    content,
    duration: 0, // 不自动关闭
  });
  return hide;
};

/**
 * 成功通知（带标题和描述）
 */
export const notifySuccess = (message: string, description?: string, duration?: number): void => {
  notification.success({
    message,
    description,
    duration: duration ?? notificationConfig.duration,
    placement: notificationConfig.placement,
  });
};

/**
 * 错误通知（带标题和描述）
 */
export const notifyError = (message: string, description?: string, duration?: number): void => {
  notification.error({
    message,
    description,
    duration: duration ?? notificationConfig.duration,
    placement: notificationConfig.placement,
  });
};

/**
 * 警告通知（带标题和描述）
 */
export const notifyWarning = (message: string, description?: string, duration?: number): void => {
  notification.warning({
    message,
    description,
    duration: duration ?? notificationConfig.duration,
    placement: notificationConfig.placement,
  });
};

/**
 * 信息通知（带标题和描述）
 */
export const notifyInfo = (message: string, description?: string, duration?: number): void => {
  notification.info({
    message,
    description,
    duration: duration ?? notificationConfig.duration,
    placement: notificationConfig.placement,
  });
};

/**
 * 关闭所有消息
 */
export const closeAllMessages = (): void => {
  message.destroy();
};

/**
 * 关闭所有通知
 */
export const closeAllNotifications = (): void => {
  notification.destroy();
};

export default {
  showSuccess,
  showError,
  showWarning,
  showInfo,
  showLoading,
  notifySuccess,
  notifyError,
  notifyWarning,
  notifyInfo,
  closeAllMessages,
  closeAllNotifications,
};
