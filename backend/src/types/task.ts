// 任务相关类型定义
export interface Task {
  id: string;
  type: 'group_posting' | 'channel_monitoring';
  accountIds: string[];
  targetIds: string[];
  config: TaskConfig;
  status: 'running' | 'stopped';
  priority: number; // 优先级（1-10，数字越大优先级越高）
  nextRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskConfig {
  interval: number; // 间隔（分钟）
  randomDelay: number; // 随机延迟（分钟）
  timeRange?: {
    start: string; // HH:mm
    end: string; // HH:mm
  };
  commentProbability?: number; // 评论概率（0-1）
  retryOnError?: boolean; // 失败时是否重试
  maxRetries?: number; // 最大重试次数（默认3次）
}

export interface CreateTaskDto {
  type: 'group_posting' | 'channel_monitoring';
  accountIds: string[];
  targetIds: string[];
  config: TaskConfig;
  priority?: number; // 优先级（1-10，默认5）
}
