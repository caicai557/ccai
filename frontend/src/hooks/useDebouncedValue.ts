import { useEffect, useState } from 'react';

/**
 * 延迟更新值，减少输入过程中的频繁请求与重渲染。
 */
export const useDebouncedValue = <T>(value: T, delay: number = 300): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [delay, value]);

  return debouncedValue;
};

export default useDebouncedValue;
