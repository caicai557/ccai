import { get, post, del, download, upload, apiClient } from './client';
import type {
  Account,
  AccountPoolStatus,
  AccountProfileBatchJob,
  AccountProfileBatchJobItem,
  AccountProfileBatchJobStatus,
  AccountProfileThrottlePreset,
} from '../../types/account';

/**
 * 账号 API 服务
 */
export const accountsApi = {
  /**
   * 获取所有账号
   */
  getAll: (params?: { poolStatus?: AccountPoolStatus }): Promise<Account[]> => {
    return get<{ accounts: Account[]; total: number }>('/api/accounts', params).then(
      (res) => res.accounts
    );
  },

  /**
   * 获取账号详情
   */
  getById: (id: string): Promise<Account> => {
    return get<{ account: Account }>(`/api/accounts/${id}`).then((res) => res.account);
  },

  /**
   * 通过手机号添加账号（发送验证码）
   */
  addByPhone: (phoneNumber: string): Promise<{ accountId: string; phoneCodeHash: string }> => {
    return post<{ accountId: string; phoneCodeHash: string; message: string }>(
      '/api/accounts/phone',
      {
        phoneNumber,
      }
    );
  },

  /**
   * 验证验证码
   */
  verifyCode: (accountId: string, code: string, phoneCodeHash: string): Promise<Account> => {
    return post<{ account: Account; message: string }>('/api/accounts/verify', {
      accountId,
      code,
      phoneCodeHash,
    }).then((res) => res.account);
  },

  /**
   * 验证两步验证密码
   */
  verifyPassword: (accountId: string, password: string): Promise<Account> => {
    return post<{ account: Account; message: string }>('/api/accounts/verify-password', {
      accountId,
      password,
    }).then((res) => res.account);
  },

  /**
   * 通过会话文件导入账号
   */
  importSession: (file: File): Promise<Account> => {
    return upload<{ account: Account; message: string }>(
      '/api/accounts/import',
      file,
      undefined,
      'sessionFile'
    ).then((res) => res.account);
  },

  /**
   * 导出账号会话文件
   */
  exportSession: (id: string): Promise<void> => {
    return download(`/api/accounts/${id}/export`, `account-${id}.session`);
  },

  /**
   * 删除账号
   */
  delete: (id: string): Promise<void> => {
    return del<{ message: string }>(`/api/accounts/${id}`).then(() => undefined);
  },

  /**
   * 检查账号状态
   */
  checkStatus: (id: string): Promise<{ status: string; healthScore: number }> => {
    return get<{ status: string; isAuthorized: boolean }>(`/api/accounts/${id}/status`).then(
      (res) => ({
        status: res.status,
        healthScore: res.isAuthorized ? 100 : 0,
      })
    );
  },

  /**
   * 手动更新账号池状态
   */
  updatePoolStatus: (id: string, poolStatus: AccountPoolStatus): Promise<Account> => {
    return post<{ account: Account; message: string }>(`/api/accounts/${id}/pool-status`, {
      poolStatus,
    }).then((res) => res.account);
  },

  createProfileBatchJob: (payload: {
    accountIds: string[];
    firstNameTemplate?: string;
    lastNameTemplate?: string;
    bioTemplate?: string;
    avatarFiles?: File[];
    throttlePreset?: AccountProfileThrottlePreset;
    retryLimit?: number;
  }): Promise<AccountProfileBatchJob> => {
    const formData = new FormData();
    payload.accountIds.forEach((accountId) => {
      formData.append('accountIds', accountId);
    });
    if (payload.firstNameTemplate) {
      formData.append('firstNameTemplate', payload.firstNameTemplate);
    }
    if (payload.lastNameTemplate) {
      formData.append('lastNameTemplate', payload.lastNameTemplate);
    }
    if (payload.bioTemplate) {
      formData.append('bioTemplate', payload.bioTemplate);
    }
    if (payload.throttlePreset) {
      formData.append('throttlePreset', payload.throttlePreset);
    }
    if (payload.retryLimit !== undefined) {
      formData.append('retryLimit', String(payload.retryLimit));
    }
    payload.avatarFiles?.forEach((file) => {
      formData.append('avatarFiles', file);
    });

    return apiClient
      .post<{
        success: boolean;
        data: { job: AccountProfileBatchJob };
      }>('/api/accounts/profile-batch/jobs', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      .then((res) => res.data.data.job);
  },

  listProfileBatchJobs: (params?: {
    status?: AccountProfileBatchJobStatus;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: AccountProfileBatchJob[];
    total: number;
    page: number;
    pageSize: number;
  }> => {
    return get<{
      items: AccountProfileBatchJob[];
      total: number;
      page: number;
      pageSize: number;
    }>('/api/accounts/profile-batch/jobs', params);
  },

  getProfileBatchJobDetail: (id: string): Promise<{
    job: AccountProfileBatchJob;
    items: AccountProfileBatchJobItem[];
  }> => {
    return get<{
      job: AccountProfileBatchJob;
      items: AccountProfileBatchJobItem[];
    }>(`/api/accounts/profile-batch/jobs/${id}`);
  },

  cancelProfileBatchJob: (id: string): Promise<AccountProfileBatchJob> => {
    return post<{ job: AccountProfileBatchJob; message: string }>(
      `/api/accounts/profile-batch/jobs/${id}/cancel`
    ).then((res) => res.job);
  },
};
