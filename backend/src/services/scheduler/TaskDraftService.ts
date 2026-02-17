import {
  AccountDao,
  DiscoveryCandidateDao,
  TargetDao,
  TaskDraftDao,
  TemplateDao,
} from '../../database/dao';
import {
  ConfirmTaskDraftDto,
  CreateTaskDraftDto,
  DiscoverySourceType,
  Task,
  TaskConfig,
  TaskDraft,
} from '../../types';
import { TaskService } from './TaskService';
import { logger } from '../../utils/logger';

interface TaskDraftListQuery {
  status?: 'pending' | 'confirmed' | 'rejected';
  runId?: string;
  sourceType?: DiscoverySourceType;
  page?: number;
  pageSize?: number;
}

interface CreateDraftResult {
  created: TaskDraft[];
  duplicated: Array<{ candidateId: string; draftId: string }>;
  failed: Array<{ candidateId: string; reason: string }>;
}

export class TaskDraftService {
  constructor(
    private readonly taskDraftDao: TaskDraftDao,
    private readonly candidateDao: DiscoveryCandidateDao,
    private readonly targetDao: TargetDao,
    private readonly templateDao: TemplateDao,
    private readonly accountDao: AccountDao,
    private readonly taskService: TaskService
  ) {}

  createDrafts(payload: CreateTaskDraftDto): CreateDraftResult {
    const candidateIds = Array.from(new Set((payload.candidateIds || []).map((item) => String(item))));
    const created: TaskDraft[] = [];
    const duplicated: Array<{ candidateId: string; draftId: string }> = [];
    const failed: Array<{ candidateId: string; reason: string }> = [];

    for (const candidateId of candidateIds) {
      const candidate = this.candidateDao.findById(candidateId);
      if (!candidate) {
        failed.push({ candidateId, reason: '候选不存在' });
        continue;
      }

      if (candidate.status !== 'accepted') {
        failed.push({ candidateId, reason: '仅 accepted 候选可生成草稿' });
        continue;
      }

      const existed = this.taskDraftDao.findActiveByCandidateId(candidateId);
      if (existed) {
        duplicated.push({ candidateId, draftId: existed.id });
        continue;
      }

      const target = this.targetDao.findByTelegramId(candidate.telegramId);
      if (!target) {
        failed.push({ candidateId, reason: '候选未找到对应目标，请先完成入库' });
        continue;
      }

      const taskType = candidate.type === 'group' ? 'group_posting' : 'channel_monitoring';
      const sourceType = candidate.sourceType;
      const accountIds = this.resolveCandidateAccountIds(candidate.accountId, payload.accountIds);
      if (accountIds.length === 0) {
        failed.push({ candidateId, reason: '草稿无可用账号' });
        continue;
      }
      const config = this.buildDefaultConfig(taskType);

      let draft: TaskDraft;
      try {
        draft = this.taskDraftDao.create({
          candidateId,
          targetId: target.id,
          taskType,
          accountIds,
          templateId: payload.templateId || undefined,
          config,
          priority: this.clampPriority(payload.priority),
          status: 'pending',
          runId: candidate.runId,
          sourceType,
          indexBotUsername: candidate.indexBotUsername,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '创建草稿失败';
        if (message.includes('UNIQUE constraint failed')) {
          const duplicatedDraft = this.taskDraftDao.findActiveByCandidateId(candidateId);
          if (duplicatedDraft) {
            duplicated.push({ candidateId, draftId: duplicatedDraft.id });
            continue;
          }
        }
        failed.push({ candidateId, reason: message });
        continue;
      }

      logger.info(
        `[TASK_DRAFT_CREATED] draftId=${draft.id} candidateId=${candidateId} runId=${draft.runId || '-'} sourceType=${sourceType}`
      );
      created.push(draft);
    }

    return { created, duplicated, failed };
  }

  list(query: TaskDraftListQuery): { items: TaskDraft[]; total: number } {
    return this.taskDraftDao.list(query);
  }

  getDailyStats(days: number): ReturnType<TaskDraftDao['getDailyStats']> {
    return this.taskDraftDao.getDailyStats(days);
  }

  getSourceFailureStats(days: number): ReturnType<TaskDraftDao['getSourceFailureStats']> {
    return this.taskDraftDao.getSourceFailureStats(days);
  }

  async confirmDraft(draftId: string, payload: ConfirmTaskDraftDto): Promise<{ draft: TaskDraft; task: Task }> {
    const result = this.taskDraftDao.runInImmediateTransaction(() => {
      const draft = this.taskDraftDao.findById(draftId);
      if (!draft) {
        throw new Error('任务草稿不存在');
      }
      if (draft.status !== 'pending') {
        throw new Error('仅 pending 草稿可确认');
      }

      const target = this.targetDao.findById(draft.targetId);
      if (!target) {
        throw new Error('草稿目标不存在');
      }

      const accountIds = this.resolveValidAccountIds(payload.accountIds || draft.accountIds);
      if (accountIds.length === 0) {
        throw new Error('草稿可用账号为空');
      }

      const templateCategory = draft.taskType === 'group_posting' ? 'group_message' : 'channel_comment';
      const templateId = this.resolveTemplateId(payload.templateId || draft.templateId, templateCategory);
      const config = this.mergeConfig(draft.taskType, draft.config, payload.config, templateId);
      const priority = this.clampPriority(payload.priority ?? draft.priority);

      const task = this.taskService.createTaskSync({
        type: draft.taskType,
        accountIds,
        targetIds: [draft.targetId],
        config,
        priority,
      });

      const updated = this.taskDraftDao.updateIfStatus(draftId, 'pending', {
        accountIds,
        templateId,
        config,
        priority,
        status: 'confirmed',
        confirmedTaskId: task.id,
        reason: undefined,
      });

      if (!updated) {
        throw new Error('任务草稿状态冲突，请刷新后重试');
      }

      return { draft: updated, task };
    });

    logger.info(
      `[TASK_DRAFT_CONFIRMED] draftId=${draftId} taskId=${result.task.id} runId=${result.draft.runId || '-'} sourceType=${result.draft.sourceType}`
    );

    return result;
  }

  rejectDraft(draftId: string, reason?: string): TaskDraft {
    const draft = this.taskDraftDao.findById(draftId);
    if (!draft) {
      throw new Error('任务草稿不存在');
    }
    if (draft.status !== 'pending') {
      throw new Error('仅 pending 草稿可拒绝');
    }

    const updated = this.taskDraftDao.updateIfStatus(draftId, 'pending', {
      status: 'rejected',
      reason: (reason || '').trim() || '人工拒绝',
    });
    if (!updated) {
      throw new Error('仅 pending 草稿可拒绝');
    }

    logger.info(
      `[TASK_DRAFT_REJECTED] draftId=${draftId} runId=${updated.runId || '-'} sourceType=${updated.sourceType} reason=${updated.reason || '-'}`
    );

    return updated;
  }

  private resolveCandidateAccountIds(candidateAccountId: string, accountIds?: string[]): string[] {
    const fallback = candidateAccountId ? [candidateAccountId] : [];
    const selected = accountIds && accountIds.length > 0 ? accountIds : fallback;
    return this.resolveValidAccountIds(selected);
  }

  private resolveValidAccountIds(accountIds: string[]): string[] {
    const unique = Array.from(new Set(accountIds.map((item) => String(item).trim()).filter(Boolean)));
    return unique.filter((accountId) => Boolean(this.accountDao.findById(accountId)));
  }

  private resolveTemplateId(
    templateId: string | undefined,
    category: 'group_message' | 'channel_comment'
  ): string {
    if (templateId) {
      const template = this.templateDao.findById(templateId);
      if (!template) {
        throw new Error('模板不存在');
      }
      if (template.category !== category) {
        throw new Error('模板类型与任务类型不匹配');
      }
      if (!template.enabled) {
        throw new Error('模板已禁用');
      }
      return template.id;
    }

    const fallback = this.templateDao.findEnabled(category)[0];
    if (!fallback) {
      throw new Error(`缺少可用模板: ${category}`);
    }
    return fallback.id;
  }

  private mergeConfig(
    taskType: 'group_posting' | 'channel_monitoring',
    baseConfig: TaskConfig,
    overrideConfig: Partial<TaskConfig> | undefined,
    templateId: string
  ): TaskConfig {
    const mergedBase: TaskConfig = {
      ...this.buildDefaultConfig(taskType),
      ...baseConfig,
      ...(overrideConfig || {}),
    };

    // 模板ID放在任务 config 中，与现有任务侧保持一致。
    (mergedBase as TaskConfig & { templateId?: string }).templateId = templateId;
    return mergedBase;
  }

  private buildDefaultConfig(taskType: 'group_posting' | 'channel_monitoring'): TaskConfig {
    if (taskType === 'group_posting') {
      return {
        interval: 10,
        randomDelay: 1,
        retryOnError: true,
        maxRetries: 3,
        autoJoinEnabled: true,
        precheckPolicy: 'partial',
      };
    }

    return {
      interval: 10,
      randomDelay: 1,
      commentProbability: 0.5,
      retryOnError: true,
      maxRetries: 3,
      autoJoinEnabled: true,
      precheckPolicy: 'partial',
    };
  }

  private clampPriority(priority?: number): number {
    if (priority === undefined || priority === null || Number.isNaN(priority)) {
      return 5;
    }
    return Math.max(1, Math.min(10, Number(priority)));
  }
}
