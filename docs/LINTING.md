# 代码规范配置说明

本项目使用 ESLint 和 Prettier 来保证代码质量和一致性。

## 工具说明

### ESLint

ESLint 用于检查代码质量和潜在错误。

- **版本**: ESLint 9.x
- **TypeScript 支持**: @typescript-eslint/parser 和 @typescript-eslint/eslint-plugin
- **React 支持**: eslint-plugin-react 和 eslint-plugin-react-hooks（仅前端）

### Prettier

Prettier 用于统一代码格式。

- **配置文件**: `.prettierrc`
- **忽略文件**: `.prettierignore`

## 配置文件

### Backend 配置

- `backend/eslint.config.mjs` - ESLint 配置
- 包含 Node.js 环境全局变量
- 严格的 TypeScript 规则

### Frontend 配置

- `frontend/eslint.config.mjs` - ESLint 配置
- 包含浏览器环境全局变量
- React 和 React Hooks 规则
- 自动检测 React 版本

## 常用命令

### 检查代码

```bash
# 检查所有项目
pnpm lint

# 仅检查 backend
pnpm --filter @telegram-manager/backend lint

# 仅检查 frontend
pnpm --filter @telegram-manager/frontend lint
```

### 自动修复

```bash
# 修复所有项目
pnpm lint:fix

# 仅修复 backend
pnpm --filter @telegram-manager/backend lint:fix

# 仅修复 frontend
pnpm --filter @telegram-manager/frontend lint:fix
```

### 格式化代码

```bash
# 格式化所有文件
pnpm format

# 检查格式（不修改文件）
pnpm format:check
```

## VS Code 集成

项目已配置 VS Code 设置（`.vscode/settings.json`）：

- **保存时自动格式化**: 使用 Prettier
- **保存时自动修复**: 使用 ESLint
- **推荐扩展**: ESLint、Prettier

### 推荐安装的扩展

1. **ESLint** (dbaeumer.vscode-eslint)
2. **Prettier** (esbenp.prettier-vscode)
3. **TypeScript** (ms-vscode.vscode-typescript-next)

## 规则说明

### 通用规则

- 使用单引号
- 使用分号
- 缩进 2 个空格
- 行宽限制 100 字符
- 使用 ES5 尾随逗号
- 箭头函数参数始终使用括号

### TypeScript 规则

- 未使用的变量会报错（以 `_` 开头的除外）
- 允许使用 `any` 类型（警告）
- 不强制要求显式返回类型
- 不强制要求模块边界类型

### React 规则（仅前端）

- React 17+ 不需要导入 React
- 不使用 PropTypes（使用 TypeScript）
- 遵循 React Hooks 规则

### Console 规则

- 仅允许 `console.warn` 和 `console.error`
- 其他 console 方法会触发警告

## 忽略文件

以下文件/目录会被忽略：

- `node_modules/`
- `dist/`
- `build/`
- `*.min.js`
- `*.min.css`
- 锁文件（`pnpm-lock.yaml` 等）

## 故障排除

### ESLint 报错

如果遇到 ESLint 错误：

1. 确保已安装所有依赖：`pnpm install`
2. 检查 TypeScript 配置是否正确
3. 尝试重启 VS Code

### Prettier 格式化失败

如果 Prettier 无法格式化：

1. 检查文件是否在 `.prettierignore` 中
2. 确保文件扩展名被支持
3. 检查文件语法是否正确

### VS Code 不自动格式化

1. 确保已安装 Prettier 扩展
2. 检查 `.vscode/settings.json` 配置
3. 确保 Prettier 被设置为默认格式化工具

## 最佳实践

1. **提交前检查**: 运行 `pnpm lint` 和 `pnpm format:check`
2. **使用自动修复**: 大部分问题可以通过 `pnpm lint:fix` 自动修复
3. **遵循规则**: 不要随意禁用 ESLint 规则
4. **保持一致**: 团队成员使用相同的编辑器配置

## Git Hooks（可选）

可以使用 husky 和 lint-staged 在提交前自动检查：

```bash
# 安装依赖
pnpm add -D -w husky lint-staged

# 配置 package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

## 参考资料

- [ESLint 文档](https://eslint.org/)
- [Prettier 文档](https://prettier.io/)
- [TypeScript ESLint 文档](https://typescript-eslint.io/)
- [ESLint React 插件](https://github.com/jsx-eslint/eslint-plugin-react)
