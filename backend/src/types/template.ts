// 模板相关类型定义
export interface Template {
  id: string;
  category: 'group_message' | 'channel_comment';
  content: string;
  enabled: boolean;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTemplateDto {
  category: 'group_message' | 'channel_comment';
  content: string;
  weight?: number;
}

export interface UpdateTemplateDto {
  content?: string;
  enabled?: boolean;
  weight?: number;
}
