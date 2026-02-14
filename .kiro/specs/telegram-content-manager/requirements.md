# 需求文档

## 简介

本系统是一个Telegram频道/群组自动化管理系统，旨在帮助用户管理多个Telegram账号，在自己拥有的频道和群组中自动发送消息和评论。系统采用桌面Web架构，提供直观的管理界面，同时严格遵守Telegram的速率限制和服务条款，确保账号安全。

## 术语表

- **系统 (System)**: Telegram自动化管理系统
- **用户 (User)**: 使用本系统的管理员
- **Telegram账号 (Telegram_Account)**: 通过MTProto协议连接的Telegram用户账号
- **协议号文件 (Session_File)**: 包含Telegram会话信息的.session文件
- **频道 (Channel)**: Telegram频道，支持单向广播消息
- **群组 (Group)**: Telegram群组，支持多人对话
- **消息模板 (Message_Template)**: 预设的消息内容模板
- **任务 (Task)**: 自动化执行的消息发送或评论任务
- **速率限制器 (Rate_Limiter)**: 控制消息发送频率的组件
- **FloodWait**: Telegram返回的速率限制错误
- **MTProto**: Telegram的通信协议

## 需求

### 需求 1: 账号管理

**用户故事:** 作为用户，我想要添加和管理多个Telegram账号，以便使用不同账号在不同频道和群组中操作。

#### 验收标准

1. THE 系统 SHALL 支持两种账号添加方式：手机号登录和协议号文件导入
2. WHEN 用户选择手机号登录 THEN THE 系统 SHALL 发起Telegram登录流程并请求验证码
3. WHEN 用户输入验证码 THEN THE 系统 SHALL 验证并建立MTProto会话
4. WHEN 用户选择协议号导入 THEN THE 系统 SHALL 提供文件上传界面
5. WHEN 用户上传协议号文件（.session文件） THEN THE 系统 SHALL 解析并验证文件有效性
6. WHEN 协议号文件有效 THEN THE 系统 SHALL 使用该会话文件建立连接
7. WHEN 账号添加成功 THEN THE 系统 SHALL 将账号信息和会话数据持久化到数据库
8. THE 系统 SHALL 显示所有已添加账号的列表，包括手机号、昵称、添加方式和在线状态
9. WHEN 用户请求删除账号 THEN THE 系统 SHALL 停止该账号的所有任务并从数据库中移除
10. THE 系统 SHALL 每5分钟检查一次账号连接状态
11. WHEN 账号连接断开 THEN THE 系统 SHALL 标记账号为离线状态并尝试重新连接
12. WHEN 账号被Telegram限制 THEN THE 系统 SHALL 标记账号状态为受限并通知用户
13. THE 系统 SHALL 支持导出账号的会话文件（.session格式）

### 需求 2: 消息发送功能

**用户故事:** 作为用户，我想要在指定群组中自动发送消息，以便保持群组活跃度。

#### 验收标准

1. WHEN 用户创建发送任务 THEN THE 系统 SHALL 要求指定目标群组、使用的账号和消息模板
2. WHEN 用户配置发送间隔 THEN THE 系统 SHALL 验证间隔时间不少于10分钟
3. WHEN 任务启动 THEN THE 系统 SHALL 按照配置的间隔时间自动发送消息
4. WHEN 发送消息时 THEN THE 系统 SHALL 从消息模板中随机选择一条内容
5. WHEN 消息模板包含变量 THEN THE 系统 SHALL 替换变量为实际值（如时间、随机数）
6. WHEN 消息发送成功 THEN THE 系统 SHALL 记录发送日志到数据库
7. WHEN 消息发送失败 THEN THE 系统 SHALL 记录错误信息并根据错误类型决定是否重试
8. THE 系统 SHALL 支持暂停和恢复发送任务

### 需求 3: 自动评论功能

**用户故事:** 作为用户，我想要自动对频道消息进行评论，以便增加频道互动性。

#### 验收标准

1. WHEN 用户创建评论任务 THEN THE 系统 SHALL 要求指定目标频道、使用的账号和评论模板
2. WHEN 任务启动 THEN THE 系统 SHALL 监听目标频道的新消息
3. WHEN 频道发布新消息 THEN THE 系统 SHALL 在随机延迟（1-5分钟）后发送评论
4. WHEN 发送评论时 THEN THE 系统 SHALL 从评论模板中随机选择一条内容
5. WHEN 评论发送成功 THEN THE 系统 SHALL 记录评论日志到数据库
6. THE 系统 SHALL 支持配置评论概率（如50%的消息会被评论）
7. WHEN 同一消息已被评论 THEN THE 系统 SHALL 不再重复评论
8. THE 系统 SHALL 支持暂停和恢复评论任务

### 需求 4: 消息模板管理

**用户故事:** 作为用户，我想要创建和管理消息模板，以便让自动发送的内容更加多样化。

#### 验收标准

1. THE 系统 SHALL 支持创建、编辑和删除消息模板
2. WHEN 用户创建模板 THEN THE 系统 SHALL 要求指定模板名称和内容列表
3. THE 系统 SHALL 支持在模板中使用变量（如 {time}、{random}、{date}）
4. WHEN 模板被任务使用时 THEN THE 系统 SHALL 阻止删除该模板
5. THE 系统 SHALL 支持模板分类（发送消息模板、评论模板）
6. THE 系统 SHALL 显示每个模板的使用次数统计
7. WHEN 用户预览模板 THEN THE 系统 SHALL 显示变量替换后的实际效果

