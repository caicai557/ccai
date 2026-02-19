import type { ThemeConfig } from 'antd';

/**
 * Ant Design 主题配置
 */
export const lightTheme: ThemeConfig = {
  token: {
    colorPrimary: '#0d7a6f',
    colorSuccess: '#1f8b4d',
    colorWarning: '#b56a00',
    colorError: '#b42318',
    colorInfo: '#006d9c',
    borderRadius: 10,
    fontSize: 14,
    wireframe: false,
  },
  components: {
    Layout: {
      headerBg: '#0d3040',
      headerHeight: 64,
      headerPadding: '0 24px',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(13, 122, 111, 0.14)',
      itemSelectedColor: '#0d7a6f',
      itemHoverBg: 'rgba(13, 122, 111, 0.08)',
    },
    Card: {
      borderRadiusLG: 14,
    },
    Table: {
      headerBg: '#f2f7f7',
      headerColor: '#112a2a',
    },
  },
};

/**
 * 深色主题配置
 */
export const darkTheme: ThemeConfig = {
  token: {
    colorPrimary: '#34b5a6',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff7875',
    colorInfo: '#40a9ff',
    borderRadius: 10,
    fontSize: 14,
    wireframe: false,
  },
  algorithm: undefined, // 将在使用时设置为 theme.darkAlgorithm
  components: {
    Layout: {
      headerBg: '#0b1f2b',
      headerHeight: 64,
      headerPadding: '0 24px',
    },
    Menu: {
      itemSelectedBg: 'rgba(52, 181, 166, 0.2)',
      itemSelectedColor: '#7adccd',
      itemHoverBg: 'rgba(52, 181, 166, 0.12)',
    },
  },
};
