// 消息相关类型定义
export interface MessageHistory {
  id: string;
  accountId: string;
  targetId: string;
  type: 'group_message' | 'channel_comment';
  content: string;
  status: 'success' | 'failed';
  error?: string;
  sentAt: Date;
}

export interface MessageStats {
  todayTotal: number;
  todaySuccess: number;
  todayFailed: number;
  successRate: number;
}

export interface MessageQueryParams {
  page?: number;
  pageSize?: number;
  accountId?: string;
  targetId?: string;
  status?: 'success' | 'failed';
  startDate?: string;
  endDate?: string;
}
