// 通用类型定义
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LogMessage {
  level: 'info' | 'warn' | 'error';
  timestamp: string;
  accountId?: string;
  message: string;
  details?: any;
}

export interface HealthReport {
  accountId: string;
  healthScore: number;
  totalOperations: number;
  successRate: number;
  lastError?: string;
  isLimited: boolean;
}
