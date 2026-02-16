import { ManilaRulesScorer } from './ManilaRulesScorer';

describe('ManilaRulesScorer', () => {
  const scorer = new ManilaRulesScorer();

  test('命中马尼拉关键词应通过', () => {
    const result = scorer.score({ title: '马尼拉华人交流群' });
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThan(0.5);
  });

  test('命中宿务关键词应拒绝', () => {
    const result = scorer.score({ title: 'Cebu 华人群' });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('黑名单');
  });
});
