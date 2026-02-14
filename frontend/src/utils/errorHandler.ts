import { AxiosError } from 'axios';
import { showError, notifyError } from './notification';

/**
 * 错误处理工具
 * 提供统一的错误处理和友好的错误消息
 */

interface ApiError {
  code?: string;
  message: string;
  details?: any;
}

/**
 * 错误消息映射
 * 将后端错误代码映射为用户友好的消息
 */
const errorMessageMap: Record<string, string> = {
  // 网络错误
  NETWORK_ERROR: '网络连接失败，请检查网络设置',
  TIMEOUT_ERROR: '请求超时，请稍后重试',

  // 认证错误
  UNAUTHORIZED: '未授权，请重新登录',
  FORBIDDEN: '没有权限执行此操作',

  // 资源错误
  NOT_FOUND: '请求的资源不存在',
  ALREADY_EXISTS: '资源已存在',

  // 验证错误
  VALIDATION_ERROR: '输入数据验证失败',
  INVALID_PHONE: '手机号格式不正确',
  INVALID_CODE: '验证码不正确',
  INVALID_PASSWORD: '密码不正确',

  // 业务错误
  ACCOUNT_RESTRICTED: '账号已被限制',
  RATE_LIMIT_EXCEEDED: '操作过于频繁，请稍后再试',
  FLOOD_WAIT: 'Telegram限制中，请稍后再试',
  TASK_RUNNING: '任务正在运行中，无法执行此操作',
  TEMPLATE_IN_USE: '模板正在被使用，无法删除',

  // 系统错误
  INTERNAL_ERROR: '系统内部错误，请联系管理员',
  DATABASE_ERROR: '数据库操作失败',
  SERVICE_UNAVAILABLE: '服务暂时不可用，请稍后重试',
};

/**
 * 获取友好的错误消息
 */
export const getFriendlyErrorMessage = (error: any): string => {
  // 如果是字符串，直接返回
  if (typeof error === 'string') {
    return error;
  }

  // 如果是AxiosError
  if (error.isAxiosError) {
    const axiosError = error as AxiosError<ApiError>;

    // 网络错误
    if (!axiosError.response) {
      return errorMessageMap['NETWORK_ERROR'] ?? '网络连接失败，请检查网络设置';
    }

    // 超时错误
    if (axiosError.code === 'ECONNABORTED') {
      return errorMessageMap['TIMEOUT_ERROR'] ?? '请求超时，请稍后重试';
    }

    // 从响应中获取错误信息
    const apiError = axiosError.response.data;
    if (apiError?.code) {
      const mappedMessage = errorMessageMap[apiError.code];
      if (mappedMessage) {
        return mappedMessage;
      }
    }

    if (apiError?.message) {
      return apiError.message;
    }

    // 根据HTTP状态码返回默认消息
    const status = axiosError.response.status;
    switch (status) {
      case 400:
        return '请求参数错误';
      case 401:
        return errorMessageMap['UNAUTHORIZED'] ?? '未授权，请重新登录';
      case 403:
        return errorMessageMap['FORBIDDEN'] ?? '没有权限执行此操作';
      case 404:
        return errorMessageMap['NOT_FOUND'] ?? '请求的资源不存在';
      case 429:
        return errorMessageMap['RATE_LIMIT_EXCEEDED'] ?? '操作过于频繁，请稍后再试';
      case 500:
        return errorMessageMap['INTERNAL_ERROR'] ?? '系统内部错误，请联系管理员';
      case 503:
        return errorMessageMap['SERVICE_UNAVAILABLE'] ?? '服务暂时不可用，请稍后重试';
      default:
        return `请求失败 (${status})`;
    }
  }

  // 如果有message属性
  if (error.message) {
    return error.message;
  }

  // 默认错误消息
  return '操作失败，请稍后重试';
};

/**
 * 处理错误并显示消息
 */
export const handleError = (
  error: any,
  options?: {
    showNotification?: boolean; // 是否显示通知（默认显示消息）
    customMessage?: string; // 自定义错误消息
    silent?: boolean; // 是否静默（不显示任何提示）
  }
): void => {
  if (options?.silent) {
    return;
  }

  const message = options?.customMessage || getFriendlyErrorMessage(error);

  // 记录错误到控制台（开发环境）
  if (import.meta.env.DEV) {
    console.error('Error handled:', error);
  }

  // 显示错误提示
  if (options?.showNotification) {
    notifyError('操作失败', message);
  } else {
    showError(message);
  }
};

/**
 * 创建错误处理器
 * 用于包装异步函数，自动处理错误
 */
export const withErrorHandler = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options?: {
    showNotification?: boolean;
    customMessage?: string;
    onError?: (error: any) => void;
  }
): T => {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error, {
        showNotification: options?.showNotification,
        customMessage: options?.customMessage,
      });

      if (options?.onError) {
        options.onError(error);
      }

      throw error;
    }
  }) as T;
};

/**
 * 验证错误处理
 * 用于表单验证错误
 */
export const handleValidationError = (errors: Record<string, string[]>): void => {
  const firstError = Object.values(errors)[0]?.[0];
  if (firstError) {
    showError(firstError);
  }
};

export default {
  getFriendlyErrorMessage,
  handleError,
  withErrorHandler,
  handleValidationError,
};
