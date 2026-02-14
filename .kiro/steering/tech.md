# Technology Stack

## Build System

- **包管理器**: pnpm 8+ (workspace 模式)
- **构建工具**:
  - Backend: TypeScript Compiler (tsc)
  - Frontend: Vite

## Tech Stack

### Backend

- **运行时**: Node.js 18+
- **语言**: TypeScript 5+
- **Web框架**: Express.js
- **Telegram库**: GramJS (telegram)
- **数据库**: SQLite + better-sqlite3
- **任务调度**: node-cron
- **WebSocket**: ws
- **日志**: winston
- **配置管理**: config
- **安全**: helmet, cors

### Frontend

- **框架**: React 18+
- **语言**: TypeScript 5+
- **UI库**: Ant Design
- **状态管理**: Zustand
- **HTTP客户端**: axios
- **路由**: React Router
- **构建工具**: Vite

### 开发工具

- **代码规范**: ESLint + Prettier
- **类型检查**: TypeScript strict mode
- **开发服务器**: tsx (backend), Vite (frontend)

## Common Commands

### 开发

```bash
# 同时启动前后端开发服务器
pnpm dev

# 只启动后端
pnpm dev:backend

# 只启动前端
pnpm dev:frontend
```

### Build

```bash
# 构建所有包
pnpm build

# 只构建后端
pnpm build:backend

# 只构建前端
pnpm build:frontend
```

### Test

```bash
# 测试功能待实现
# pnpm test
```

### 代码质量

```bash
# 检查代码规范
pnpm lint

# 自动修复
pnpm lint:fix

# 格式化代码
pnpm format

# 检查格式
pnpm format:check
```

### 清理

```bash
# 清理构建产物
pnpm clean
```

## Development Environment

- Kiro AI assistant configured
- Git version control initialized
- VS Code workspace settings configured
- pnpm workspace 配置完成
- ESLint + Prettier 代码规范配置
- TypeScript strict mode 启用
