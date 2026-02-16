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

export interface AddTargetRequest {
  type: 'group' | 'channel';
  identifier: string; // ID或用户名
}

export interface UpdateTargetRequest {
  enabled?: boolean;
}

export interface DiscoveredTarget {
  type: 'group' | 'channel';
  telegramId: string;
  title: string;
  username?: string;
  inviteLink?: string;
}

export interface BatchAddTargetsResult {
  created: Target[];
  duplicated: Target[];
  failed: Array<{
    telegramId: string;
    title: string;
    reason: string;
  }>;
  summary: {
    created: number;
    duplicated: number;
    failed: number;
  };
}
