// 目标（群组/频道）相关类型定义
export interface Target {
  id: string;
  type: 'group' | 'channel';
  telegramId: string;
  title: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TargetInfo {
  id: string;
  title: string;
  memberCount?: number;
  description?: string;
}

export interface AddTargetRequest {
  type: 'group' | 'channel';
  identifier: string; // ID或用户名
}

export interface UpdateTargetRequest {
  enabled?: boolean;
}
