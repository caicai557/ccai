import { Skeleton, Card } from 'antd';

interface SkeletonLoaderProps {
  type?: 'list' | 'card' | 'form' | 'table' | 'detail';
  rows?: number;
  loading?: boolean;
  children?: React.ReactNode;
}

/**
 * 骨架屏组件
 * 提供不同类型的骨架屏加载效果
 */
const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  type = 'list',
  rows = 3,
  loading = true,
  children,
}) => {
  // 如果不是加载状态，直接显示子组件
  if (!loading && children) {
    return <>{children}</>;
  }

  // 列表骨架屏
  if (type === 'list') {
    return (
      <div>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} style={{ marginBottom: 16 }}>
            <Skeleton active avatar paragraph={{ rows: 2 }} />
          </div>
        ))}
      </div>
    );
  }

  // 卡片骨架屏
  if (type === 'card') {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}
      >
        {Array.from({ length: rows }).map((_, index) => (
          <Card key={index}>
            <Skeleton active paragraph={{ rows: 3 }} />
          </Card>
        ))}
      </div>
    );
  }

  // 表单骨架屏
  if (type === 'form') {
    return (
      <div>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} style={{ marginBottom: 24 }}>
            <Skeleton.Input active style={{ width: 120, marginBottom: 8 }} />
            <Skeleton.Input active block />
          </div>
        ))}
        <Skeleton.Button active style={{ width: 100, marginTop: 16 }} />
      </div>
    );
  }

  // 表格骨架屏
  if (type === 'table') {
    return (
      <div>
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          <Skeleton.Button active style={{ width: 100 }} />
          <Skeleton.Button active style={{ width: 100 }} />
        </div>
        <Skeleton active paragraph={{ rows: rows * 2 }} />
      </div>
    );
  }

  // 详情页骨架屏
  if (type === 'detail') {
    return (
      <div>
        <Skeleton.Input active style={{ width: 200, marginBottom: 24 }} size="large" />
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} style={{ marginBottom: 16 }}>
            <Skeleton active paragraph={{ rows: 1 }} />
          </div>
        ))}
      </div>
    );
  }

  // 默认骨架屏
  return <Skeleton active paragraph={{ rows }} />;
};

/**
 * 表格骨架屏
 */
export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return <SkeletonLoader type="table" rows={rows} />;
};

/**
 * 卡片骨架屏
 */
export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return <SkeletonLoader type="card" rows={count} />;
};

/**
 * 表单骨架屏
 */
export const FormSkeleton: React.FC<{ fields?: number }> = ({ fields = 4 }) => {
  return <SkeletonLoader type="form" rows={fields} />;
};

/**
 * 列表骨架屏
 */
export const ListSkeleton: React.FC<{ items?: number }> = ({ items = 3 }) => {
  return <SkeletonLoader type="list" rows={items} />;
};

/**
 * 详情页骨架屏
 */
export const DetailSkeleton: React.FC<{ sections?: number }> = ({ sections = 5 }) => {
  return <SkeletonLoader type="detail" rows={sections} />;
};

export default SkeletonLoader;
