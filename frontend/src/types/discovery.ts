export interface DiscoveryCandidate {
  id: string;
  source: string;
  type: 'group' | 'channel';
  title: string;
  username?: string;
  inviteLink?: string;
  telegramId: string;
  regionHint?: string;
  rulesScore: number;
  aiScore?: number;
  finalScore: number;
  status: 'pending' | 'accepted' | 'rejected';
  reason?: string;
  reachabilityStatus: 'reachable' | 'unreachable' | 'unknown';
  createdAt: string;
}

export interface DiscoveryRunPayload {
  accountId: string;
  keywords?: string[];
  sourceTypes?: string[];
  dryRun?: boolean;
  threshold?: number;
}
