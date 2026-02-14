# PNPM Workspace 配置完成

## 配置概览

本项目已成功配置 pnpm workspace，实现了 monorepo 架构。

## 配置文件

### 1. pnpm-workspace.yaml

```yaml
packages:
  - 'backend'
  - 'frontend'
```

定义了两个 workspace 包：

- `@telegram-manager/backend` - 后端服务
- `@telegram-manager/frontend` - 前端应用

### 2. .npmrc

配置了 pnpm 的行为：

- 自动链接 workspace 包
- 自动安装 peer dependencies
- 提升共享开发工具到根目录

### 3. package.json (根目录)

配置了根级别的脚本命令：

| 命令                  | 说明                     |
| --------------------- | ------------------------ |
| `pnpm dev`            | 并行启动前后端开发服务器 |
| `pnpm dev:backend`    | 只启动后端开发服务器     |
| `pnpm dev:frontend`   | 只启动前端开发服务器     |
| `pnpm build`          | 构建所有包               |
| `pnpm build:backend`  | 只构建后端               |
| `pnpm build:frontend` | 只构建前端               |
| `pnpm start`          | 启动后端生产服务         |
| `pnpm clean`          | 清理所有构建产物         |
| `pnpm lint`           | 检查所有包的代码规范     |
| `pnpm lint:fix`       | 自动修复代码规范问题     |
| `pnpm format`         | 格式化所有代码           |
| `pnpm format:check`   | 检查代码格式             |
| `pnpm install:all`    | 安装所有依赖             |

## 包结构

### Backend (@telegram-manager/backend)

```json
{
  "name": "@telegram-manager/backend",
  "version": "1.0.0",
  "private": true
}
```

**主要依赖**:

- express - Web 框架
- telegram - Telegram API 客户端
- better-sqlite3 - SQLite 数据库
- winston - 日志系统
- node-cron - 任务调度
- ws - WebSocket 服务

**开发依赖**:

- typescript - 类型系统
- tsx - TypeScript 执行器
- @types/\* - 类型定义

### Frontend (@telegram-manager/frontend)

```json
{
  "name": "@telegram-manager/frontend",
  "version": "1.0.0",
  "private": true
}
```

**主要依赖**:

- react - UI 框架
- antd - UI 组件库
- zustand - 状态管理
- axios - HTTP 客户端
- react-router-dom - 路由

**开发依赖**:

- vite - 构建工具
- typescript - 类型系统
- @vitejs/plugin-react - React 插件

## 验证配置

### 检查 workspace 包

```bash
pnpm -r exec pwd
```

应该输出：

```
/path/to/project/backend
/path/to/project/frontend
```

### 检查包列表

```bash
pnpm -r list --depth 0
```

应该显示三个包：

1. telegram-channel-manager (根包)
2. @telegram-manager/backend
3. @telegram-manager/frontend

### 测试脚本命令

```bash
# 测试 lint
pnpm lint

# 测试 format check
pnpm format:check
```

## 独立包管理

每个包都可以独立管理：

### 为 backend 添加依赖

```bash
pnpm --filter @telegram-manager/backend add <package-name>
```

### 为 frontend 添加依赖

```bash
pnpm --filter @telegram-manager/frontend add <package-name>
```

### 在特定包中执行命令

```bash
# 在 backend 中执行命令
pnpm --filter @telegram-manager/backend <command>

# 在 frontend 中执行命令
pnpm --filter @telegram-manager/frontend <command>
```

## 优势

1. **统一依赖管理**: 共享的依赖只安装一次
2. **独立开发**: 每个包可以独立开发和测试
3. **并行构建**: 可以并行构建多个包
4. **类型共享**: 可以在包之间共享 TypeScript 类型
5. **脚本复用**: 根级别脚本可以操作所有包

## 下一步

- ✅ Workspace 配置完成
- ✅ 根级别脚本配置完成
- ✅ 包独立管理配置完成
- ⏭️ 继续下一个任务：1.1.5 创建基础目录结构

## 参考文档

- [WORKSPACE.md](../WORKSPACE.md) - 详细使用指南
- [pnpm workspace 官方文档](https://pnpm.io/workspaces)
