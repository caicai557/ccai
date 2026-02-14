# Frontend 源代码结构

## 目录说明

### `/components`

React组件：

- `/Layout` - 布局组件（Header, Sidebar, Footer等）
- `/Common` - 通用组件（Button, Modal, Table等）
- `/Account` - 账号相关组件
- `/Target` - 目标相关组件
- `/Template` - 模板相关组件
- `/Task` - 任务相关组件

### `/pages`

页面组件：

- `/Dashboard` - 仪表板页面
- `/Accounts` - 账号管理页面
- `/Targets` - 群组/频道管理页面
- `/Templates` - 消息模板管理页面
- `/Tasks` - 任务管理页面
- `/Logs` - 日志查看页面

### `/services`

服务层：

- `/api` - API请求封装
- `/websocket` - WebSocket连接管理

### `/stores`

状态管理（Zustand）：

- `/account` - 账号状态
- `/target` - 目标状态
- `/template` - 模板状态
- `/task` - 任务状态
- `/log` - 日志状态

### `/types`

TypeScript类型定义。

### `/utils`

工具函数。

### `/hooks`

自定义React Hooks。

## 开发规范

1. 组件命名使用PascalCase
2. 文件名与组件名保持一致
3. 每个页面/组件应该有自己的目录
4. 使用函数式组件和Hooks
5. 状态管理使用Zustand
6. API调用统一通过service层
7. 类型定义统一放在types目录
