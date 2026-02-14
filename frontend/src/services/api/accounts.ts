import { get, post, del, download, upload } from './client';
import type { Account } from '../../types/account';

/**
 * 账号 API 服务
 */
export const accountsApi = {
  /**
   * 获取所有账号
   */
  getAll: (): Promise<Account[]> => {
    return get<{ accounts: Account[]; total: number }>('/api/accounts').then((res) => res.accounts);
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
};
