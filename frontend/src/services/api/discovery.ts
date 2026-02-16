import { get, post } from './client';
import type { DiscoveryCandidate, DiscoveryRunPayload } from '../../types/discovery';

export const discoveryApi = {
  run: (payload: DiscoveryRunPayload) =>
    post<{
      traceId: string;
      dryRun: boolean;
      scanned: number;
      inserted: number;
      accepted: number;
      rejected: number;
      items: DiscoveryCandidate[];
      errors: string[];
    }>('/api/discovery/run', payload),

  list: (params?: { status?: string; page?: number; pageSize?: number; minFinalScore?: number }) =>
    get<{ items: DiscoveryCandidate[]; total: number; page: number; pageSize: number }>(
      '/api/discovery/candidates',
      params
    ),

  accept: (candidateIds: string[]) =>
    post<{
      created: Array<{ candidateId: string; targetId: string; telegramId: string; title: string }>;
      duplicated: Array<{
        candidateId: string;
        targetId: string;
        telegramId: string;
        title: string;
      }>;
      failed: Array<{ candidateId: string; telegramId: string; title: string; reason: string }>;
      summary: { created: number; duplicated: number; failed: number };
    }>('/api/discovery/accept', { candidateIds }),
};
