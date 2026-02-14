// 任务相关类型定义
export interface Task {
  id: string;
  name: string;
  type: 'send_message' | 'auto_comment';
  accountId: string;
  targetId: string;
  targetType: 'group' | 'channel';
  templateId: string;
  config: TaskConfig;
  status: 'stopped' | 'running' | 'paused' | 'error';
  priority: number; // 优先级（1-10）
  createdAt: Date;
  lastExecutedAt?: Date;
  nextExecutionAt?: Date;
  successCount: number;
  failureCount: number;
  errorMessage?: string;
}

export interface TaskConfig {
  interval?: number; // 发送间隔（分钟），仅用于send_message
  commentProbability?: number; // 评论概率（0-1），仅用于auto_comment
  minDelay?: number; // 最小延迟（秒）
  maxDelay?: number; // 最大延迟（秒）
  retryOnError?: boolean; // 失败时是否重试
  maxRetries?: number; // 最大重试次数
}

export interface CreateTaskRequest {
  name: string;
  type: 'send_message' | 'auto_comment';
  accountId: string;
  targetId: string;
  targetType: 'group' | 'channel';
  templateId: string;
  config: TaskConfig;
  priority?: number;
}

export interface UpdateTaskRequest {
  config?: Partial<TaskConfig>;
  priority?: number;
}

export interface TaskUpdate {
  taskId: string;
  status: string;
  nextExecutionAt?: string;
  lastResult?: any;
}

export interface TaskExecution {
  id: string;
  taskId: string;
  executedAt: string;
  success: boolean;
  messageContent?: string;
  errorMessage?: string;
  targetMessageId?: string;
}
