import { Layout, Menu, theme, Switch, Drawer, Tooltip } from 'antd';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  UserOutlined,
  TeamOutlined,
  FileTextOutlined,
  ScheduleOutlined,
  FileSearchOutlined,
  BulbOutlined,
  SettingOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';

const { Header, Content, Sider } = Layout;

interface MainLayoutProps {
  children: React.ReactNode;
  isDarkMode?: boolean;
  onThemeChange?: (isDark: boolean) => void;
}

/**
 * 主布局组件
 */
const MainLayout: React.FC<MainLayoutProps> = ({ children, isDarkMode, onThemeChange }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // 菜单项配置
  const menuItems: MenuProps['items'] = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '仪表板',
    },
    {
      key: '/accounts',
      icon: <UserOutlined />,
      label: '账号管理',
    },
    {
      key: '/targets',
      icon: <TeamOutlined />,
      label: '群组/频道',
    },
    {
      key: '/templates',
      icon: <FileTextOutlined />,
      label: '消息模板',
    },
    {
      key: '/tasks',
      icon: <ScheduleOutlined />,
      label: '任务管理',
    },
    {
      key: '/logs',
      icon: <FileSearchOutlined />,
      label: '日志查看',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
  ];

  // 处理菜单点击
  const handleMenuClick: MenuProps['onClick'] = (e) => {
    navigate(e.key);
    setDrawerVisible(false); // 移动端点击后关闭抽屉
  };

  // 渲染菜单
  const renderMenu = () => (
    <Menu
      mode="inline"
      selectedKeys={[location.pathname]}
      style={{ height: '100%', borderRight: 0 }}
      items={menuItems}
      onClick={handleMenuClick}
    />
  );

  return (
    <Layout className="app-shell" style={{ minHeight: '100vh' }}>
      <Header
        className="app-shell__header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* 移动端菜单按钮 */}
          <MenuOutlined
            style={{
              color: 'white',
              fontSize: 20,
              cursor: 'pointer',
              display: 'none',
            }}
            className="mobile-menu-icon"
            onClick={() => setDrawerVisible(true)}
          />
          <div
            style={{
              color: 'white',
              fontSize: '18px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Telegram频道管理系统
          </div>
        </div>
        {onThemeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tooltip title="切换浅色/深色模式">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BulbOutlined style={{ color: 'white' }} />
                <Switch
                  checked={isDarkMode}
                  onChange={onThemeChange}
                  checkedChildren="深色"
                  unCheckedChildren="浅色"
                />
              </div>
            </Tooltip>
          </div>
        )}
      </Header>
      <Layout>
        {/* 桌面端侧边栏 */}
        <Sider
          width={200}
          style={{ background: colorBgContainer }}
          className="desktop-sider"
          breakpoint="lg"
          collapsedWidth="0"
        >
          {renderMenu()}
        </Sider>

        {/* 移动端抽屉菜单 */}
        <Drawer
          title="菜单"
          placement="left"
          onClose={() => setDrawerVisible(false)}
          open={drawerVisible}
          bodyStyle={{ padding: 0 }}
          className="mobile-drawer"
        >
          {renderMenu()}
        </Drawer>

        <Layout style={{ padding: '16px' }}>
          <Content
            className="app-shell__content"
            style={{
              padding: 16,
              margin: 0,
              minHeight: 280,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
            }}
          >
            {children}
          </Content>
        </Layout>
      </Layout>

      <style>{`
        .app-shell__header {
          background: linear-gradient(100deg, #0d3040 0%, #0f4d62 55%, #116869 100%) !important;
          box-shadow: 0 8px 24px rgba(4, 26, 35, 0.25);
        }
        
        .app-shell__content {
          box-shadow: 0 10px 30px rgba(15, 45, 49, 0.08);
          border: 1px solid rgba(13, 122, 111, 0.08);
        }

        /* 桌面端显示侧边栏，隐藏移动菜单图标 */
        @media (min-width: 992px) {
          .desktop-sider {
            display: block !important;
          }
          .mobile-menu-icon {
            display: none !important;
          }
          .mobile-drawer {
            display: none;
          }
        }

        /* 移动端隐藏侧边栏，显示菜单图标 */
        @media (max-width: 991px) {
          .desktop-sider {
            display: none !important;
          }
          .mobile-menu-icon {
            display: block !important;
          }
        }

        /* 小屏幕优化 */
        @media (max-width: 576px) {
          .ant-layout-header {
            padding: 0 12px !important;
          }
          
          .ant-layout-header > div:first-child > div {
            font-size: 14px !important;
          }
        }
      `}</style>
    </Layout>
  );
};

export default MainLayout;
