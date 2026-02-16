// 目标（群组/频道）相关类型定义
export interface Target {
  id: string;
  type: 'group' | 'channel';
  telegramId: string;
  inviteLink?: string;
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

export interface DiscoveredTarget {
  type: 'group' | 'channel';
  telegramId: string;
  title: string;
  username?: string;
  inviteLink?: string;
}

export interface BatchAddTargetInput {
  type: 'group' | 'channel';
  telegramId: string;
  title: string;
  inviteLink?: string;
}

export interface BatchAddTargetResult {
  created: Target[];
  duplicated: Target[];
  failed: Array<{
    telegramId: string;
    title: string;
    reason: string;
  }>;
}
