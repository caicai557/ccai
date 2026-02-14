import { get } from './client';
import type { DashboardStats } from '../../types/common';

/**
 * 账号统计数据
 */
export interface AccountStats {
  accountId: string;
  phoneNumber: string;
  totalMessages: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  healthScore: number;
  lastActiveAt: string;
}

/**
 * 任务统计数据
 */
export interface TaskStats {
  taskId: string;
  name: string;
  type: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  lastExecutedAt?: string;
  nextExecutionAt?: string;
}

/**
 * 统计 API 服务
 */
export const statsApi = {
  /**
   * 获取仪表板统计数据
   */
  getDashboard: (): Promise<DashboardStats> => {
    return get<{
      accounts: { total: number; online: number };
      tasks: { total: number; running: number };
      executions: { total: number; successful: number; failed: number };
      logs: { total: number };
    }>('/api/stats/dashboard').then((res) => {
      const todaySuccessRate =
        res.executions.total > 0 ? res.executions.successful / res.executions.total : 0;

      return {
        totalAccounts: res.accounts.total,
        onlineAccounts: res.accounts.online,
        totalTargets: 0,
        activeTargets: 0,
        runningTasks: res.tasks.running,
        todayMessages: res.executions.total,
        todaySuccessRate,
      };
    });
  },

  /**
   * 获取账号统计
   */
  getAccounts: (): Promise<AccountStats[]> => {
    return get<{
      accounts: Array<{
        id: string;
        phoneNumber: string;
        healthScore?: number;
        lastActiveAt?: string;
      }>;
    }>('/api/stats/accounts').then((res) =>
      (res.accounts || []).map((account) => ({
        accountId: account.id,
        phoneNumber: account.phoneNumber,
        totalMessages: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        healthScore: account.healthScore ?? 0,
        lastActiveAt: account.lastActiveAt || new Date().toISOString(),
      }))
    );
  },

  /**
   * 获取单个账号统计
   */
  getAccountById: (accountId: string): Promise<AccountStats> => {
    return statsApi.getAccounts().then((accounts) => {
      const account = accounts.find((item) => item.accountId === accountId);
      if (!account) {
        throw new Error('账号统计不存在');
      }
      return account;
    });
  },

  /**
   * 获取任务统计
   */
  getTasks: (): Promise<TaskStats[]> => {
    return get<{
      tasks: Array<{
        id: string;
        type: string;
        recentStats: { total: number; successful: number; failed: number };
      }>;
    }>('/api/stats/tasks').then((res) =>
      (res.tasks || []).map((task) => {
        const totalExecutions = task.recentStats?.total || 0;
        const successCount = task.recentStats?.successful || 0;
        const failureCount = task.recentStats?.failed || 0;
        const successRate = totalExecutions > 0 ? successCount / totalExecutions : 0;

        return {
          taskId: task.id,
          name: `任务-${task.id.slice(-6)}`,
          type: task.type,
          totalExecutions,
          successCount,
          failureCount,
          successRate,
          lastExecutedAt: undefined,
          nextExecutionAt: undefined,
        };
      })
    );
  },

  /**
   * 获取单个任务统计
   */
  getTaskById: (taskId: string): Promise<TaskStats> => {
    return statsApi.getTasks().then((tasks) => {
      const task = tasks.find((item) => item.taskId === taskId);
      if (!task) {
        throw new Error('任务统计不存在');
      }
      return task;
    });
  },

  /**
   * 获取时间范围内的消息统计
   */
  getMessageStats: (params: {
    startDate?: string;
    endDate?: string;
    accountId?: string;
  }): Promise<{
    totalMessages: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    messagesByDay: Array<{ date: string; count: number }>;
  }> => {
    return get<{
      total: number;
      successful: number;
      failed: number;
      byDate: Record<string, { total: number; successful: number; failed: number }>;
    }>('/api/stats/executions', params).then((res) => {
      const successRate = res.total > 0 ? res.successful / res.total : 0;
      const messagesByDay = Object.entries(res.byDate || {}).map(([date, value]) => ({
        date,
        count: value.total,
      }));

      return {
        totalMessages: res.total,
        successCount: res.successful,
        failureCount: res.failed,
        successRate,
        messagesByDay,
      };
    });
  },
};
