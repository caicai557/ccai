// 任务相关类型定义
export type PrecheckPolicy = 'partial' | 'strict';

export type TargetAccessErrorCode =
  | 'TARGET_NOT_JOINED'
  | 'TARGET_JOIN_PENDING'
  | 'TARGET_PRIVATE_NO_INVITE'
  | 'TARGET_WRITE_FORBIDDEN'
  | 'TARGET_ACCESS_DENIED'
  | 'TARGET_JOIN_COOLDOWN'
  | 'TARGET_JOIN_FAILED'
  | 'CLIENT_NOT_READY'
  | 'UNKNOWN_ERROR';

export interface Task {
  id: string;
  name: string;
  type: 'send_message' | 'auto_comment';
  accountId: string;
  targetId: string;
  targetType: 'group' | 'channel';
  templateId: string;
  config: TaskConfig;
  status: 'stopped' | 'running';
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
  autoJoinEnabled?: boolean; // 是否启用自动加入目标
  precheckPolicy?: PrecheckPolicy; // 预检失败策略
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

export interface TaskReadyPair {
  accountId: string;
  targetId: string;
  telegramId: string;
}

export interface TaskBlockedPair {
  accountId: string;
  targetId: string;
  telegramId: string;
  code: TargetAccessErrorCode;
  message: string;
  autoJoinAttempted: boolean;
}

export interface TaskPrecheckSummary {
  policy: PrecheckPolicy;
  autoJoinEnabled: boolean;
  readyPairs: TaskReadyPair[];
  blockedPairs: TaskBlockedPair[];
  blockedReasons: Record<string, number>;
}

export interface TaskStartResult {
  message: string;
  precheck: TaskPrecheckSummary;
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
