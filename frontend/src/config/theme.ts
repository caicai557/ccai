import type { ThemeConfig } from 'antd';

/**
 * Ant Design 主题配置
 */
export const lightTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1890ff',
    borderRadius: 6,
    fontSize: 14,
  },
  components: {
    Layout: {
      headerBg: '#001529',
      headerHeight: 64,
      headerPadding: '0 24px',
    },
    Menu: {
      itemBg: 'transparent',
    },
  },
};

/**
 * 深色主题配置
 */
export const darkTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1890ff',
    borderRadius: 6,
    fontSize: 14,
  },
  algorithm: undefined, // 将在使用时设置为 theme.darkAlgorithm
  components: {
    Layout: {
      headerBg: '#141414',
      headerHeight: 64,
      headerPadding: '0 24px',
    },
  },
};
