/**
 * 配置状态管理
 */
import { create } from 'zustand';
import type { SystemConfig } from '../types/config';
import * as configApi from '../services/api/config';
import { message } from 'antd';

interface ConfigState {
  config: SystemConfig | null;
  loading: boolean;
  error: string | null;

  // 操作方法
  fetchConfig: () => Promise<void>;
  updateConfig: (config: Partial<SystemConfig>) => Promise<void>;
  resetConfig: (key?: keyof SystemConfig) => Promise<void>;
  updateRateLimitConfig: (config: Partial<SystemConfig['rateLimit']>) => Promise<void>;
  updateLogConfig: (config: Partial<SystemConfig['log']>) => Promise<void>;
}

/**
 * 配置状态管理
 */
export const useConfigStore = create<ConfigState>((set) => ({
  config: null,
  loading: false,
  error: null,

  /**
   * 获取配置
   */
  fetchConfig: async () => {
    set({ loading: true, error: null });
    try {
      const config = await configApi.getConfig();
      set({ config, loading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '获取配置失败';
      set({ error: errorMessage, loading: false });
    }
  },

  /**
   * 更新配置
   */
  updateConfig: async (configUpdate: Partial<SystemConfig>) => {
    set({ loading: true, error: null });
    try {
      const config = await configApi.updateConfig(configUpdate);
      set({ config, loading: false });
      message.success('配置更新成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '更新配置失败';
      set({ error: errorMessage, loading: false });
      throw error;
    }
  },

  /**
   * 重置配置
   */
  resetConfig: async (key?: keyof SystemConfig) => {
    set({ loading: true, error: null });
    try {
      const config = await configApi.resetConfig(key ? { key } : undefined);
      set({ config, loading: false });
      message.success(key ? `配置项 ${key} 已重置` : '所有配置已重置');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '重置配置失败';
      set({ error: errorMessage, loading: false });
      throw error;
    }
  },

  /**
   * 更新速率限制配置
   */
  updateRateLimitConfig: async (rateLimitConfig: Partial<SystemConfig['rateLimit']>) => {
    set({ loading: true, error: null });
    try {
      const rateLimit = await configApi.updateRateLimitConfig(rateLimitConfig);
      set((state) => ({
        config: state.config ? { ...state.config, rateLimit } : null,
        loading: false,
      }));
      message.success('速率限制配置更新成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '更新速率限制配置失败';
      set({ error: errorMessage, loading: false });
      throw error;
    }
  },

  /**
   * 更新日志配置
   */
  updateLogConfig: async (logConfig: Partial<SystemConfig['log']>) => {
    set({ loading: true, error: null });
    try {
      const log = await configApi.updateLogConfig(logConfig);
      set((state) => ({
        config: state.config ? { ...state.config, log } : null,
        loading: false,
      }));
      message.success('日志配置更新成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '更新日志配置失败';
      set({ error: errorMessage, loading: false });
      throw error;
    }
  },
}));
