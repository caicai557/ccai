import { create } from 'zustand';
import { Template } from '../types/template';

/**
 * 模板状态接口
 */
interface TemplateState {
  // 状态
  templates: Template[];
  selectedTemplateId: string | null;
  loading: boolean;
  error: string | null;

  // 操作
  setTemplates: (templates: Template[]) => void;
  addTemplate: (template: Template) => void;
  updateTemplate: (id: string, updates: Partial<Template>) => void;
  removeTemplate: (id: string) => void;
  selectTemplate: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  // 过滤器
  getTemplatesByCategory: (category: Template['category']) => Template[];
  getEnabledTemplates: () => Template[];
}

/**
 * 初始状态
 */
const initialState = {
  templates: [],
  selectedTemplateId: null,
  loading: false,
  error: null,
};

/**
 * 模板状态管理
 */
export const useTemplateStore = create<TemplateState>((set, get) => ({
  ...initialState,

  setTemplates: (templates) => set({ templates }),

  addTemplate: (template) =>
    set((state) => ({
      templates: [...state.templates, template],
    })),

  updateTemplate: (id, updates) =>
    set((state) => ({
      templates: state.templates.map((template) =>
        template.id === id ? { ...template, ...updates } : template
      ),
    })),

  removeTemplate: (id) =>
    set((state) => ({
      templates: state.templates.filter((template) => template.id !== id),
      selectedTemplateId: state.selectedTemplateId === id ? null : state.selectedTemplateId,
    })),

  selectTemplate: (id) => set({ selectedTemplateId: id }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  reset: () => set(initialState),

  getTemplatesByCategory: (category) => {
    return get().templates.filter((template) => template.category === category);
  },

  getEnabledTemplates: () => {
    return get().templates.filter((template) => template.enabled);
  },
}));
