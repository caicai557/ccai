import Database from 'better-sqlite3';
import * as cron from 'node-cron';
import { TaskDao } from '../../database/dao/TaskDao';
import { TaskExecutionDao } from '../../database/dao/TaskExecutionDao';
import { Task, CreateTaskDto } from '../../types/task';
import { MessageService } from '../message/MessageService';
import { TemplateService } from '../template/TemplateService';
import { logger } from '../../utils/logger';
import { wsManager } from '../../routes/ws';

/**
 * 任务执行上下文
 */
interface TaskExecutionContext {
  task: Task;
  cronJob?: cron.ScheduledTask;
  isExecuting: boolean;
  lastExecutionTime?: Date;
  executionCount: number;
  failureCount: number;
}

interface ChannelMessage {
  id: number;
}

/**
 * 任务管理器
 * 负责任务的创建、调度、执行和状态管理
 */
export class TaskService {
  private taskDao: TaskDao;
  private taskExecutionDao: TaskExecutionDao;
  private messageService: MessageService;
  private templateService: TemplateService;

  // 任务执行上下文映射
  private taskContexts: Map<string, TaskExecutionContext> = new Map();

  // 账号锁（用于同账号任务互斥）
  private accountLocks: Map<string, boolean> = new Map();

  // 已评论的消息ID集合（用于评论去重）
  private commentedMessages: Map<string, Set<number>> = new Map();

  constructor(db: Database.Database) {
    this.taskDao = new TaskDao(db);
    this.taskExecutionDao = new TaskExecutionDao(db);
    this.messageService = new MessageService(db);
    this.templateService = new TemplateService(db);
  }

  private getBroadcastStats(taskId: string): {
    lastExecutedAt?: string;
    successCount: number;
    failureCount: number;
  } {
    const stats = this.getTaskStats(taskId);
    const executionCount = stats?.executionCount ?? 0;
    const failureCount = stats?.failureCount ?? 0;

    return {
      lastExecutedAt: stats?.lastExecutionTime?.toISOString(),
      successCount: Math.max(executionCount - failureCount, 0),
      failureCount,
    };
  }

  private broadcastTaskStatus(taskId: string): void {
    const updatedTask = this.taskDao.findById(taskId);
    if (!updatedTask) {
      return;
    }

    const stats = this.getBroadcastStats(taskId);
    wsManager.broadcastTaskStatus({
      taskId: updatedTask.id,
      status: updatedTask.status,
      lastExecutedAt: stats.lastExecutedAt,
      nextExecutionAt: updatedTask.nextRunAt?.toISOString(),
      successCount: stats.successCount,
      failureCount: stats.failureCount,
    });
  }

  private getMaxRetries(task: Task): number {
    return task.config.retryOnError ? task.config.maxRetries || 3 : 1;
  }

  /**
   * 创建任务
   */
  async createTask(dto: CreateTaskDto): Promise<Task> {
    // 验证任务配置
    this.validateTaskConfig(dto);

    logger.info(`创建任务: type=${dto.type}`);

    const task = this.taskDao.create({
      type: dto.type,
      accountIds: dto.accountIds,
      targetIds: dto.targetIds,
      config: dto.config,
      priority: dto.priority !== undefined ? dto.priority : 5, // 默认优先级为5
      status: 'stopped',
    });

    logger.info(`任务创建成功: id=${task.id}, priority=${task.priority}`);
    return task;
  }

