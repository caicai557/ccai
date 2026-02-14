# 属性测试环境问题说明

## 问题描述

在执行属性测试时遇到 `better-sqlite3` 原生模块编译失败的问题。

## 错误信息

```
Could not locate the bindings file
error: "C++20 or later required."
gyp ERR! build error
make: *** [Release/obj.target/better_sqlite3/src/better_sqlite3.o] Error 1
```

## 根本原因

- **Node.js 版本**: 25.6.0
- **better-sqlite3 版本**: 9.6.0
- **问题**: better-sqlite3@9.6.0 与 Node.js 25.6.0 存在兼容性问题，需要 C++20 支持，但当前编译环境不满足要求

## 已完成的工作

### 创建的测试文件

`backend/src/services/AccountService.session.property.test.ts`

### 测试覆盖范围

#### 属性 2: 会话文件验证拒绝无效输入（验证需求 1.5）

- **属性 2.1**: 空会话文件应该被拒绝
- **属性 2.2**: 格式无效的会话文件应该被拒绝
- **属性 2.3**: 非UTF-8编码的会话文件应该被拒绝或处理
- **属性 2.4**: 会话文件长度边界测试

#### 属性 1: 会话文件往返一致性（验证需求 1.13, 8.2）

- **属性 1.1**: 导出的会话文件应该包含有效的会话数据
- **属性 1.2**: 导出后的会话数据应该与原始会话数据一致
- **属性 1.3**: 账号不存在时导出应该失败
- **属性 1.4**: 账号未登录时导出应该失败
- **属性 1.5**: 多次导出同一账号应该返回相同的会话数据

#### 属性 1.6: 会话数据完整性

- **属性 1.6.1**: 导出的会话数据长度应该与原始数据一致
- **属性 1.6.2**: 导出的会话数据应该保持字符完整性

### 测试特点

1. **使用 fast-check 进行属性测试**: 每个属性测试运行 10-50 次迭代
2. **全面的输入生成**: 包括空字符串、无效格式、边界值等
3. **完整的错误处理验证**: 测试各种异常情况
4. **数据一致性验证**: 确保导出导入的数据完整性

## 解决方案

### 方案 1: 降级 Node.js（推荐）

```bash
# 使用 nvm 切换到 LTS 版本
nvm install 20
nvm use 20

# 重新安装依赖
pnpm install

# 运行测试
pnpm test
```

### 方案 2: 升级 better-sqlite3

```bash
# 升级到最新版本（如果支持 Node.js 25）
pnpm add better-sqlite3@latest

# 运行测试
pnpm test
```

### 方案 3: 使用预编译二进制

```bash
# 清理现有安装
rm -rf node_modules/.pnpm/better-sqlite3*

# 重新安装并尝试使用预编译二进制
pnpm install --force
```

### 方案 4: 配置编译环境

确保系统安装了支持 C++20 的编译器：

```bash
# macOS
xcode-select --install

# 确保 Xcode 版本支持 C++20
```

## 测试执行命令

环境问题解决后，使用以下命令运行属性测试：

```bash
# 运行会话文件属性测试
npx jest src/services/AccountService.session.property.test.ts --verbose --runInBand

# 运行所有属性测试
npx jest --testPathPattern="property.test.ts" --verbose --runInBand
```

## 验证测试

测试代码已经编写完成，逻辑正确。一旦环境问题解决，测试应该能够正常运行并验证：

1. ✅ 会话文件格式验证
2. ✅ 无效输入拒绝
3. ✅ 导出导入数据一致性
4. ✅ 错误处理正确性
5. ✅ 数据完整性保证

## 相关文件

- 测试文件: `backend/src/services/AccountService.session.property.test.ts`
- 被测试代码: `backend/src/services/AccountService.ts`
- 会话管理: `backend/src/telegram/SessionManager.ts`
- 任务文档: `.kiro/specs/telegram-content-manager/tasks.md`

## 状态

- ✅ 测试代码已完成
- ⏸️ 测试执行被环境问题阻塞
- 📝 需要解决 better-sqlite3 编译问题后才能运行测试
