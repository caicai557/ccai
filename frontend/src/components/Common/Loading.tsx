import { Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

interface LoadingProps {
  tip?: string;
  size?: 'small' | 'default' | 'large';
  fullScreen?: boolean;
}

/**
 * 加载组件
 * 提供统一的加载状态显示
 */
const Loading: React.FC<LoadingProps> = ({
  tip = '加载中...',
  size = 'default',
  fullScreen = false,
}) => {
  const loadingIcon = <LoadingOutlined style={{ fontSize: size === 'large' ? 48 : 24 }} spin />;

  if (fullScreen) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          width: '100%',
        }}
      >
        <Spin indicator={loadingIcon} tip={tip} size={size} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '40px 0',
        width: '100%',
      }}
    >
      <Spin indicator={loadingIcon} tip={tip} size={size} />
    </div>
  );
};

export default Loading;
