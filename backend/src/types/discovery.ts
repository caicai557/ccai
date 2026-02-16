export type DiscoveryStatus = 'pending' | 'accepted' | 'rejected';

export interface DiscoveryCandidate {
  id: string;
  source: string;
  type: 'group' | 'channel';
  title: string;
  username?: string;
  inviteLink?: string;
  telegramId: string;
  accountId: string;
  regionHint?: string;
  description?: string;
  recentMessageSummary?: string;
  rulesScore: number;
  aiScore?: number;
  finalScore: number;
  status: DiscoveryStatus;
  reason?: string;
  reachabilityStatus: 'reachable' | 'unreachable' | 'unknown';
  aiProvider?: string;
  aiModel?: string;
  aiRaw?: string;
  traceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveryRunRequest {
  accountId: string;
  keywords?: string[];
  sourceTypes?: string[];
  dryRun?: boolean;
  threshold?: number;
  maxPerKeyword?: number;
  geminiEnabled?: boolean;
}

export interface DiscoveryRunResult {
  traceId: string;
  dryRun: boolean;
  scanned: number;
  inserted: number;
  accepted: number;
  rejected: number;
  skipped: number;
  items: DiscoveryCandidate[];
  errors: string[];
}

export interface DiscoveryAcceptResult {
  created: Array<{ candidateId: string; targetId: string; telegramId: string; title: string }>;
  duplicated: Array<{ candidateId: string; targetId: string; telegramId: string; title: string }>;
  failed: Array<{ candidateId: string; telegramId: string; title: string; reason: string }>;
}
