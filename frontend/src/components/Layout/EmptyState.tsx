import { Empty, Button } from 'antd';
import type { EmptyProps } from 'antd';

interface EmptyStateProps extends EmptyProps {
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
}

/**
 * 空状态组件
 * 用于显示无数据或空列表的状态
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  title = '暂无数据',
  description,
  actionText,
  onAction,
  ...rest
}) => {
  return (
    <Empty
      description={
        <div>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>{title}</div>
          {description && <div style={{ color: '#999', fontSize: '14px' }}>{description}</div>}
        </div>
      }
      {...rest}
    >
      {actionText && onAction && (
        <Button type="primary" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </Empty>
  );
};

export default EmptyState;
