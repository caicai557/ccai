import fs from 'fs';
import path from 'path';
import {
  AccountProfileBatchJob,
  AccountProfileBatchJobDetail,
  AccountProfileBatchJobItem,
  AccountProfileBatchJobStatus,
  AccountProfileThrottlePreset,
  CreateAccountProfileBatchJobDto,
} from '../../types';
import { DaoFactory } from '../../database/dao';
import { AccountService } from '../AccountService';
import { logger } from '../../utils/logger';
import { getDatabaseConfig } from '../../config';

interface UploadedAvatarFile {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

interface CreateJobInput extends CreateAccountProfileBatchJobDto {
  avatarFiles?: UploadedAvatarFile[];
}

interface BatchServiceDeps {
  accountService?: Pick<AccountService, 'getClient'>;
}

interface RenderContext {
  index: number;
  phoneLast4: string;
}

type ProfileOperationError = Error & {
  code?: string;
  retryAfterSeconds?: number;
};

const ALLOWED_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_AVATAR_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

export class AccountProfileBatchService {
  private readonly daoFactory = DaoFactory.getInstance();
  private readonly accountDao = this.daoFactory.getAccountDao();
  private readonly jobDao = this.daoFactory.getAccountProfileJobDao();
  private readonly itemDao = this.daoFactory.getAccountProfileJobItemDao();
  private readonly accountService: Pick<AccountService, 'getClient'>;
  private readonly avatarRootDir: string;
  private consumerRunning = false;
  private consumerScheduled = false;

  constructor(deps: BatchServiceDeps = {}) {
    this.accountService = deps.accountService || new AccountService();
    this.avatarRootDir = path.resolve(path.dirname(getDatabaseConfig().path), 'account-profile-avatars');
    fs.mkdirSync(this.avatarRootDir, { recursive: true });
  }

  isEnabled(): boolean {
    if (process.env['NODE_ENV'] === 'test') {
      return true;
    }
    return (process.env['ACCOUNT_PROFILE_BATCH_ENABLED'] || 'false').toLowerCase() === 'true';
  }

  async createJob(input: CreateJobInput): Promise<AccountProfileBatchJob> {
    this.assertEnabled();

    const accountIds = this.normalizeAccountIds(input.accountIds);
    if (accountIds.length === 0) {
      throw new Error('accountIds 不能为空');
    }

    const firstNameTemplate = this.normalizeTemplate(input.firstNameTemplate);
    const lastNameTemplate = this.normalizeTemplate(input.lastNameTemplate);
    const bioTemplate = this.normalizeTemplate(input.bioTemplate);
    const throttlePreset = this.normalizeThrottlePreset(input.throttlePreset);
    const retryLimit = this.normalizeRetryLimit(input.retryLimit);
    const avatarFiles = input.avatarFiles || [];

    if (!firstNameTemplate && !lastNameTemplate && !bioTemplate && avatarFiles.length === 0) {
      throw new Error('至少需要填写一个资料字段或上传头像素材');
    }

    const accounts = accountIds.map((id) => {
      const account = this.accountDao.findById(id);
      if (!account) {
        throw new Error(`账号不存在: ${id}`);
      }
      return account;
    });

    const job = this.jobDao.create({
      status: 'pending',
      firstNameTemplate,
      lastNameTemplate,
      bioTemplate,
      avatarFiles: [],
      throttlePreset,
      retryLimit,
      summary: {
        total: accountIds.length,
        pending: accountIds.length,
        running: 0,
        success: 0,
        failed: 0,
        cancelled: 0,
        skipped: 0,
      },
    });

    const savedAvatarFiles = await this.persistAvatarFiles(job.id, avatarFiles);
    if (savedAvatarFiles.length > 0) {
      this.jobDao.update(job.id, { avatarFiles: savedAvatarFiles });
    }

    const maxAttempts = retryLimit + 1;
    let avatarCursor = 0;
    const items = accounts.map((account, index) => {
      const isBlocked = account.poolStatus === 'banned' || account.poolStatus === 'cooldown';
      let avatarFile: string | undefined;
      if (!isBlocked && savedAvatarFiles.length > 0) {
        avatarFile = savedAvatarFiles[avatarCursor % savedAvatarFiles.length];
        avatarCursor += 1;
      }

      return {
        jobId: job.id,
        accountId: account.id,
        itemIndex: index + 1,
        status: (isBlocked ? 'skipped' : 'pending') as AccountProfileBatchJobItem['status'],
        maxAttempts,
        avatarFile,
        errorCode: isBlocked ? 'POOL_STATUS_BLOCKED' : undefined,
        errorMessage: isBlocked ? `账号池状态为 ${account.poolStatus}，已跳过` : undefined,
      };
    });

    this.itemDao.createMany(items);
    const summary = this.refreshSummary(job.id);

    if (summary.pending === 0 && summary.running === 0) {
      this.jobDao.updateStatus(job.id, 'completed');
    } else {
      this.scheduleConsumer();
    }

    logger.info(
      `[ACCOUNT_PROFILE_JOB_CREATED] jobId=${job.id} total=${summary.total} pending=${summary.pending}`
    );

    this.jobDao.cleanupHistory(30);
    return this.getJob(job.id).job;
  }