  /**
   * 更新任务
   */
  async updateTask(taskId: string, dto: Partial<CreateTaskDto>): Promise<Task> {
    const existing = this.taskDao.findById(taskId);
    if (!existing) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    // 如果任务正在运行，不允许更新
    if (existing.status === 'running') {
      throw new Error(`任务正在运行，无法更新: ${taskId}`);
    }

    // 验证任务配置
    if (dto.config) {
      this.validateTaskConfig({ ...existing, ...dto } as CreateTaskDto);
    }

    logger.info(`更新任务: id=${taskId}`);

    const updated = this.taskDao.update(taskId, {
      type: dto.type,
      accountIds: dto.accountIds,
      targetIds: dto.targetIds,
      config: dto.config,
      priority: dto.priority,
    });

    if (!updated) {
      throw new Error(`更新任务失败: ${taskId}`);
    }

    logger.info(`任务更新成功: id=${taskId}`);
    return updated;
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<void> {
    const existing = this.taskDao.findById(taskId);
    if (!existing) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    // 如果任务正在运行，先停止
    if (existing.status === 'running') {
      await this.stopTask(taskId);
    }

    logger.info(`删除任务: id=${taskId}`);

    const deleted = this.taskDao.delete(taskId);
    if (!deleted) {
      throw new Error(`删除任务失败: ${taskId}`);
    }

    logger.info(`任务删除成功: id=${taskId}`);
  }

  /**
   * 获取所有任务
   */
  async getAllTasks(): Promise<Task[]> {
    return this.taskDao.findAll();
  }

  /**
   * 获取任务详情
   */
  async getTask(taskId: string): Promise<Task | null> {
    const task = this.taskDao.findById(taskId);
    return task || null;
  }

  /**
   * 根据状态获取任务
   */
  async getTasksByStatus(status: 'running' | 'stopped'): Promise<Task[]> {
    return this.taskDao.findByStatus(status);
  }

  /**
   * 根据账号ID获取任务
   */
  async getTasksByAccountId(accountId: string): Promise<Task[]> {
    return this.taskDao.findByAccountId(accountId);
  }

  /**
   * 验证任务配置
   */
  private validateTaskConfig(dto: CreateTaskDto): void {
    // 验证必需字段
    if (!dto.type) {
      throw new Error('任务类型不能为空');
    }

    if (!dto.accountIds || dto.accountIds.length === 0) {
      throw new Error('账号ID列表不能为空');
    }

    if (!dto.targetIds || dto.targetIds.length === 0) {
      throw new Error('目标ID列表不能为空');
    }

    if (!dto.config) {
      throw new Error('任务配置不能为空');
    }

    // 验证任务类型特定的配置
    if (dto.type === 'group_posting') {
      // 群组发送任务：验证间隔时间
      if (!dto.config.interval || dto.config.interval < 10) {
        throw new Error('发送间隔不能少于10分钟');
      }
    } else if (dto.type === 'channel_monitoring') {
      // 频道监听任务：验证评论概率
      if (dto.config.commentProbability !== undefined) {
        if (isNaN(dto.config.commentProbability)) {
          throw new Error('评论概率必须在0-1之间');
        }
        if (dto.config.commentProbability < 0 || dto.config.commentProbability > 1) {
          throw new Error('评论概率必须在0-1之间');
        }
      }
    }

    // 验证随机延迟
    if (dto.config.randomDelay !== undefined && dto.config.randomDelay < 0) {
      throw new Error('随机延迟不能为负数');
    }

    // 验证时间范围
    if (dto.config.timeRange) {
      const { start, end } = dto.config.timeRange;
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

      if (!timeRegex.test(start)) {
        throw new Error('开始时间格式无效，应为HH:mm');
      }

      if (!timeRegex.test(end)) {
        throw new Error('结束时间格式无效，应为HH:mm');
      }
    }
  }

  /**
   * 启动任务
   */
  async startTask(taskId: string): Promise<void> {
    const task = this.taskDao.findById(taskId);
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    if (task.status === 'running') {
      logger.warn(`任务已在运行: ${taskId}`);
      return;
    }

    logger.info(`启动任务: id=${taskId}, type=${task.type}`);

    // 更新任务状态
    this.taskDao.updateStatus(taskId, 'running');

    // 根据任务类型启动不同的执行器
    if (task.type === 'group_posting') {
      await this.startGroupPostingTask(task);
    } else if (task.type === 'channel_monitoring') {
      await this.startChannelMonitoringTask(task);
    }

    // 推送任务状态变化
    this.broadcastTaskStatus(taskId);

    logger.info(`任务启动成功: id=${taskId}`);
  }

  /**
   * 停止任务
   */
  async stopTask(taskId: string): Promise<void> {
    const task = this.taskDao.findById(taskId);
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    if (task.status === 'stopped') {
      logger.warn(`任务已停止: ${taskId}`);
      return;
    }

    logger.info(`停止任务: id=${taskId}`);

    // 更新任务状态
    this.taskDao.updateStatus(taskId, 'stopped');

    // 停止任务执行
    const context = this.taskContexts.get(taskId);
    if (context) {
      // 停止cron任务
      if (context.cronJob) {
        context.cronJob.stop();
      }

      // 停止频道监听
      if (task.type === 'channel_monitoring') {
        for (const accountId of task.accountIds) {
          for (const channelId of task.targetIds) {
            await this.messageService.stopListening(accountId, channelId);
          }
        }
      }

      // 移除任务上下文
      this.taskContexts.delete(taskId);
    }

    // 推送任务状态变化
    this.broadcastTaskStatus(taskId);

    logger.info(`任务停止成功: id=${taskId}`);
  }

  /**
   * 暂停任务（别名，实际调用stopTask）
   */
  async pauseTask(taskId: string): Promise<void> {
    return this.stopTask(taskId);
  }

  /**
   * 启动群组发送任务
   */
  private async startGroupPostingTask(task: Task): Promise<void> {
    const { interval } = task.config;

    // 计算cron表达式（每N分钟执行一次）
    const cronExpression = `*/${interval} * * * *`;

    // 创建cron任务
    const cronJob = cron.schedule(cronExpression, async () => {
      await this.executeGroupPostingTask(task.id);
    });

    // 保存任务上下文
    this.taskContexts.set(task.id, {
      task,
      cronJob,
      isExecuting: false,
      executionCount: 0,
      failureCount: 0,
    });

    // 立即执行一次
    await this.executeGroupPostingTask(task.id);

    logger.info(`群组发送任务已启动: id=${task.id}, interval=${interval}分钟`);
  }

  /**
   * 启动频道监听任务
   */
  private async startChannelMonitoringTask(task: Task): Promise<void> {
    // 为每个账号和频道组合设置监听
    for (const accountId of task.accountIds) {
      for (const channelId of task.targetIds) {
        await this.messageService.listenToChannel(accountId, channelId, async (message) => {
          await this.handleNewChannelMessage(task.id, accountId, channelId, message);
        });
      }
    }

    // 保存任务上下文
    this.taskContexts.set(task.id, {
      task,
      isExecuting: false,
      executionCount: 0,
      failureCount: 0,
    });

    logger.info(
      `频道监听任务已启动: id=${task.id}, accounts=${task.accountIds.length}, channels=${task.targetIds.length}`
    );
  }

  /**
   * 执行群组发送任务
   */
  private async executeGroupPostingTask(taskId: string): Promise<void> {
    const context = this.taskContexts.get(taskId);
    if (!context) {
      logger.warn(`任务上下文不存在: ${taskId}`);
      return;
    }

    // 检查是否正在执行
    if (context.isExecuting) {
      logger.debug(`任务正在执行中，跳过: ${taskId}`);
      return;
    }

    // 检查时间范围
    if (!this.isInTimeRange(context.task.config.timeRange)) {
      logger.debug(`当前时间不在任务执行范围内: ${taskId}`);
      return;
    }

    context.isExecuting = true;

    try {
      const { task } = context;
      logger.info(`执行群组发送任务: id=${taskId}`);

      // 随机选择一个账号
      const accountId = this.selectRandomAccount(task.accountIds);

      // 随机选择一个目标群组
      const targetId = this.selectRandomTarget(task.targetIds);

      // 检查账号锁
      if (!(await this.acquireAccountLock(accountId))) {
        logger.warn(`账号正在被其他任务使用: ${accountId}`);
        return;
      }

      try {
        // 生成消息内容（从模板）
        // 注意：这里简化实现，实际应该从任务配置中获取模板ID
        // 暂时使用固定的模板分类
        const templates = await this.templateService.getEnabledTemplates('group_message');
        if (templates.length === 0) {
          throw new Error('没有可用的群组消息模板');
        }

        const template = templates[Math.floor(Math.random() * templates.length)];
        if (!template) {
          throw new Error('无法选择模板');
        }
        const content = await this.templateService.generateContent(template.id);

        // 添加随机延迟
        if (task.config.randomDelay > 0) {
          const delayMs = Math.random() * task.config.randomDelay * 60 * 1000;
          logger.debug(`添加随机延迟: ${Math.round(delayMs / 1000)}秒`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        // 发送消息（使用任务配置的重试设置）
        const maxRetries = this.getMaxRetries(task);
        const result = await this.messageService.sendMessageWithRetry(
          {
            accountId,
            targetId,
            targetType: 'group',
            content,
          },
          maxRetries
        );

        if (result.success) {
          context.executionCount++;
          context.lastExecutionTime = new Date();

          // 记录执行历史
          this.taskExecutionDao.create({
            taskId,
            executedAt: new Date(),
            success: true,
            messageContent: content,
            accountId,
            targetId,
            retryCount: 0,
          });

          // 推送任务状态更新
          this.broadcastTaskStatus(taskId);

          logger.info(
            `✅ 群组消息发送成功: task=${taskId}, account=${accountId}, target=${targetId}`
          );
        } else {
          context.failureCount++;

          // 记录执行历史
          this.taskExecutionDao.create({
            taskId,
            executedAt: new Date(),
            success: false,
            messageContent: content,
            errorMessage: result.error?.message || '未知错误',
            accountId,
            targetId,
            retryCount: maxRetries - 1,
          });

          // 推送任务状态更新
          this.broadcastTaskStatus(taskId);

          logger.error(`❌ 群组消息发送失败: task=${taskId}, error=${result.error?.message}`);
        }
      } finally {
        // 释放账号锁
        this.releaseAccountLock(accountId);
      }
    } catch (error) {
      context.failureCount++;
      logger.error(`执行群组发送任务失败: ${taskId}`, error);
    } finally {
      context.isExecuting = false;
    }
  }

  /**
   * 处理频道新消息
   */
  private async handleNewChannelMessage(
    taskId: string,
    accountId: string,
    channelId: string,
    message: ChannelMessage
  ): Promise<void> {
    const context = this.taskContexts.get(taskId);
    if (!context) {
      logger.warn(`任务上下文不存在: ${taskId}`);
      return;
    }

    const { task } = context;

    try {
      logger.info(`收到频道新消息: task=${taskId}, channel=${channelId}, message=${message.id}`);

      // 检查评论概率
      const probability = task.config.commentProbability || 1.0;
      if (Math.random() > probability) {
        logger.debug(`根据概率跳过评论: probability=${probability}`);
        return;
      }

      // 检查是否已评论过
      const commentKey = `${accountId}:${channelId}`;
      if (!this.commentedMessages.has(commentKey)) {
        this.commentedMessages.set(commentKey, new Set());
      }

      const commentedSet = this.commentedMessages.get(commentKey)!;
      if (commentedSet.has(message.id)) {
        logger.debug(`消息已评论过，跳过: message=${message.id}`);
        return;
      }

      // 检查账号锁
      if (!(await this.acquireAccountLock(accountId))) {
        logger.warn(`账号正在被其他任务使用: ${accountId}`);
        return;
      }

      try {
        // 添加随机延迟（1-5分钟）
        const minDelay = 1 * 60 * 1000; // 1分钟
        const maxDelay = 5 * 60 * 1000; // 5分钟
        const delayMs = minDelay + Math.random() * (maxDelay - minDelay);
        logger.debug(`添加随机延迟: ${Math.round(delayMs / 1000)}秒`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // 生成评论内容（从模板）
        const templates = await this.templateService.getEnabledTemplates('channel_comment');
        if (templates.length === 0) {
          throw new Error('没有可用的频道评论模板');
        }

        const template = templates[Math.floor(Math.random() * templates.length)];
        if (!template) {
          throw new Error('无法选择模板');
        }
        const content = await this.templateService.generateContent(template.id);

        // 发送评论（使用任务配置的重试设置）
        const maxRetries = this.getMaxRetries(task);
        const result = await this.messageService.sendCommentWithRetry(
          {
            accountId,
            channelId,
            messageId: message.id,
            content,
          },
          maxRetries
        );

        if (result.success) {
          // 标记为已评论
          commentedSet.add(message.id);
          context.executionCount++;
          context.lastExecutionTime = new Date();

          // 记录执行历史
          this.taskExecutionDao.create({
            taskId,
            executedAt: new Date(),
            success: true,
            messageContent: content,
            targetMessageId: String(message.id),
            accountId,
            targetId: channelId,
            retryCount: 0,
          });

          logger.info(
            `✅ 频道评论发送成功: task=${taskId}, account=${accountId}, channel=${channelId}, message=${message.id}`
          );
        } else {
          context.failureCount++;

          // 记录执行历史
          this.taskExecutionDao.create({
            taskId,
            executedAt: new Date(),
            success: false,
            messageContent: content,
            errorMessage: result.error?.message || '未知错误',
            targetMessageId: String(message.id),
            accountId,
            targetId: channelId,
            retryCount: maxRetries - 1,
          });

          logger.error(`❌ 频道评论发送失败: task=${taskId}, error=${result.error?.message}`);
        }
      } finally {
        // 释放账号锁
        this.releaseAccountLock(accountId);
      }
    } catch (error) {
      context.failureCount++;
      logger.error(`处理频道新消息失败: ${taskId}`, error);
    }
  }

  /**
   * 检查当前时间是否在指定范围内
   */
  private isInTimeRange(timeRange?: { start: string; end: string }): boolean {
    if (!timeRange) {
      return true;
    }

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return currentTime >= timeRange.start && currentTime <= timeRange.end;
  }

  /**
   * 随机选择一个账号
   */
  private selectRandomAccount(accountIds: string[]): string {
    if (accountIds.length === 0) {
      throw new Error('账号列表为空');
    }
    return accountIds[Math.floor(Math.random() * accountIds.length)]!;
  }

  /**
   * 随机选择一个目标
   */
  private selectRandomTarget(targetIds: string[]): string {
    if (targetIds.length === 0) {
      throw new Error('目标列表为空');
    }
    return targetIds[Math.floor(Math.random() * targetIds.length)]!;
  }

  /**
   * 获取账号锁
   */
  private async acquireAccountLock(accountId: string): Promise<boolean> {
    if (this.accountLocks.get(accountId)) {
      return false;
    }

    this.accountLocks.set(accountId, true);
    return true;
  }

  /**
   * 释放账号锁
   */
  private releaseAccountLock(accountId: string): void {
    this.accountLocks.delete(accountId);
  }

  /**
   * 恢复运行中的任务（系统重启后调用）
   */
  async restoreRunningTasks(): Promise<void> {
    logger.info('恢复运行中的任务...');

    const runningTasks = this.taskDao.findByStatus('running');

    for (const task of runningTasks) {
      try {
        logger.info(`恢复任务: id=${task.id}, type=${task.type}`);

        if (task.type === 'group_posting') {
          await this.startGroupPostingTask(task);
        } else if (task.type === 'channel_monitoring') {
          await this.startChannelMonitoringTask(task);
        }

        logger.info(`任务恢复成功: id=${task.id}`);
      } catch (error) {
        logger.error(`恢复任务失败: id=${task.id}`, error);
      }
    }

    logger.info(`✅ 已恢复 ${runningTasks.length} 个运行中的任务`);
  }

  /**
   * 停止所有任务
   */
  async stopAllTasks(): Promise<void> {
    logger.info('停止所有任务...');

    const runningTasks = this.taskDao.findByStatus('running');

    for (const task of runningTasks) {
      try {
        await this.stopTask(task.id);
      } catch (error) {
        logger.error(`停止任务失败: id=${task.id}`, error);
      }
    }

    logger.info(`✅ 已停止 ${runningTasks.length} 个任务`);
  }

  /**
   * 获取任务统计信息
   */
  getTaskStats(taskId: string): {
    executionCount: number;
    failureCount: number;
    lastExecutionTime?: Date;
  } | null {
    const context = this.taskContexts.get(taskId);
    if (!context) {
      return null;
    }

    return {
      executionCount: context.executionCount,
      failureCount: context.failureCount,
      lastExecutionTime: context.lastExecutionTime,
    };
  }

  /**
   * 获取任务执行历史
   */
  async getTaskHistory(taskId: string, limit?: number) {
    return this.taskExecutionDao.findByTaskId(taskId, limit);
  }

  /**
   * 获取任务执行统计（从数据库）
   */
  async getTaskExecutionStats(taskId: string, days?: number) {
    return this.taskExecutionDao.getTaskStats(taskId, days);
  }

  /**
   * 获取账号执行统计
   */
  async getAccountExecutionStats(accountId: string, days?: number) {
    return this.taskExecutionDao.getAccountStats(accountId, days);
  }

  /**
   * 清理过期的执行历史
   */
  async cleanupOldExecutions(days: number = 30): Promise<number> {
    return this.taskExecutionDao.deleteOlderThanDays(days);
  }

  /**
   * 获取最近的执行记录
   */
  async getRecentExecutions(limit: number = 100) {
    return this.taskExecutionDao.findRecent(limit);
  }

  /**
   * 获取失败的执行记录
   */
  async getFailedExecutions(limit?: number) {
    return this.taskExecutionDao.findFailures(limit);
  }
}