### 需求 5: 速率限制与风控

**用户故事:** 作为用户，我想要系统自动控制消息发送频率，以便避免账号被Telegram限制。

#### 验收标准

1. THE 系统 SHALL 确保单个账号每秒发送消息不超过1条
2. THE 系统 SHALL 确保单个账号每小时发送消息不超过30条
3. THE 系统 SHALL 确保单个账号每天发送消息不超过200条
4. WHEN 发送消息前 THEN THE 系统 SHALL 检查速率限制是否允许发送
5. WHEN 收到FloodWait错误 THEN THE 系统 SHALL 暂停该账号操作并等待指定时间
6. WHEN 多个任务使用同一账号 THEN THE 系统 SHALL 协调任务执行顺序避免冲突
7. THE 系统 SHALL 在每次操作间添加随机延迟（1-3秒）
8. WHEN 账号触发速率限制 THEN THE 系统 SHALL 记录事件并通知用户
9. THE 系统 SHALL 跟踪每个账号的健康度评分（基于成功率和限制次数）
10. WHEN 账号健康度低于阈值 THEN THE 系统 SHALL 自动降低该账号的使用频率

### 需求 6: 任务调度管理

**用户故事:** 作为用户，我想要灵活配置和管理自动化任务，以便根据需要调整运行策略。

#### 验收标准

1. THE 系统 SHALL 支持创建、编辑、删除、启动和停止任务
2. WHEN 用户创建任务 THEN THE 系统 SHALL 验证配置的完整性和合理性
3. THE 系统 SHALL 显示所有任务的列表，包括状态、类型和下次执行时间
4. WHEN 任务执行失败 THEN THE 系统 SHALL 根据配置的重试策略自动重试
5. THE 系统 SHALL 记录每个任务的执行历史（成功次数、失败次数、最后执行时间）
6. WHEN 系统重启 THEN THE 系统 SHALL 自动恢复之前运行中的任务
7. THE 系统 SHALL 支持任务优先级配置
8. WHEN 多个任务同时到期 THEN THE 系统 SHALL 按优先级顺序执行

### 需求 7: Web管理界面

**用户故事:** 作为用户，我想要通过直观的Web界面管理系统，以便轻松完成各项操作。

#### 验收标准

1. THE 系统 SHALL 提供响应式Web界面，支持桌面浏览器访问
2. THE 系统 SHALL 提供账号管理页面，显示所有账号及其状态
3. THE 系统 SHALL 提供任务管理页面，支持创建和管理任务
4. THE 系统 SHALL 提供模板管理页面，支持创建和编辑消息模板
5. THE 系统 SHALL 提供实时日志页面，显示系统运行日志和消息发送记录
6. THE 系统 SHALL 提供统计仪表板，显示关键指标（总消息数、成功率、账号状态等）
7. WHEN 后端状态变化 THEN THE 系统 SHALL 通过WebSocket实时更新前端显示
8. THE 系统 SHALL 提供深色和浅色主题切换
9. WHEN 发生错误 THEN THE 系统 SHALL 在界面上显示友好的错误提示

### 需求 8: 数据持久化

**用户故事:** 作为用户，我想要系统保存所有配置和历史记录，以便系统重启后能恢复状态。

#### 验收标准

1. THE 系统 SHALL 使用SQLite数据库存储所有数据
2. THE 系统 SHALL 持久化账号信息（包括会话数据）
3. THE 系统 SHALL 持久化任务配置和状态
4. THE 系统 SHALL 持久化消息模板
5. THE 系统 SHALL 持久化操作日志（至少保留30天）
6. THE 系统 SHALL 持久化统计数据
7. WHEN 数据库文件不存在 THEN THE 系统 SHALL 自动创建并初始化数据库结构
8. THE 系统 SHALL 定期备份数据库文件（每天一次）

### 需求 9: 错误处理与日志

**用户故事:** 作为用户，我想要系统详细记录所有操作和错误，以便排查问题。

#### 验收标准

1. THE 系统 SHALL 记录所有消息发送和评论操作
2. THE 系统 SHALL 记录所有错误和异常，包括堆栈跟踪
3. THE 系统 SHALL 记录账号状态变化
4. THE 系统 SHALL 记录速率限制触发事件
5. WHEN 发生严重错误 THEN THE 系统 SHALL 在日志中标记为ERROR级别
6. THE 系统 SHALL 支持按时间、账号、任务筛选日志
7. THE 系统 SHALL 提供日志导出功能
8. THE 系统 SHALL 自动清理超过30天的日志记录

### 需求 10: 系统配置

**用户故事:** 作为用户，我想要配置系统的全局参数，以便根据需要调整系统行为。

#### 验收标准

1. THE 系统 SHALL 支持配置全局速率限制参数
2. THE 系统 SHALL 支持配置数据库路径
3. THE 系统 SHALL 支持配置日志保留天数
4. THE 系统 SHALL 支持配置WebSocket端口
5. THE 系统 SHALL 支持配置API服务器端口
6. WHEN 配置更改 THEN THE 系统 SHALL 验证配置的有效性
7. WHEN 配置更改 THEN THE 系统 SHALL 在下次启动时应用新配置
8. THE 系统 SHALL 提供配置重置为默认值的功能