  listJobs(query: {
    status?: AccountProfileBatchJobStatus;
    page?: number;
    pageSize?: number;
  }): { items: AccountProfileBatchJob[]; total: number; page: number; pageSize: number } {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const result = this.jobDao.list({
      status: query.status,
      page,
      pageSize,
    });

    return {
      items: result.items,
      total: result.total,
      page,
      pageSize,
    };
  }

  getJob(jobId: string): AccountProfileBatchJobDetail {
    const job = this.jobDao.findById(jobId);
    if (!job) {
      throw new Error('批次不存在');
    }
    const items = this.itemDao.findByJobId(jobId);
    return { job, items };
  }

  cancelJob(jobId: string): AccountProfileBatchJob {
    this.assertEnabled();

    const job = this.jobDao.findById(jobId);
    if (!job) {
      throw new Error('批次不存在');
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(`当前状态不可取消: ${job.status}`);
    }

    this.jobDao.updateStatus(jobId, 'cancelled');
    this.itemDao.cancelPendingByJobId(jobId);
    this.refreshSummary(jobId);

    logger.info(`[ACCOUNT_PROFILE_JOB_CANCELLED] jobId=${jobId}`);
    return this.getJob(jobId).job;
  }

  private assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new Error('账号资料批量功能未启用');
    }
  }

  private scheduleConsumer(): void {
    if (this.consumerRunning || this.consumerScheduled) {
      return;
    }

    this.consumerScheduled = true;
    setTimeout(() => {
      this.consumerScheduled = false;
      void this.consumePendingItems().catch((error) => {
        if (this.isDatabaseClosedError(error)) {
          return;
        }
        logger.error('账号资料批次消费者异常', error);
      });
    }, process.env['NODE_ENV'] === 'test' ? 0 : 300);
  }

  private async consumePendingItems(): Promise<void> {
    if (this.consumerRunning) {
      return;
    }
    this.consumerRunning = true;

    try {
      for (;;) {
        let jobId: string | undefined;
        try {
          jobId = this.itemDao.findNextPendingJobId();
        } catch (error) {
          if (this.isDatabaseClosedError(error)) {
            break;
          }
          throw error;
        }

        if (!jobId) {
          break;
        }

        const job = this.jobDao.findById(jobId);
        if (!job) {
          continue;
        }
        try {
          await this.processJob(job);
        } catch (error) {
          if (this.isDatabaseClosedError(error)) {
            break;
          }
          throw error;
        }
      }
    } finally {
      this.consumerRunning = false;
      let hasPending = false;
      try {
        hasPending = Boolean(this.itemDao.findNextPendingJobId());
      } catch (error) {
        if (!this.isDatabaseClosedError(error)) {
          logger.error('检查批次待处理项失败', error);
        }
        hasPending = false;
      }
      if (hasPending) {
        this.scheduleConsumer();
      }
    }
  }

  private async processJob(job: AccountProfileBatchJob): Promise<void> {
    this.jobDao.markStarted(job.id);

    for (;;) {
      const current = this.jobDao.findById(job.id);
      if (!current) {
        return;
      }
      if (current.status === 'cancelled') {
        this.itemDao.cancelPendingByJobId(job.id);
        this.refreshSummary(job.id);
        return;
      }

      const nextItem = this.itemDao.findNextPendingItem(job.id);
      if (!nextItem) {
        break;
      }

      await this.processItem(current, nextItem);
      const summary = this.refreshSummary(job.id);
      if (summary.pending === 0 && summary.running === 0) {
        break;
      }
      await this.sleep(this.getDelayMs(current.throttlePreset));
    }

    const latest = this.jobDao.findById(job.id);
    if (!latest) {
      return;
    }

    const summary = this.refreshSummary(job.id);
    if (latest.status === 'cancelled') {
      return;
    }

    if (summary.pending === 0 && summary.running === 0) {
      const status =
        summary.success > 0 || summary.skipped > 0 || summary.cancelled > 0 ? 'completed' : 'failed';
      this.jobDao.updateStatus(job.id, status);
    } else {
      this.jobDao.updateStatus(job.id, 'running');
    }
  }

  private async processItem(
    job: AccountProfileBatchJob,
    item: AccountProfileBatchJobItem
  ): Promise<void> {
    const account = this.accountDao.findById(item.accountId);
    if (!account) {
      this.finishItem(item.id, 'failed', {
        attempt: item.attempt + 1,
        errorCode: 'ACCOUNT_NOT_FOUND',
        errorMessage: '账号不存在',
      });
      return;
    }

    if (account.poolStatus === 'banned' || account.poolStatus === 'cooldown') {
      this.finishItem(item.id, 'skipped', {
        attempt: item.attempt + 1,
        errorCode: 'POOL_STATUS_BLOCKED',
        errorMessage: `账号池状态为 ${account.poolStatus}，已跳过`,
      });
      return;
    }

    const nextAttempt = item.attempt + 1;
    const running = this.itemDao.markRunning(item.id, nextAttempt);
    if (!running) {
      return;
    }

    const context: RenderContext = {
      index: running.itemIndex,
      phoneLast4: this.extractPhoneLast4(account.phoneNumber),
    };

    const firstName = this.renderTemplate(job.firstNameTemplate, context);
    const lastName = this.renderTemplate(job.lastNameTemplate, context);
    const bio = this.renderTemplate(job.bioTemplate, context);

    try {
      const client = await this.accountService.getClient(account.id);

      if (firstName !== undefined || lastName !== undefined || bio !== undefined) {
        await client.updateSelfProfile({
          firstName,
          lastName,
          bio,
        });
      }

      if (running.avatarFile) {
        await client.updateSelfAvatar({
          fileName: path.basename(running.avatarFile),
          filePath: running.avatarFile,
        });
      }

      this.accountDao.update(account.id, {
        firstName: firstName ?? account.firstName,
        lastName: lastName ?? account.lastName,
        lastActive: new Date().toISOString() as unknown as Date,
      });

      this.finishItem(item.id, 'success', {
        attempt: nextAttempt,
        appliedFirstName: firstName,
        appliedLastName: lastName,
        appliedBio: bio,
      });
    } catch (error) {
      const parsed = this.parseProfileError(error);
      const shouldRetry = nextAttempt < running.maxAttempts;

      if (shouldRetry) {
        this.itemDao.update(item.id, {
          status: 'pending',
          attempt: nextAttempt,
          errorCode: parsed.code,
          errorMessage: parsed.message,
        });
        logger.warn(
          `[ACCOUNT_PROFILE_ITEM_RETRY] jobId=${job.id} itemId=${item.id} attempt=${nextAttempt} code=${parsed.code}`
        );
        return;
      }

      this.finishItem(item.id, 'failed', {
        attempt: nextAttempt,
        errorCode: parsed.code,
        errorMessage: parsed.message,
      });
    }
  }

  private finishItem(
    itemId: string,
    status: AccountProfileBatchJobItem['status'],
    payload: {
      attempt: number;
      errorCode?: string;
      errorMessage?: string;
      appliedFirstName?: string;
      appliedLastName?: string;
      appliedBio?: string;
    }
  ): void {
    this.itemDao.update(itemId, {
      status,
      attempt: payload.attempt,
      errorCode: payload.errorCode,
      errorMessage: payload.errorMessage,
      appliedFirstName: payload.appliedFirstName,
      appliedLastName: payload.appliedLastName,
      appliedBio: payload.appliedBio,
      finishedAt: new Date().toISOString(),
    });
  }

  private refreshSummary(jobId: string): AccountProfileBatchJob['summary'] {
    const summary = this.itemDao.getSummaryByJobId(jobId);
    this.jobDao.update(jobId, { summary });
    return summary;
  }

  private normalizeAccountIds(accountIds?: string[]): string[] {
    if (!Array.isArray(accountIds)) {
      return [];
    }
    const deduped = new Set<string>();
    for (const accountId of accountIds) {
      const normalized = String(accountId || '').trim();
      if (normalized) {
        deduped.add(normalized);
      }
    }
    return Array.from(deduped);
  }

  private normalizeTemplate(template?: string): string | undefined {
    if (template === undefined) {
      return undefined;
    }
    const normalized = template.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private normalizeThrottlePreset(preset?: AccountProfileThrottlePreset): AccountProfileThrottlePreset {
    if (preset === 'balanced' || preset === 'fast') {
      return preset;
    }
    return 'conservative';
  }

  private normalizeRetryLimit(retryLimit?: number): number {
    const value = Number(retryLimit ?? 1);
    if (!Number.isFinite(value)) {
      return 1;
    }
    return Math.max(0, Math.min(3, Math.floor(value)));
  }

  private renderTemplate(template: string | undefined, context: RenderContext): string | undefined {
    if (!template) {
      return undefined;
    }
    const rendered = template
      .replace(/\{index\}/g, String(context.index))
      .replace(/\{phoneLast4\}/g, context.phoneLast4)
      .trim();
    return rendered.length > 0 ? rendered : undefined;
  }

  private extractPhoneLast4(phoneNumber: string): string {
    const digits = phoneNumber.replace(/\D/g, '');
    return digits.slice(-4) || digits;
  }

  private async persistAvatarFiles(jobId: string, files: UploadedAvatarFile[]): Promise<string[]> {
    if (files.length === 0) {
      return [];
    }

    const jobDir = path.join(this.avatarRootDir, jobId);
    await fs.promises.mkdir(jobDir, { recursive: true });

    const savedPaths: string[] = [];
    for (const [index, file] of files.entries()) {
      this.validateAvatar(file);

      const originalExt = path.extname(file.originalName).toLowerCase();
      const safeBaseName = path
        .basename(file.originalName, originalExt)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 32);
      const finalName = `${String(index + 1).padStart(2, '0')}-${Date.now()}-${safeBaseName}${originalExt}`;
      const finalPath = path.join(jobDir, finalName);
      await fs.promises.writeFile(finalPath, file.buffer);
      savedPaths.push(finalPath);
    }

    return savedPaths;
  }

  private validateAvatar(file: UploadedAvatarFile): void {
    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.mimeType.toLowerCase())) {
      throw new Error(`头像 MIME 类型不支持: ${file.mimeType}`);
    }

    const ext = path.extname(file.originalName).toLowerCase();
    if (!ALLOWED_AVATAR_EXTS.has(ext)) {
      throw new Error(`头像文件后缀不支持: ${ext || 'unknown'}`);
    }

    if (file.size <= 0 || file.size > MAX_AVATAR_SIZE) {
      throw new Error('头像文件大小必须在 0-5MB 之间');
    }
  }

  private parseProfileError(error: unknown): { code: string; message: string } {
    const err = error as ProfileOperationError;
    const code = String(err.code || 'UNKNOWN_ERROR');
    const message = String(err.message || '资料更新失败');
    return { code, message };
  }

  private getDelayMs(preset: AccountProfileThrottlePreset): number {
    if (process.env['NODE_ENV'] === 'test') {
      return 0;
    }

    const [min, max] =
      preset === 'fast' ? [500, 1000] : preset === 'balanced' ? [5000, 10000] : [20000, 40000];
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private isDatabaseClosedError(error: unknown): boolean {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    return message.includes('database connection is not open');
  }
}
