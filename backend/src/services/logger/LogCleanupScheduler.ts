import cron from 'node-cron';
import { LogService } from './LogService';
import { logger } from '../../utils/logger';

/**
 * 日志清理调度器
 * 定期清理过期日志
 */
export class LogCleanupScheduler {
  private task?: cron.ScheduledTask;

  constructor(
    private logService: LogService,
    private cronExpression: string = '0 2 * * *' // 默认每天凌晨2点执行
  ) {}

  /**
   * 启动调度器
   */
  start(): void {
    if (this.task) {
      logger.warn('日志清理调度器已经在运行');
      return;
    }

    this.task = cron.schedule(this.cronExpression, () => {
      this.runCleanup();
    });

    logger.info(`日志清理调度器已启动，执行计划: ${this.cronExpression}`);
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = undefined;
      logger.info('日志清理调度器已停止');
    }
  }

  /**
   * 执行清理
   */
  private runCleanup(): void {
    try {
      logger.info('开始执行日志清理任务');
      const deletedCount = this.logService.cleanup();
      logger.info(`日志清理任务完成，删除了 ${deletedCount} 条过期日志`);
    } catch (error) {
      logger.error('日志清理任务执行失败:', error);
    }
  }

  /**
   * 手动触发清理
   */
  triggerCleanup(): void {
    this.runCleanup();
  }

  /**
   * 检查调度器是否在运行
   */
  isRunning(): boolean {
    return this.task !== undefined;
  }
}
