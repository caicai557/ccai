# 配置文件说明

## default.json

默认配置文件，包含系统的基础配置。

### 配置项说明

- **server**: 服务器配置
  - `port`: 服务器端口（默认3000）
  - `host`: 服务器主机（默认localhost）

- **telegram**: Telegram API配置
  - `apiId`: 从 https://my.telegram.org 获取的API ID
  - `apiHash`: 从 https://my.telegram.org 获取的API Hash

- **database**: 数据库配置
  - `path`: SQLite数据库文件路径

- **security**: 安全配置
  - `encryptionKey`: 用于加密账号session的密钥（自动生成）

- **rateLimit**: 速率限制配置
  - `messagesPerSecond`: 每秒最多发送消息数
  - `messagesPerDay`: 每天最多发送消息数

- **logging**: 日志配置
  - `level`: 日志级别（info/warn/error）
  - `directory`: 日志文件目录

## 使用说明

1. 复制 `default.json` 为 `local.json`
2. 在 `local.json` 中填写你的 Telegram API 凭证
3. `local.json` 不会被提交到版本控制
