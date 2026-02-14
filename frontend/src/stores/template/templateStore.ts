import { create } from 'zustand';
import { Template } from '../../types/template';

interface TemplateState {
  templates: Template[];
  loading: boolean;
  error: string | null;
  setTemplates: (templates: Template[]) => void;
  addTemplate: (template: Template) => void;
  updateTemplate: (id: string, template: Partial<Template>) => void;
  removeTemplate: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

/**
 * 消息模板状态管理
 */
export const useTemplateStore = create<TemplateState>((set) => ({
  templates: [],
  loading: false,
  error: null,

  setTemplates: (templates) => set({ templates }),

  addTemplate: (template) =>
    set((state) => ({
      templates: [...state.templates, template],
    })),

  updateTemplate: (id, updatedTemplate) =>
    set((state) => ({
      templates: state.templates.map((template) =>
        template.id === id ? { ...template, ...updatedTemplate } : template
      ),
    })),

  removeTemplate: (id) =>
    set((state) => ({
      templates: state.templates.filter((template) => template.id !== id),
    })),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),
}));
