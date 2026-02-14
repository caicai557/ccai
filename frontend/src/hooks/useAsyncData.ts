import { useState, useEffect, useCallback } from 'react';
import { handleError } from '../utils/errorHandler';

interface UseAsyncDataOptions<T> {
  initialData?: T;
  onSuccess?: (data: T) => void;
  onError?: (error: any) => void;
  immediate?: boolean; // 是否立即执行
}

interface UseAsyncDataResult<T> {
  data: T | undefined;
  loading: boolean;
  error: any;
  execute: () => Promise<void>;
  reset: () => void;
}

/**
 * 异步数据加载Hook
 * 提供统一的加载状态管理
 */
export const useAsyncData = <T = any>(
  asyncFunction: () => Promise<T>,
  options: UseAsyncDataOptions<T> = {}
): UseAsyncDataResult<T> => {
  const { initialData, onSuccess, onError, immediate = true } = options;

  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<any>(null);

  const execute = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await asyncFunction();
      setData(result);

      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err) {
      setError(err);
      handleError(err);

      if (onError) {
        onError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [asyncFunction, onSuccess, onError]);

  const reset = useCallback(() => {
    setData(initialData);
    setLoading(false);
    setError(null);
  }, [initialData]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, []);

  return {
    data,
    loading,
    error,
    execute,
    reset,
  };
};

/**
 * 异步操作Hook（不返回数据）
 * 用于执行操作而不需要保存结果
 */
export const useAsyncAction = <T extends any[]>(
  asyncFunction: (...args: T) => Promise<void>,
  options: {
    onSuccess?: () => void;
    onError?: (error: any) => void;
  } = {}
): {
  loading: boolean;
  error: any;
  execute: (...args: T) => Promise<void>;
} => {
  const { onSuccess, onError } = options;

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<any>(null);

  const execute = useCallback(
    async (...args: T) => {
      try {
        setLoading(true);
        setError(null);
        await asyncFunction(...args);

        if (onSuccess) {
          onSuccess();
        }
      } catch (err) {
        setError(err);
        handleError(err);

        if (onError) {
          onError(err);
        }
      } finally {
        setLoading(false);
      }
    },
    [asyncFunction, onSuccess, onError]
  );

  return {
    loading,
    error,
    execute,
  };
};

export default useAsyncData;
