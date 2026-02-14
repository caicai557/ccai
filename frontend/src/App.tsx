import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { Outlet } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';
import ErrorBoundary from './components/Common/ErrorBoundary';
import { lightTheme, darkTheme } from './config/theme';
import { useTheme } from './hooks/useTheme';

/**
 * 应用根组件
 */
function App() {
  const { isDarkMode, setThemeMode } = useTheme();

  // 主题配置
  const themeConfig = isDarkMode
    ? { ...darkTheme, algorithm: antdTheme.darkAlgorithm }
    : lightTheme;

  // 处理主题切换
  const handleThemeChange = (isDark: boolean) => {
    setThemeMode(isDark ? 'dark' : 'light');
  };

  return (
    <ErrorBoundary>
      <ConfigProvider locale={zhCN} theme={themeConfig}>
        <MainLayout isDarkMode={isDarkMode} onThemeChange={handleThemeChange}>
          <Outlet />
        </MainLayout>
      </ConfigProvider>
    </ErrorBoundary>
  );
}

export default App;
