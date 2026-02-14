# 布局组件

本目录包含应用的基础布局组件，提供统一的页面结构和响应式布局支持。

## 组件列表

### MainLayout

主布局组件，包含顶部导航栏、侧边菜单和内容区域。

```tsx
import { MainLayout } from '@/components/Layout';

<MainLayout>
  <YourContent />
</MainLayout>;
```

### PageHeader

页面头部组件，提供统一的页面标题和操作区域。

```tsx
import { PageHeader } from '@/components/Layout';
import { Button } from 'antd';

<PageHeader
  title="页面标题"
  subTitle="页面副标题"
  extra={<Button type="primary">操作按钮</Button>}
/>;
```

### PageContainer

页面容器组件，为页面内容提供统一的卡片容器。

```tsx
import { PageContainer } from '@/components/Layout';

<PageContainer title="容器标题">
  <YourContent />
</PageContainer>;
```

### EmptyState

空状态组件，用于显示无数据或空列表的状态。

```tsx
import { EmptyState } from '@/components/Layout';

<EmptyState
  title="暂无数据"
  description="还没有添加任何内容"
  actionText="立即添加"
  onAction={() => console.log('添加')}
/>;
```

### LoadingState

加载状态组件，用于显示数据加载中的状态。

```tsx
import { LoadingState } from '@/components/Layout';

// 普通加载
<LoadingState tip="加载中..." />

// 全屏加载
<LoadingState tip="加载中..." fullScreen />
```

### ResponsiveGrid

响应式网格布局组件，提供统一的响应式列布局。

```tsx
import { ResponsiveGrid } from '@/components/Layout';
import { Card } from 'antd';

<ResponsiveGrid cols={{ xs: 1, sm: 2, md: 3, lg: 4 }} gutter={16}>
  <Card>内容1</Card>
  <Card>内容2</Card>
  <Card>内容3</Card>
  <Card>内容4</Card>
</ResponsiveGrid>;
```

## 响应式断点

所有布局组件遵循 Ant Design 的响应式断点规范：

- `xs`: < 576px (手机)
- `sm`: ≥ 576px (平板)
- `md`: ≥ 768px (小屏幕)
- `lg`: ≥ 992px (桌面)
- `xl`: ≥ 1200px (大屏幕)
- `xxl`: ≥ 1600px (超大屏幕)

## 使用示例

### 完整页面示例

```tsx
import { PageHeader, PageContainer, EmptyState, LoadingState } from '@/components/Layout';
import { Button, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const MyPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);

  if (loading) {
    return <LoadingState tip="加载数据中..." />;
  }

  return (
    <div>
      <PageHeader
        title="我的页面"
        subTitle="页面描述信息"
        extra={
          <Button type="primary" icon={<PlusOutlined />}>
            添加
          </Button>
        }
      />
      <PageContainer>
        {data.length === 0 ? (
          <EmptyState title="暂无数据" description="点击上方按钮添加数据" />
        ) : (
          <Table dataSource={data} />
        )}
      </PageContainer>
    </div>
  );
};
```

## 设计原则

1. **一致性**: 所有页面使用统一的布局组件，保持视觉和交互一致
2. **响应式**: 所有组件支持响应式布局，适配不同屏幕尺寸
3. **可复用**: 组件设计通用，可在不同场景下复用
4. **可扩展**: 组件支持通过 props 自定义样式和行为
5. **类型安全**: 所有组件使用 TypeScript 编写，提供完整的类型定义
