import { create } from 'zustand';
import { Target } from '../../types/target';

interface TargetState {
  targets: Target[];
  loading: boolean;
  error: string | null;
  setTargets: (targets: Target[]) => void;
  addTarget: (target: Target) => void;
  updateTarget: (id: string, target: Partial<Target>) => void;
  removeTarget: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

/**
 * 目标（群组/频道）状态管理
 */
export const useTargetStore = create<TargetState>((set) => ({
  targets: [],
  loading: false,
  error: null,

  setTargets: (targets) => set({ targets }),

  addTarget: (target) =>
    set((state) => ({
      targets: [...state.targets, target],
    })),

  updateTarget: (id, updatedTarget) =>
    set((state) => ({
      targets: state.targets.map((target) =>
        target.id === id ? { ...target, ...updatedTarget } : target
      ),
    })),

  removeTarget: (id) =>
    set((state) => ({
      targets: state.targets.filter((target) => target.id !== id),
    })),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),
}));
