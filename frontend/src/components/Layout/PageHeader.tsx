import { Typography } from 'antd';

const { Title, Text } = Typography;

interface PageHeaderProps {
  title: string;
  subTitle?: string;
  extra?: React.ReactNode;
}

/**
 * 页面头部组件
 */
const PageHeader: React.FC<PageHeaderProps> = ({ title, subTitle, extra }) => {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            {title}
          </Title>
          {subTitle && (
            <Text type="secondary" style={{ fontSize: 14 }}>
              {subTitle}
            </Text>
          )}
        </div>
        {extra && <div>{extra}</div>}
      </div>
    </div>
  );
};

export default PageHeader;
