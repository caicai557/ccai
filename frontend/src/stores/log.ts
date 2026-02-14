import { create } from 'zustand';
import { LogMessage } from '../types/common';

/**
 * 日志状态接口
 */
interface LogState {
  // 状态
  logs: LogMessage[];
  maxLogs: number;
  loading: boolean;
  error: string | null;

  // 过滤器
  levelFilter: LogMessage['level'] | 'all';
  accountFilter: string | null;

  // 操作
  setLogs: (logs: LogMessage[]) => void;
  addLog: (log: LogMessage) => void;
  clearLogs: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLevelFilter: (level: LogMessage['level'] | 'all') => void;
  setAccountFilter: (accountId: string | null) => void;
  reset: () => void;

  // 获取过滤后的日志
  getFilteredLogs: () => LogMessage[];
}

/**
 * 初始状态
 */
const initialState = {
  logs: [],
  maxLogs: 1000, // 最多保留1000条日志
  loading: false,
  error: null,
  levelFilter: 'all' as const,
  accountFilter: null,
};

/**
 * 日志状态管理
 */
export const useLogStore = create<LogState>((set, get) => ({
  ...initialState,

  setLogs: (logs) => set({ logs }),

  addLog: (log) =>
    set((state) => {
      const newLogs = [log, ...state.logs];
      // 限制日志数量
      if (newLogs.length > state.maxLogs) {
        newLogs.splice(state.maxLogs);
      }
      return { logs: newLogs };
    }),

  clearLogs: () => set({ logs: [] }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  setLevelFilter: (level) => set({ levelFilter: level }),

  setAccountFilter: (accountId) => set({ accountFilter: accountId }),

  reset: () => set(initialState),

  getFilteredLogs: () => {
    const { logs, levelFilter, accountFilter } = get();
    return logs.filter((log) => {
      // 级别过滤
      if (levelFilter !== 'all' && log.level !== levelFilter) {
        return false;
      }
      // 账号过滤
      if (accountFilter && log.accountId !== accountFilter) {
        return false;
      }
      return true;
    });
  },
}));
