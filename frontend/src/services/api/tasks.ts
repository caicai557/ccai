import { get, post, put, del } from './client';
import type { Task, TaskConfig, TaskPrecheckSummary, TaskStartResult } from '../../types/task';

/**
 * 任务执行历史
 */
export interface TaskExecution {
  id: string;
  taskId: string;
  executedAt: string;
  success: boolean;
  messageContent?: string;
  errorMessage?: string;
  targetMessageId?: string;
}

interface BackendTask {
  id: string;
  type: 'group_posting' | 'channel_monitoring';
  accountIds: string[];
  targetIds: string[];
  config: {
    interval?: number;
    randomDelay?: number;
    commentProbability?: number;
    retryOnError?: boolean;
    maxRetries?: number;
    autoJoinEnabled?: boolean;
    precheckPolicy?: 'partial' | 'strict';
    [key: string]: any;
  };
  status: 'running' | 'stopped';
  priority: number;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface BackendTaskStats {
  executionCount?: number;
  successCount?: number;
  failureCount?: number;
  lastExecutedAt?: string;
  lastExecutionTime?: string;
}

const toFrontendTask = (task: BackendTask, stats?: BackendTaskStats): Task => {
  const executionCount = stats?.executionCount ?? 0;
  const failureCount = stats?.failureCount ?? 0;
  const successCount = stats?.successCount ?? Math.max(executionCount - failureCount, 0);

  return {
    id: task.id,
    name: task.config?.['name'] || `任务-${task.id.slice(-6)}`,
    type: task.type === 'group_posting' ? 'send_message' : 'auto_comment',
    accountId: task.accountIds[0] || '',
    targetId: task.targetIds[0] || '',
    targetType: task.type === 'group_posting' ? 'group' : 'channel',
    templateId: task.config?.['templateId'] || '',
    config: {
      interval: task.type === 'group_posting' ? task.config?.interval : undefined,
      commentProbability: task.config?.commentProbability,
      minDelay: task.config?.randomDelay,
      maxDelay: task.config?.randomDelay,
      retryOnError: task.config?.retryOnError,
      maxRetries: task.config?.maxRetries,
      autoJoinEnabled: task.config?.autoJoinEnabled,
      precheckPolicy: task.config?.precheckPolicy,
    },
    status: task.status,
    priority: task.priority,
    createdAt: new Date(task.createdAt),
    lastExecutedAt: stats?.lastExecutedAt
      ? new Date(stats.lastExecutedAt)
      : stats?.lastExecutionTime
        ? new Date(stats.lastExecutionTime)
        : undefined,
    nextExecutionAt: task.nextRunAt ? new Date(task.nextRunAt) : undefined,
    successCount,
    failureCount,
  };
};

/**
 * 任务 API 服务
 */
export const tasksApi = {
  /**
   * 获取所有任务
   */
  getAll: (): Promise<Task[]> => {
    return get<{ tasks: BackendTask[]; total: number }>('/api/tasks').then((res) =>
      res.tasks.map((task) => toFrontendTask(task))
    );
  },

  /**
   * 获取任务详情
   */
  getById: (id: string): Promise<Task> => {
    return get<{ task: BackendTask; stats?: BackendTaskStats }>(`/api/tasks/${id}`).then((res) =>
      toFrontendTask(res.task, res.stats)
    );
  },

  /**
   * 创建任务
   */
  create: (data: {
    name: string;
    type: 'send_message' | 'auto_comment';
    accountId: string;
    targetId: string;
    targetType: 'group' | 'channel';
    templateId: string;
    config: TaskConfig;
    priority?: number;
  }): Promise<Task> => {
    const payload = {
      name: data.name,
      type: data.type === 'send_message' ? 'group_posting' : 'channel_monitoring',
      accountIds: [data.accountId],
      targetIds: [data.targetId],
      priority: data.priority,
      config: {
        interval: data.config?.interval ?? 10,
        commentProbability: data.config?.commentProbability,
        randomDelay: data.config?.maxDelay ?? data.config?.minDelay ?? 1,
        retryOnError: data.config?.retryOnError,
        maxRetries: data.config?.maxRetries,
        autoJoinEnabled: data.config?.autoJoinEnabled ?? true,
        precheckPolicy: data.config?.precheckPolicy ?? 'partial',
        name: data.name,
        targetType: data.targetType,
        templateId: data.templateId,
      },
    };

    return post<{ task: BackendTask; message: string }>('/api/tasks', payload).then((res) =>
      toFrontendTask(res.task)
    );
  },

  /**
   * 更新任务
   */
  update: (
    id: string,
    data: { config?: Partial<TaskConfig>; priority?: number }
  ): Promise<Task> => {
    const payload = {
      priority: data.priority,
      config: data.config
        ? {
            ...data.config,
            randomDelay: data.config?.maxDelay ?? data.config?.minDelay,
            autoJoinEnabled: data.config?.autoJoinEnabled,
            precheckPolicy: data.config?.precheckPolicy,
          }
        : undefined,
    };

    return put<{ task: BackendTask; message: string }>(`/api/tasks/${id}`, payload).then((res) =>
      toFrontendTask(res.task)
    );
  },

  /**
   * 删除任务
   */
  delete: (id: string): Promise<void> => {
    return del<{ message: string }>(`/api/tasks/${id}`).then(() => undefined);
  },

  /**
   * 启动任务
   */
  start: (id: string): Promise<TaskStartResult> => {
    return post<{ message: string; precheck: TaskPrecheckSummary }>(`/api/tasks/${id}/start`).then(
      (res) => ({
        message: res.message,
        precheck: res.precheck,
      })
    );
  },

  /**
   * 停止任务
   */
  stop: (id: string): Promise<void> => {
    return post<{ message: string }>(`/api/tasks/${id}/stop`).then(() => undefined);
  },

  /**
   * 暂停任务
   */
  pause: (id: string): Promise<void> => {
    return post<{ message: string }>(`/api/tasks/${id}/pause`).then(() => undefined);
  },

  /**
   * 获取任务执行历史
   */
  getHistory: (id: string, limit: number = 50): Promise<TaskExecution[]> => {
    return get<{ history: TaskExecution[]; total: number }>(`/api/tasks/${id}/history`, {
      limit,
    }).then((res) => res.history);
  },

  /**
   * 按状态获取任务
   */
  getByStatus: (status: 'stopped' | 'running'): Promise<Task[]> => {
    return get<{ tasks: BackendTask[]; total: number }>('/api/tasks', {
      status,
    }).then((res) => res.tasks.map((task) => toFrontendTask(task)));
  },
};
