import { DiscoveryCandidateDao, TargetDao } from '../../database/dao';
import {
  DiscoveryAcceptResult,
  DiscoveryCandidate,
  DiscoveryRunRequest,
  DiscoveryRunResult,
} from '../../types';
import { ClientPool } from '../../telegram/ClientPool';
import { getDiscoveryConfig } from '../../config';
import { ManilaRulesScorer } from './ManilaRulesScorer';
import { GeminiScorer } from './GeminiScorer';

const DEFAULT_KEYWORDS = ['manila 华人', 'makati 华社', 'bgc 中文', 'quezon 华人'];

export class DiscoveryService {
  private readonly rulesScorer = new ManilaRulesScorer();
  private readonly geminiScorer = new GeminiScorer();
  private readonly cfg = getDiscoveryConfig();

  constructor(
    private readonly candidateDao: DiscoveryCandidateDao,
    private readonly targetDao: TargetDao,
    private readonly clientPool: ClientPool = ClientPool.getInstance()
  ) {}

  async run(payload: DiscoveryRunRequest): Promise<DiscoveryRunResult> {
    if (!this.cfg.enabled) {
      throw new Error('智能发现已关闭，请设置 DISCOVERY_ENABLED=true');
    }

    const client = await this.clientPool.getClient(payload.accountId);
    if (!client) {
      throw new Error('账号不可用，无法执行发现');
    }

    const traceId = `discovery-${Date.now()}`;
    const keywords = payload.keywords?.length ? payload.keywords : DEFAULT_KEYWORDS;
    const dryRun = payload.dryRun === true;
    const threshold = payload.threshold ?? 0.6;
    const maxPerKeyword = Math.min(Math.max(payload.maxPerKeyword || 30, 1), 100);

    const map = new Map<string, Awaited<ReturnType<typeof client.searchTargets>>[number]>();
    for (const keyword of keywords) {
      const items = await client.searchTargets(keyword, maxPerKeyword);
      for (const item of items) {
        map.set(item.telegramId, item);
      }
    }

    const merged = Array.from(map.values());
    const errors: string[] = [];
    const results: DiscoveryCandidate[] = [];

    for (const item of merged) {
      const reachability = await client.resolveTarget(item.telegramId);
      if (!reachability.success) {
        errors.push(`${item.telegramId}: ${reachability.message || '不可达'}`);
      }

      const ruleResult = this.rulesScorer.score({
        title: item.title,
        username: item.username,
      });

      const aiResult = await this.geminiScorer.score({
        title: item.title,
      });

      const aiScore = aiResult.score;
      const finalScore =
        aiScore !== undefined ? ruleResult.score * 0.6 + aiScore * 0.4 : ruleResult.score;
      const normalizedFinal = Number(finalScore.toFixed(4));

      const status =
        !ruleResult.passed || !reachability.success || normalizedFinal < threshold
          ? 'rejected'
          : 'pending';
      const reason = !reachability.success
        ? `账号不可达: ${reachability.message || 'unknown'}`
        : !ruleResult.passed
          ? ruleResult.reason
          : normalizedFinal < threshold
            ? `低于阈值(${threshold})`
            : aiResult.reason;

      const record: Omit<DiscoveryCandidate, 'id' | 'createdAt' | 'updatedAt'> = {
        source: 'telegram_dialog_search',
        type: item.type,
        title: item.title,
        username: item.username,
        inviteLink: item.inviteLink,
        telegramId: item.telegramId,
        accountId: payload.accountId,
        regionHint: ruleResult.regionHint,
        description: undefined,
        recentMessageSummary: undefined,
        rulesScore: ruleResult.score,
        aiScore,
        finalScore: normalizedFinal,
        status,
        reason,
        reachabilityStatus: reachability.success ? 'reachable' : 'unreachable',
        aiProvider: aiScore !== undefined ? 'gemini' : undefined,
        aiModel: aiResult.model,
        aiRaw: aiResult.raw || aiResult.error,
        traceId,
      };

      if (dryRun) {
        results.push({
          ...record,
          id: `dryrun-${item.telegramId}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } else {
        results.push(this.candidateDao.create(record));
      }
    }

    return {
      traceId,
      dryRun,
      scanned: merged.length,
      inserted: dryRun ? 0 : results.length,
      accepted: results.filter((r) => r.status === 'pending').length,
      rejected: results.filter((r) => r.status === 'rejected').length,
      skipped: 0,
      items: results,
      errors,
    };
  }

  list(query: {
    status?: 'pending' | 'accepted' | 'rejected';
    source?: string;
    minFinalScore?: number;
    page?: number;
    pageSize?: number;
  }) {
    return this.candidateDao.list(query);
  }

  accept(candidateIds: string[]): DiscoveryAcceptResult {
    const created: DiscoveryAcceptResult['created'] = [];
    const duplicated: DiscoveryAcceptResult['duplicated'] = [];
    const failed: DiscoveryAcceptResult['failed'] = [];

    for (const candidateId of candidateIds) {
      const candidate = this.candidateDao.findById(candidateId);
      if (!candidate) {
        failed.push({ candidateId, telegramId: '', title: '', reason: '候选不存在' });
        continue;
      }

      if (candidate.status === 'rejected') {
        failed.push({
          candidateId,
          telegramId: candidate.telegramId,
          title: candidate.title,
          reason: candidate.reason || '候选已拒绝',
        });
        continue;
      }

      const existed = this.targetDao.findByTelegramId(candidate.telegramId);
      if (existed) {
        duplicated.push({
          candidateId,
          targetId: existed.id,
          telegramId: existed.telegramId,
          title: existed.title,
        });
        this.candidateDao.updateStatus(candidateId, 'accepted', '目标已存在，标记accepted');
        continue;
      }

      const target = this.targetDao.create({
        type: candidate.type,
        telegramId: candidate.telegramId,
        title: candidate.title,
        inviteLink: candidate.inviteLink,
        enabled: true,
      });

      this.candidateDao.updateStatus(candidateId, 'accepted');
      created.push({
        candidateId,
        targetId: target.id,
        telegramId: target.telegramId,
        title: target.title,
      });
    }

    return { created, duplicated, failed };
  }
}
