// 账号相关类型定义
export type AccountPoolStatus = 'ok' | 'error' | 'banned' | 'cooldown';

export interface Account {
  id: string;
  phoneNumber: string;
  session: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  addMethod?: 'phone' | 'session'; // 添加方式
  status: 'online' | 'offline' | 'restricted';
  poolStatus: AccountPoolStatus;
  poolStatusUpdatedAt: Date;
  healthScore?: number; // 健康度评分（0-100）
  lastActive: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountStatus {
  online: boolean;
  restricted: boolean;
  lastSeen?: Date;
}

export type AccountProfileBatchJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type AccountProfileBatchItemStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type AccountProfileThrottlePreset = 'conservative' | 'balanced' | 'fast';

export interface AccountProfileJobSummary {
  total: number;
  pending: number;
  running: number;
  success: number;
  failed: number;
  cancelled: number;
  skipped: number;
}

export interface AccountProfileBatchJob {
  id: string;
  status: AccountProfileBatchJobStatus;
  firstNameTemplate?: string;
  lastNameTemplate?: string;
  bioTemplate?: string;
  avatarFiles: string[];
  throttlePreset: AccountProfileThrottlePreset;
  retryLimit: number;
  summary: AccountProfileJobSummary;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountProfileBatchJobItem {
  id: string;
  jobId: string;
  accountId: string;
  accountPhoneNumber?: string;
  status: AccountProfileBatchItemStatus;
  itemIndex: number;
  attempt: number;
  maxAttempts: number;
  errorCode?: string;
  errorMessage?: string;
  appliedFirstName?: string;
  appliedLastName?: string;
  appliedBio?: string;
  avatarFile?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountProfileBatchJobDetail {
  job: AccountProfileBatchJob;
  items: AccountProfileBatchJobItem[];
}

export interface CreateAccountProfileBatchJobDto {
  accountIds: string[];
  firstNameTemplate?: string;
  lastNameTemplate?: string;
  bioTemplate?: string;
  throttlePreset?: AccountProfileThrottlePreset;
  retryLimit?: number;
}
