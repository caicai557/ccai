/**
 * 主题管理Hook
 */
import { useState, useEffect } from 'react';

const THEME_STORAGE_KEY = 'telegram-manager-theme';

export type ThemeMode = 'light' | 'dark';

/**
 * 主题管理Hook
 */
export const useTheme = () => {
  // 从localStorage读取主题设置，默认为浅色主题
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return (savedTheme as ThemeMode) || 'light';
  });

  // 当主题变化时，保存到localStorage
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  // 切换主题
  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // 设置主题
  const setThemeMode = (mode: ThemeMode) => {
    setTheme(mode);
  };

  return {
    theme,
    isDarkMode: theme === 'dark',
    toggleTheme,
    setThemeMode,
  };
};
