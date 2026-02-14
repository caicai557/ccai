import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { API_BASE_URL } from '../../config';
import { handleError } from '../../utils/errorHandler';

/**
 * API 响应数据结构
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
    [key: string]: any;
  };
  message?: string;
  code?: string;
}

/**
 * API 错误响应结构
 */
export interface ApiError {
  code: string;
  message: string;
  details?: any;
  retryAfter?: number;
}

/**
 * 创建 Axios 实例
 */
const createAxiosInstance = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // 请求拦截器
  instance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // 可以在这里添加认证 token
      // const token = localStorage.getItem('token');
      // if (token) {
      //   config.headers.Authorization = `Bearer ${token}`;
      // }

      return config;
    },
    (error: AxiosError) => {
      console.error('请求错误:', error);
      return Promise.reject(error);
    }
  );

  // 响应拦截器
  instance.interceptors.response.use(
    (response: AxiosResponse<ApiResponse>) => {
      // 如果响应包含 success 字段，检查是否成功
      if (response.data && typeof response.data.success === 'boolean') {
        if (!response.data.success) {
          const message = response.data.message || response.data.error?.message || '请求失败';
          const error = new Error(message);
          handleError(error, { silent: false });
          return Promise.reject(error);
        }
      }
      return response;
    },
    (error: AxiosError<ApiError>) => {
      // 使用统一的错误处理
      handleError(error, { silent: false });
      return Promise.reject(error);
    }
  );

  return instance;
};

/**
 * HTTP 客户端实例
 */
export const apiClient = createAxiosInstance();

/**
 * GET 请求
 */
export const get = <T = any>(url: string, params?: any): Promise<T> => {
  return apiClient.get<ApiResponse<T>>(url, { params }).then((res) => res.data.data as T);
};

/**
 * POST 请求
 */
export const post = <T = any>(url: string, data?: any): Promise<T> => {
  return apiClient.post<ApiResponse<T>>(url, data).then((res) => res.data.data as T);
};

/**
 * PUT 请求
 */
export const put = <T = any>(url: string, data?: any): Promise<T> => {
  return apiClient.put<ApiResponse<T>>(url, data).then((res) => res.data.data as T);
};

/**
 * DELETE 请求
 */
export const del = <T = any>(url: string): Promise<T> => {
  return apiClient.delete<ApiResponse<T>>(url).then((res) => res.data.data as T);
};

/**
 * 上传文件
 */
export const upload = <T = any>(
  url: string,
  file: File,
  onProgress?: (percent: number) => void,
  fieldName: string = 'file'
): Promise<T> => {
  const formData = new FormData();
  formData.append(fieldName, file);

  return apiClient
    .post<ApiResponse<T>>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    })
    .then((res) => res.data.data as T);
};

/**
 * 下载文件
 */
export const download = (url: string, filename?: string): Promise<void> => {
  return apiClient
    .get(url, {
      responseType: 'blob',
    })
    .then((response) => {
      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    });
};
