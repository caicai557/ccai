export interface RulesScoreResult {
  score: number;
  passed: boolean;
  reason?: string;
  regionHint?: string;
}

const whitelist = ['manila', 'makati', 'pasay', 'taguig', 'bgc', 'quezon', 'ncr', '马尼拉'];
const blacklist = ['cebu', '宿务'];

export class ManilaRulesScorer {
  score(input: { title: string; username?: string; description?: string }): RulesScoreResult {
    const text = `${input.title} ${input.username || ''} ${input.description || ''}`.toLowerCase();

    const blackHit = blacklist.find((k) => text.includes(k));
    if (blackHit) {
      return {
        score: 0,
        passed: false,
        reason: `命中黑名单关键词: ${blackHit}`,
      };
    }

    const whiteHits = whitelist.filter((k) => text.includes(k));
    if (whiteHits.length === 0) {
      return {
        score: 0.2,
        passed: false,
        reason: '未命中马尼拉区域关键词',
      };
    }

    const hitScore = Math.min(0.5 + whiteHits.length * 0.1, 0.9);

    return {
      score: Number(hitScore.toFixed(4)),
      passed: true,
      regionHint: whiteHits.join(','),
    };
  }
}
