import { create } from 'zustand';
import { Target } from '../types/target';

/**
 * 目标状态接口
 */
interface TargetState {
  // 状态
  targets: Target[];
  selectedTargetId: string | null;
  loading: boolean;
  error: string | null;

  // 操作
  setTargets: (targets: Target[]) => void;
  addTarget: (target: Target) => void;
  updateTarget: (id: string, updates: Partial<Target>) => void;
  removeTarget: (id: string) => void;
  selectTarget: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

/**
 * 初始状态
 */
const initialState = {
  targets: [],
  selectedTargetId: null,
  loading: false,
  error: null,
};

/**
 * 目标状态管理
 */
export const useTargetStore = create<TargetState>((set) => ({
  ...initialState,

  setTargets: (targets) => set({ targets }),

  addTarget: (target) =>
    set((state) => ({
      targets: [...state.targets, target],
    })),

  updateTarget: (id, updates) =>
    set((state) => ({
      targets: state.targets.map((target) =>
        target.id === id ? { ...target, ...updates } : target
      ),
    })),

  removeTarget: (id) =>
    set((state) => ({
      targets: state.targets.filter((target) => target.id !== id),
      selectedTargetId: state.selectedTargetId === id ? null : state.selectedTargetId,
    })),

  selectTarget: (id) => set({ selectedTargetId: id }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  reset: () => set(initialState),
}));
