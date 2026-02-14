import { Card } from 'antd';
import type { CardProps } from 'antd';

interface PageContainerProps extends CardProps {
  children: React.ReactNode;
}

/**
 * 页面容器组件
 * 为页面内容提供统一的卡片容器
 */
const PageContainer: React.FC<PageContainerProps> = ({ children, ...rest }) => {
  return (
    <Card bordered={false} {...rest}>
      {children}
    </Card>
  );
};

export default PageContainer;
