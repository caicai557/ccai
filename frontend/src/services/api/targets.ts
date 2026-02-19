import { get, post, put, del } from './client';
import type { Target } from '../../types/target';

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
};
