import { GeminiScorer } from './GeminiScorer';

describe('GeminiScorer', () => {
  test('无 key 时应降级', async () => {
    const origin = process.env['GEMINI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
    const scorer = new GeminiScorer();

    const result = await scorer.score({ title: '马尼拉华人群' });
    expect(result.score).toBeUndefined();
    expect(result.skipped || result.error).toBeTruthy();

    if (origin) {
      process.env['GEMINI_API_KEY'] = origin;
    }
  });
});
