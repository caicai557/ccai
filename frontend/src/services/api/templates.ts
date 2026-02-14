import { get, post, put, del } from './client';
import type { Template } from '../../types/template';

const normalizeCategory = (category: string): 'group_message' | 'channel_comment' => {
  if (category === 'message') return 'group_message';
  if (category === 'comment') return 'channel_comment';
  return category as 'group_message' | 'channel_comment';
};

const toFrontendTemplate = (template: any): Template => {
  return {
    ...template,
    category: normalizeCategory(template.category),
    name: template.name || `模板-${String(template.id).slice(-6)}`,
    content: template.content,
    contents: template.content ? [template.content] : [],
    enabled: template.enabled !== false,
    usageCount: template.usageCount ?? 0,
  };
};

/**
 * 模板 API 服务
 */
export const templatesApi = {
  /**
   * 获取所有模板
   */
  getAll: (): Promise<Template[]> => {
    return get<{ templates: any[]; total: number }>('/api/templates').then((res) =>
      res.templates.map((template) => toFrontendTemplate(template))
    );
  },

  /**
   * 获取模板详情
   */
  getById: (id: string): Promise<Template> => {
    return get<{ template: any }>(`/api/templates/${id}`).then((res) =>
      toFrontendTemplate(res.template)
    );
  },

  /**
   * 创建模板
   */
  create: (data: {
    name: string;
    category: 'message' | 'comment';
    contents: string[];
    variables?: any[];
  }): Promise<Template> => {
    const payload = {
      category: normalizeCategory(data.category),
      content: data.contents?.[0] || '',
      weight: 1,
    };
    return post<{ template: any; message: string }>('/api/templates', payload).then((res) =>
      toFrontendTemplate(res.template)
    );
  },

  /**
   * 更新模板
   */
  update: (
    id: string,
    data: {
      name?: string;
      category?: 'message' | 'comment' | 'group_message' | 'channel_comment';
      content?: string;
      contents?: string[];
      variables?: any[];
      enabled?: boolean;
      weight?: number;
    }
  ): Promise<Template> => {
    const payload = {
      category: data.category ? normalizeCategory(data.category) : undefined,
      content: data.contents?.[0] ?? data.content,
      enabled: data.enabled,
      weight: data.weight,
    };
    return put<{ template: any; message: string }>(`/api/templates/${id}`, payload).then((res) =>
      toFrontendTemplate(res.template)
    );
  },

  /**
   * 删除模板
   */
  delete: (id: string): Promise<void> => {
    return del<{ message: string }>(`/api/templates/${id}`).then(() => undefined);
  },

  /**
   * 预览模板
   */
  preview: (id: string): Promise<string[]> => {
    return get<{ previews: string[]; total: number }>(`/api/templates/${id}/preview`).then(
      (res) => res.previews
    );
  },

  /**
   * 按分类获取模板
   */
  getByCategory: (category: 'message' | 'comment'): Promise<Template[]> => {
    return get<{ templates: any[]; total: number }>('/api/templates', {
      category: normalizeCategory(category),
    }).then((res) => res.templates.map((template) => toFrontendTemplate(template)));
  },
};
