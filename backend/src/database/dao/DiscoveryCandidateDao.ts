import Database from 'better-sqlite3';
import { BaseDao } from './BaseDao';
import { DiscoveryCandidate, DiscoveryStatus } from '../../types';

interface CandidateQuery {
  status?: DiscoveryStatus;
  minFinalScore?: number;
  source?: string;
  page?: number;
  pageSize?: number;
}

export class DiscoveryCandidateDao extends BaseDao<DiscoveryCandidate> {
  private readonly baseSelect = `
    SELECT
      id,
      source,
      type,
      title,
      username,
      invite_link AS inviteLink,
      telegram_id AS telegramId,
      account_id AS accountId,
      region_hint AS regionHint,
      description,
      recent_message_summary AS recentMessageSummary,
      rules_score AS rulesScore,
      ai_score AS aiScore,
      final_score AS finalScore,
      status,
      reason,
      reachability_status AS reachabilityStatus,
      ai_provider AS aiProvider,
      ai_model AS aiModel,
      ai_raw AS aiRaw,
      trace_id AS traceId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM discovery_candidates
  `;

  constructor(db: Database.Database) {
    super(db);
  }

  create(data: Omit<DiscoveryCandidate, 'id' | 'createdAt' | 'updatedAt'>): DiscoveryCandidate {
    const id = this.generateId();
    const now = this.now();
    const stmt = this.db.prepare(`
      INSERT INTO discovery_candidates (
        id, source, type, title, username, invite_link, telegram_id, account_id,
        region_hint, description, recent_message_summary, rules_score, ai_score, final_score,
        status, reason, reachability_status, ai_provider, ai_model, ai_raw, trace_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.source,
      data.type,
      data.title,
      data.username || null,
      data.inviteLink || null,
      data.telegramId,
      data.accountId,
      data.regionHint || null,
      data.description || null,
      data.recentMessageSummary || null,
      data.rulesScore,
      data.aiScore ?? null,
      data.finalScore,
      data.status,
      data.reason || null,
      data.reachabilityStatus,
      data.aiProvider || null,
      data.aiModel || null,
      data.aiRaw || null,
      data.traceId,
      now,
      now
    );

    return this.findById(id)!;
  }

  findAll(): DiscoveryCandidate[] {
    const stmt = this.db.prepare(`${this.baseSelect} ORDER BY created_at DESC`);
    return stmt.all() as DiscoveryCandidate[];
  }

  findById(id: string): DiscoveryCandidate | undefined {
    const stmt = this.db.prepare(`${this.baseSelect} WHERE id = ?`);
    return stmt.get(id) as DiscoveryCandidate | undefined;
  }

  findByTelegramId(telegramId: string): DiscoveryCandidate | undefined {
    const stmt = this.db.prepare(
      `${this.baseSelect} WHERE telegram_id = ? ORDER BY created_at DESC`
    );
    return stmt.get(telegramId) as DiscoveryCandidate | undefined;
  }

  list(query: CandidateQuery): { items: DiscoveryCandidate[]; total: number } {
    const page = Math.max(query.page || 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: Array<string | number> = [];

    if (query.status) {
      where.push('status = ?');
      params.push(query.status);
    }
    if (query.source) {
      where.push('source = ?');
      params.push(query.source);
    }
    if (query.minFinalScore !== undefined) {
      where.push('final_score >= ?');
      params.push(query.minFinalScore);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalStmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM discovery_candidates ${whereClause}`
    );
    const total = (totalStmt.get(...params) as { count: number }).count;

    const stmt = this.db.prepare(
      `${this.baseSelect} ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    );
    const items = stmt.all(...params, pageSize, offset) as DiscoveryCandidate[];

    return { items, total };
  }

  update(id: string, data: Partial<DiscoveryCandidate>): DiscoveryCandidate | undefined {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.reason !== undefined) {
      fields.push('reason = ?');
      values.push(data.reason || null);
    }
    if (data.finalScore !== undefined) {
      fields.push('final_score = ?');
      values.push(data.finalScore);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updated_at = ?');
    values.push(this.now());
    values.push(id);

    const stmt = this.db.prepare(`UPDATE discovery_candidates SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.findById(id);
  }

  updateStatus(id: string, status: DiscoveryStatus, reason?: string): void {
    const stmt = this.db.prepare(
      'UPDATE discovery_candidates SET status = ?, reason = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(status, reason || null, this.now(), id);
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM discovery_candidates WHERE id = ?');
    return stmt.run(id).changes > 0;
  }
}
