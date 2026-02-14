import { Spin } from 'antd';
import type { SpinProps } from 'antd';

interface LoadingStateProps extends SpinProps {
  tip?: string;
  fullScreen?: boolean;
}

/**
 * 加载状态组件
 * 用于显示数据加载中的状态
 */
const LoadingState: React.FC<LoadingStateProps> = ({
  tip = '加载中...',
  fullScreen = false,
  ...rest
}) => {
  const style: React.CSSProperties = fullScreen
    ? {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
      }
    : {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '50px 0',
      };

  return (
    <div style={style}>
      <Spin tip={tip} size="large" {...rest} />
    </div>
  );
};

export default LoadingState;
