import { create } from 'zustand';

export interface LogMessage {
  level: 'info' | 'warn' | 'error';
  timestamp: string;
  accountId?: string;
  message: string;
  details?: any;
}

interface LogState {
  logs: LogMessage[];
  connected: boolean;
  addLog: (log: LogMessage) => void;
  clearLogs: () => void;
  setConnected: (connected: boolean) => void;
}

/**
 * 日志状态管理
 */
export const useLogStore = create<LogState>((set) => ({
  logs: [],
  connected: false,

  addLog: (log) =>
    set((state) => ({
      logs: [...state.logs, log].slice(-1000), // 保留最近1000条日志
    })),

  clearLogs: () => set({ logs: [] }),

  setConnected: (connected) => set({ connected }),
}));
