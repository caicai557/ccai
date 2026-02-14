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

export interface MessageResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

export interface MessageTask {
  accountId: string;
  targetId: string;
  content: string;
  type: 'group_message' | 'channel_comment';
}

export interface BatchResult {
  total: number;
  success: number;
  failed: number;
  results: MessageResult[];
}
