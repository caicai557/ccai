/**
 * 配置管理API服务
 */
import { get, put, post } from './client';
import type { SystemConfig, ConfigUpdateRequest, ConfigResetRequest } from '../../types/config';

/**
 * 获取系统配置
 */
export const getConfig = (): Promise<SystemConfig> => {
  return get<{ config: SystemConfig }>('/api/config').then((res) => res.config);
};

/**
 * 更新系统配置
 */
export const updateConfig = (config: ConfigUpdateRequest): Promise<SystemConfig> => {
  return put<{ config: SystemConfig; message: string }>('/api/config', config).then(
    (res) => res.config
  );
};

/**
 * 重置系统配置
 */
export const resetConfig = (request?: ConfigResetRequest): Promise<SystemConfig> => {
  return post<{ config: SystemConfig; message: string }>('/api/config/reset', request).then(
    (res) => res.config
  );
};

/**
 * 获取速率限制配置
 */
export const getRateLimitConfig = (): Promise<SystemConfig['rateLimit']> => {
  return get<{ config: SystemConfig['rateLimit'] }>('/api/config/rateLimit').then(
    (res) => res.config
  );
};

/**
 * 更新速率限制配置
 */
export const updateRateLimitConfig = (
  config: Partial<SystemConfig['rateLimit']>
): Promise<SystemConfig['rateLimit']> => {
  return put<{ config: SystemConfig['rateLimit']; message: string }>(
    '/api/config/rateLimit',
    config
  ).then((res) => res.config);
};

/**
 * 获取日志配置
 */
export const getLogConfig = (): Promise<SystemConfig['log']> => {
  return get<{ config: SystemConfig['log'] }>('/api/config/log').then((res) => res.config);
};

/**
 * 更新日志配置
 */
export const updateLogConfig = (
  config: Partial<SystemConfig['log']>
): Promise<SystemConfig['log']> => {
  return put<{ config: SystemConfig['log']; message: string }>('/api/config/log', config).then(
    (res) => res.config
  );
};
