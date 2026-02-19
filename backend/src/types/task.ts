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
  dispatchState?: TaskDispatchState; // 群发轮换状态（内部持久化）
  maxConsecutiveFailures?: number; // 连续失败阈值（默认5）
  timeRange?: {
    start: string; // HH:mm
    end: string; // HH:mm
  };
  commentProbability?: number; // 评论概率（0-1）
  retryOnError?: boolean; // 失败时是否重试
  maxRetries?: number; // 最大重试次数（默认3次）
  autoJoinEnabled?: boolean; // 是否启用自动加入目标（默认true）
  precheckPolicy?: PrecheckPolicy; // 预检失败策略（默认partial）
}

export interface TaskDispatchState {
  targetCursor: number;
  accountCursor: number;
  consecutiveFailures: number;
  updatedAt: string;
}

export interface CreateTaskDto {
  type: 'group_posting' | 'channel_monitoring';
  accountIds: string[];
  targetIds: string[];
  config: TaskConfig;
  priority?: number; // 优先级（1-10，默认5）
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
  started: boolean;
  message: string;
  precheck: TaskPrecheckSummary;
}
