# Telegram频道管理系统 - 前端

## 技术栈

- React 18+
- TypeScript 5+
- Ant Design 5+
- Vite
- Zustand (状态管理)
- React Router (路由)
- Axios (HTTP客户端)

## 目录结构

```
frontend/
├── src/
│   ├── main.tsx           # 入口文件
│   ├── App.tsx            # 根组件
│   ├── components/        # 通用组件
│   ├── pages/             # 页面组件
│   ├── stores/            # Zustand状态管理
│   ├── services/          # API服务
│   ├── hooks/             # 自定义Hooks
│   ├── utils/             # 工具函数
│   └── types/             # TypeScript类型定义
├── public/                # 静态资源
└── index.html             # HTML模板
```

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 预览构建结果
pnpm preview
```

## 访问

开发模式下访问: http://localhost:5173
