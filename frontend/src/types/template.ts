// 模板相关类型定义
export interface Template {
  id: string;
  name?: string; // 可选，因为后端可能还没有这个字段
  category: 'group_message' | 'channel_comment';
  content?: string; // 单个内容（旧版）
  contents?: string[]; // 内容列表（新版）
  variables?: TemplateVariable[];
  enabled?: boolean;
  weight?: number;
  createdAt: Date;
  updatedAt: Date;
  usageCount?: number;
}

export interface TemplateVariable {
  name: string;
  type: 'time' | 'date' | 'random' | 'custom';
  format?: string;
}

export interface CreateTemplateRequest {
  name?: string;
  category: 'group_message' | 'channel_comment';
  content?: string;
  contents?: string[];
  variables?: TemplateVariable[];
  weight?: number;
}

export interface UpdateTemplateRequest {
  name?: string;
  content?: string;
  contents?: string[];
  variables?: TemplateVariable[];
  enabled?: boolean;
  weight?: number;
}

export interface TemplatePreviewRequest {
  templateId: string;
  variables?: Record<string, any>;
}
