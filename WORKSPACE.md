# PNPM Workspace 使用指南

本项目使用 pnpm workspace 管理 monorepo 结构，包含 backend 和 frontend 两个独立包。

## 项目结构

```
telegram-channel-manager/
├── backend/                    # 后端服务包 (@telegram-manager/backend)
├── frontend/                   # 前端应用包 (@telegram-manager/frontend)
├── pnpm-workspace.yaml        # workspace 配置文件
├── .npmrc                     # pnpm 配置文件
└── package.json               # 根级别配置和脚本
```

## 常用命令

### 安装依赖

```bash
# 安装所有包的依赖
pnpm install

# 或使用别名
pnpm install:all
```

### 开发模式

```bash
# 同时启动 backend 和 frontend 开发服务器
pnpm dev

# 只启动后端
pnpm dev:backend

# 只启动前端
pnpm dev:frontend
```

### 构建

```bash
# 构建所有包
pnpm build

# 只构建后端
pnpm build:backend

# 只构建前端
pnpm build:frontend
```

### 启动生产服务

```bash
# 启动后端生产服务
pnpm start
```

### 代码质量

```bash
# 检查所有包的代码规范
pnpm lint

# 自动修复代码规范问题
pnpm lint:fix

# 格式化所有代码
pnpm format

# 检查代码格式
pnpm format:check
```

### 清理

```bash
# 清理所有包的构建产物
pnpm clean
```

## 为特定包添加依赖

### 为 backend 添加依赖

```bash
# 添加生产依赖
pnpm --filter @telegram-manager/backend add <package-name>

# 添加开发依赖
pnpm --filter @telegram-manager/backend add -D <package-name>
```

### 为 frontend 添加依赖

```bash
# 添加生产依赖
pnpm --filter @telegram-manager/frontend add <package-name>

# 添加开发依赖
pnpm --filter @telegram-manager/frontend add -D <package-name>
```

### 为根目录添加依赖（通常是开发工具）

```bash
# 添加到根目录
pnpm add -D -w <package-name>
```

## 在包之间共享代码

如果需要在 backend 和 frontend 之间共享代码，可以创建一个共享包：

```bash
# 创建共享包目录
mkdir -p packages/shared

# 在 pnpm-workspace.yaml 中添加
# packages:
#   - 'backend'
#   - 'frontend'
#   - 'packages/*'
```

## Workspace 配置说明

### pnpm-workspace.yaml

定义了哪些目录是 workspace 包：

```yaml
packages:
  - 'backend'
  - 'frontend'
```

### .npmrc

配置 pnpm 的行为：

- `link-workspace-packages=true`: 自动链接 workspace 包
- `auto-install-peers=true`: 自动安装 peer dependencies
- `public-hoist-pattern`: 提升共享的开发工具到根目录

## 包命名规范

- Backend: `@telegram-manager/backend`
- Frontend: `@telegram-manager/frontend`
- 所有包都标记为 `private: true`，不会发布到 npm

## 最佳实践

1. **依赖管理**: 共享的开发工具（如 ESLint、Prettier）安装在根目录
2. **独立运行**: 每个包都可以独立开发和测试
3. **并行执行**: 使用 `pnpm -r` 或 `pnpm --parallel` 在所有包中执行命令
4. **过滤执行**: 使用 `--filter` 只在特定包中执行命令

## 故障排除

### 依赖安装问题

```bash
# 清理所有 node_modules 和锁文件
rm -rf node_modules backend/node_modules frontend/node_modules pnpm-lock.yaml

# 重新安装
pnpm install
```

### 链接问题

```bash
# 重新链接 workspace 包
pnpm install --force
```

## 更多信息

- [pnpm workspace 文档](https://pnpm.io/workspaces)
- [pnpm CLI 文档](https://pnpm.io/cli/add)
