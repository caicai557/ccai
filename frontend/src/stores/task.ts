import { create } from 'zustand';
import { Task } from '../types/task';

/**
 * 任务状态接口
 */
interface TaskState {
  // 状态
  tasks: Task[];
  selectedTaskId: string | null;
  loading: boolean;
  error: string | null;

  // 操作
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  removeTask: (id: string) => void;
  selectTask: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  // 过滤器
  getTasksByStatus: (status: Task['status']) => Task[];
  getTasksByType: (type: Task['type']) => Task[];
  getRunningTasks: () => Task[];
}

/**
 * 初始状态
 */
const initialState = {
  tasks: [],
  selectedTaskId: null,
  loading: false,
  error: null,
};

/**
 * 任务状态管理
 */
export const useTaskStore = create<TaskState>((set, get) => ({
  ...initialState,

  setTasks: (tasks) => set({ tasks }),

  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, task],
    })),

  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...updates } : task)),
    })),

  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== id),
      selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
    })),

  selectTask: (id) => set({ selectedTaskId: id }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  reset: () => set(initialState),

  getTasksByStatus: (status) => {
    return get().tasks.filter((task) => task.status === status);
  },

  getTasksByType: (type) => {
    return get().tasks.filter((task) => task.type === type);
  },

  getRunningTasks: () => {
    return get().tasks.filter((task) => task.status === 'running');
  },
}));
