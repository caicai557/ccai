import { get, post, put, del } from './client';
import type { BatchAddTargetsResult, DiscoveredTarget, Target } from '../../types/target';

/**
 * 目标（群组/频道）API 服务
 */
export const targetsApi = {
  /**
   * 获取所有目标
   */
  getAll: (): Promise<Target[]> => {
    return get<{ targets: Target[]; total: number }>('/api/targets').then((res) => res.targets);
  },

  /**
   * 获取目标详情
   */
  getById: (id: string): Promise<Target> => {
    return get<{ target: Target }>(`/api/targets/${id}`).then((res) => res.target);
  },

  /**
   * 添加目标
   */
  create: (data: {
    type: 'group' | 'channel';
    telegramId: string;
    inviteLink?: string;
    title: string;
  }): Promise<Target> => {
    return post<{ target: Target; message: string }>('/api/targets', data).then(
      (res) => res.target
    );
  },

  /**
   * 更新目标
   */
  update: (id: string, data: { enabled?: boolean; inviteLink?: string }): Promise<Target> => {
    return put<{ target: Target; message: string }>(`/api/targets/${id}`, data).then(
      (res) => res.target
    );
  },

  /**
   * 删除目标
   */
  delete: (id: string): Promise<void> => {
    return del(`/api/targets/${id}`);
  },

  /**
   * 搜索当前账号可用群组/频道
   */
  search: (params: {
    accountId: string;
    keyword?: string;
    limit?: number;
  }): Promise<DiscoveredTarget[]> => {
    return get<{ items: DiscoveredTarget[]; total: number }>('/api/targets/search', params).then(
      (res) => res.items
    );
  },

  /**
   * 批量添加目标
   */
  batchAdd: (items: DiscoveredTarget[]): Promise<BatchAddTargetsResult> => {
    return post<BatchAddTargetsResult>('/api/targets/batch-add', { items });
  },

  /**
   * 获取目标信息（从 Telegram）
   */
  getInfo: (identifier: string): Promise<{ title: string; memberCount?: number }> => {
    return get(`/api/targets/info`, { identifier });
  },
};
