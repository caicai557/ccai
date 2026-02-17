import Database from 'better-sqlite3';
import * as cron from 'node-cron';
import { TaskDao } from '../../database/dao/TaskDao';
import { TaskExecutionDao } from '../../database/dao/TaskExecutionDao';
import { TargetDao } from '../../database/dao/TargetDao';
import {
  CreateTaskDto,
  PrecheckPolicy,
  Task,
  TaskBlockedPair,
  TaskPrecheckSummary,
  TaskReadyPair,
  TaskStartResult,
} from '../../types/task';
import { MessageService } from '../message/MessageService';
import { TemplateService } from '../template/TemplateService';
import {
  TargetAccessCheckInput,
  TargetAccessCheckResult,
  TargetAccessService,
} from '../target/TargetAccessService';
import { logger } from '../../utils/logger';
import { wsManager } from '../../routes/ws';

/**
 * 任务执行上下文
 */
interface TaskExecutionContext {
  task: Task;
  readyPairs: TaskReadyPair[];
  blockedPairs: TaskBlockedPair[];
  cronJob?: cron.ScheduledTask;
  isExecuting: boolean;
  lastExecutionTime?: Date;
  executionCount: number;
  failureCount: number;
}

interface ChannelMessage {
  id: number;
  commentEnabled?: boolean;
}

interface TargetAccessChecker {
  checkAndPrepare(input: TargetAccessCheckInput): Promise<TargetAccessCheckResult>;
}

interface TaskServiceDeps {
  targetAccessService?: TargetAccessChecker;
}

/**
 * 任务管理器
 * 负责任务的创建、调度、执行和状态管理
 */
export class TaskService {
  private taskDao: TaskDao;
  private taskExecutionDao: TaskExecutionDao;
  private targetDao: TargetDao;
  private targetAccessService: TargetAccessChecker;
  private messageService: MessageService;
  private templateService: TemplateService;

  // 任务执行上下文映射
  private taskContexts: Map<string, TaskExecutionContext> = new Map();

  // 账号锁（用于同账号任务互斥）
  private accountLocks: Map<string, boolean> = new Map();

  // 已评论的消息ID集合（用于评论去重）
  private commentedMessages: Map<string, Set<number>> = new Map();

  constructor(db: Database.Database, deps: TaskServiceDeps = {}) {
    this.taskDao = new TaskDao(db);
    this.taskExecutionDao = new TaskExecutionDao(db);
    this.targetDao = new TargetDao(db);
    this.targetAccessService = deps.targetAccessService || new TargetAccessService(this.targetDao);
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
    return this.createTaskSync(dto);
  }

  createTaskSync(dto: CreateTaskDto): Task {
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
  async startTask(taskId: string): Promise<TaskStartResult> {
    const task = this.taskDao.findById(taskId);
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    if (task.status === 'running') {
      logger.warn(`任务已在运行: ${taskId}`);
      const precheck = this.buildEmptyPrecheck(
        task.config.precheckPolicy || 'partial',
        task.config.autoJoinEnabled !== false
      );
      return {
        started: true,
        message: '任务已在运行',
        precheck,
      };
    }

    logger.info(`启动任务: id=${taskId}, type=${task.type}`);

    const precheck = await this.precheckTaskAccess(task);
    if (precheck.readyPairs.length === 0) {
      const reasonSummary = this.formatBlockedReasons(precheck.blockedReasons);
      throw new Error(`任务预检失败: 无可用账号-目标组合 (${reasonSummary})`);
    }

    if (precheck.policy === 'strict' && precheck.blockedPairs.length > 0) {
      const reasonSummary = this.formatBlockedReasons(precheck.blockedReasons);
      throw new Error(`任务预检失败: strict策略下存在不可用账号-目标组合 (${reasonSummary})`);
    }

    // 更新任务状态
    this.taskDao.updateStatus(taskId, 'running');

    // 根据任务类型启动不同的执行器
    if (task.type === 'group_posting') {
      await this.startGroupPostingTask(task, precheck);
    } else if (task.type === 'channel_monitoring') {
      await this.startChannelMonitoringTask(task, precheck);
    }

    // 推送任务状态变化
    this.broadcastTaskStatus(taskId);

    logger.info(`任务启动成功: id=${taskId}`);
    return {
      started: true,
      message: '任务启动成功',
      precheck,
    };
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
        const pairs =
          context.readyPairs.length > 0
            ? context.readyPairs
            : task.accountIds.flatMap((accountId) =>
                task.targetIds.map((targetId) => ({
                  accountId,
                  targetId,
                  telegramId: this.resolveTelegramTargetId(targetId),
                }))
              );

        for (const pair of pairs) {
          await this.messageService.stopListening(pair.accountId, pair.telegramId);
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
  private async startGroupPostingTask(task: Task, precheck: TaskPrecheckSummary): Promise<void> {
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
      readyPairs: precheck.readyPairs,
      blockedPairs: precheck.blockedPairs,
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
  private async startChannelMonitoringTask(
    task: Task,
    precheck: TaskPrecheckSummary
  ): Promise<void> {
    // 为每个可用账号和频道组合设置监听
    for (const pair of precheck.readyPairs) {
      await this.messageService.listenToChannel(
        pair.accountId,
        pair.telegramId,
        async (message) => {
          await this.handleNewChannelMessage(task.id, pair, message);
        }
      );
    }

    // 保存任务上下文
    this.taskContexts.set(task.id, {
      task,
      readyPairs: precheck.readyPairs,
      blockedPairs: precheck.blockedPairs,
      isExecuting: false,
      executionCount: 0,
      failureCount: 0,
    });

    logger.info(`频道监听任务已启动: id=${task.id}, readyPairs=${precheck.readyPairs.length}`);
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

      if (context.readyPairs.length === 0) {
        logger.warn(`任务无可用账号-目标组合，跳过执行: ${taskId}`);
        return;
      }

      // 随机选择一个可用组合
      const pair = this.selectRandomReadyPair(context.readyPairs);
      const accountId = pair.accountId;
      const targetId = pair.targetId;
      const telegramTargetId = pair.telegramId;

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
            targetId: telegramTargetId,
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
            `✅ 群组消息发送成功: task=${taskId}, account=${accountId}, target=${telegramTargetId}`
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

          if (result.error?.code === 'PERMISSION_DENIED') {
            this.blockReadyPair(
              context,
              {
                accountId,
                targetId,
                telegramId: telegramTargetId,
                code: 'TARGET_WRITE_FORBIDDEN',
                message: result.error.message || '账号没有发言权限',
                autoJoinAttempted: false,
              },
              taskId
            );
          }

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
    pair: TaskReadyPair,
    message: ChannelMessage
  ): Promise<void> {
    const context = this.taskContexts.get(taskId);
    if (!context) {
      logger.warn(`任务上下文不存在: ${taskId}`);
      return;
    }

    const { task } = context;
    const accountId = pair.accountId;
    const targetId = pair.targetId;
    const channelId = pair.telegramId;

    try {
      logger.info(`收到频道新消息: task=${taskId}, channel=${channelId}, message=${message.id}`);

      if (message.commentEnabled === false) {
        logger.warn(
          `频道消息未开启评论，跳过: task=${taskId}, channel=${channelId}, message=${message.id}`
        );
        return;
      }

      // 检查评论概率
      const probability = task.config.commentProbability || 1.0;
      if (Math.random() > probability) {
        logger.debug(`根据概率跳过评论: probability=${probability}`);
        return;
      }

      // 检查是否已评论过
      const commentKey = `${accountId}:${targetId}`;
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
        // 添加随机延迟（分钟），由任务配置控制；为0时立即评论
        const maxDelayMinutes = Math.max(0, task.config.randomDelay || 0);
        const delayMs = maxDelayMinutes > 0 ? Math.random() * maxDelayMinutes * 60 * 1000 : 0;

        if (delayMs > 0) {
          logger.debug(`添加随机延迟: ${Math.round(delayMs / 1000)}秒`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          logger.debug('未配置评论随机延迟，立即执行评论');
        }

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
            targetId,
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
            targetId,
            retryCount: maxRetries - 1,
          });

          if (result.error?.code === 'PERMISSION_DENIED') {
            this.blockReadyPair(
              context,
              {
                accountId,
                targetId,
                telegramId: channelId,
                code: 'TARGET_WRITE_FORBIDDEN',
                message: result.error.message || '账号没有评论权限',
                autoJoinAttempted: false,
              },
              taskId
            );
          }

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

  private selectRandomReadyPair(readyPairs: TaskReadyPair[]): TaskReadyPair {
    if (readyPairs.length === 0) {
      throw new Error('可用目标组合为空');
    }
    return readyPairs[Math.floor(Math.random() * readyPairs.length)]!;
  }

  private blockReadyPair(
    context: TaskExecutionContext,
    blockedPair: TaskBlockedPair,
    taskId: string
  ): void {
    context.readyPairs = context.readyPairs.filter(
      (pair) =>
        !(pair.accountId === blockedPair.accountId && pair.targetId === blockedPair.targetId)
    );

    const exists = context.blockedPairs.some(
      (pair) => pair.accountId === blockedPair.accountId && pair.targetId === blockedPair.targetId
    );
    if (!exists) {
      context.blockedPairs.push(blockedPair);
    }

    logger.warn(
      `任务组合已阻塞: task=${taskId}, account=${blockedPair.accountId}, target=${blockedPair.targetId}, code=${blockedPair.code}`
    );
  }

  private buildEmptyPrecheck(
    policy: PrecheckPolicy,
    autoJoinEnabled: boolean
  ): TaskPrecheckSummary {
    return {
      policy,
      autoJoinEnabled,
      readyPairs: [],
      blockedPairs: [],
      blockedReasons: {},
    };
  }

  private async precheckTaskAccess(task: Task): Promise<TaskPrecheckSummary> {
    const policy: PrecheckPolicy = task.config.precheckPolicy || 'partial';
    const autoJoinEnabled = task.config.autoJoinEnabled !== false;
    const precheck = this.buildEmptyPrecheck(policy, autoJoinEnabled);

    for (const accountId of task.accountIds) {
      for (const targetId of task.targetIds) {
        const result = await this.targetAccessService.checkAndPrepare({
          accountId,
          targetId,
          taskType: task.type,
          autoJoinEnabled,
        });

        if (result.readyPair) {
          precheck.readyPairs.push(result.readyPair);
          continue;
        }

        if (result.blockedPair) {
          precheck.blockedPairs.push(result.blockedPair);
        }
      }
    }

    precheck.blockedReasons = this.collectBlockedReasons(precheck.blockedPairs);
    logger.info(
      `任务预检结果: task=${task.id}, ready=${precheck.readyPairs.length}, blocked=${precheck.blockedPairs.length}, reasons=${JSON.stringify(precheck.blockedReasons)}`
    );
    return precheck;
  }

  private collectBlockedReasons(blockedPairs: TaskBlockedPair[]): Record<string, number> {
    const reasonMap: Record<string, number> = {};

    for (const pair of blockedPairs) {
      const current = reasonMap[pair.code] || 0;
      reasonMap[pair.code] = current + 1;
    }

    return reasonMap;
  }

  private formatBlockedReasons(blockedReasons: Record<string, number>): string {
    const entries = Object.entries(blockedReasons);
    if (entries.length === 0) {
      return 'NO_BLOCK_REASON';
    }

    return entries.map(([code, count]) => `${code}=${count}`).join(', ');
  }

  /**
   * 解析任务目标ID为Telegram可识别目标
   * 兼容两种存储：内部目标ID / 直接telegramId
   */
  private resolveTelegramTargetId(targetId: string): string {
    const target = this.targetDao.findById(targetId);
    if (!target) {
      return targetId;
    }

    const telegramId = target.telegramId?.trim();
    return telegramId || targetId;
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
    let restoredCount = 0;
    let stoppedCount = 0;

    for (const task of runningTasks) {
      try {
        logger.info(`恢复任务: id=${task.id}, type=${task.type}`);

        const precheck = await this.precheckTaskAccess(task);
        if (precheck.readyPairs.length === 0) {
          logger.warn(`恢复任务失败（无可用组合），将任务置为停止: ${task.id}`);
          this.taskDao.updateStatus(task.id, 'stopped');
          this.broadcastTaskStatus(task.id);
          stoppedCount++;
          continue;
        }

        if (precheck.policy === 'strict' && precheck.blockedPairs.length > 0) {
          logger.warn(`恢复任务失败（strict策略存在阻塞组合），将任务置为停止: ${task.id}`);
          this.taskDao.updateStatus(task.id, 'stopped');
          this.broadcastTaskStatus(task.id);
          stoppedCount++;
          continue;
        }

        if (task.type === 'group_posting') {
          await this.startGroupPostingTask(task, precheck);
        } else if (task.type === 'channel_monitoring') {
          await this.startChannelMonitoringTask(task, precheck);
        }

        logger.info(`任务恢复成功: id=${task.id}`);
        restoredCount++;
      } catch (error) {
        logger.error(`恢复任务失败: id=${task.id}`, error);
      }
    }

    logger.info(
      `✅ 任务恢复完成: 原运行=${runningTasks.length}, 成功恢复=${restoredCount}, 已停止=${stoppedCount}`
    );
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
