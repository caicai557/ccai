import { getDiscoveryConfig } from '../../config';

export interface GeminiScoreResult {
  score?: number;
  reason?: string;
  model?: string;
  raw?: string;
  skipped?: boolean;
  error?: string;
}

interface GeminiResponse {
  probability: number;
  reason: string;
}

export class GeminiScorer {
  private readonly cfg = getDiscoveryConfig();

  async score(input: {
    title: string;
    description?: string;
    recentMessageSummary?: string;
  }): Promise<GeminiScoreResult> {
    if (!this.cfg.geminiEnabled) {
      return { skipped: true, reason: 'Gemini 已禁用' };
    }

    if (!this.cfg.geminiApiKey) {
      return { skipped: true, error: '缺少 GEMINI_API_KEY，已降级为仅规则评分' };
    }

    const prompt = [
      '你是Telegram目标筛选器。判断目标是否属于“马尼拉华人真人群/频道”。',
      '仅输出JSON：{"probability":0-1数字,"reason":"简短解释"}',
      `标题: ${input.title}`,
      `简介: ${input.description || ''}`,
      `最近消息摘要: ${input.recentMessageSummary || ''}`,
      '若包含宿务/Cebu倾向，应低分。',
    ].join('\n');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.requestTimeoutMs);

    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.cfg.geminiModel}:generateContent?key=${this.cfg.geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }),
          signal: controller.signal,
        }
      );

      if (!resp.ok) {
        return { error: `Gemini请求失败(${resp.status})` };
      }

      const data = (await resp.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return { error: 'Gemini返回内容为空' };
      }

      const parsed = JSON.parse(text) as GeminiResponse;
      const probability = Number(parsed.probability);
      if (!Number.isFinite(probability)) {
        return { error: 'Gemini返回概率无效', raw: text };
      }

      return {
        score: Math.max(0, Math.min(1, probability)),
        reason: parsed.reason,
        model: this.cfg.geminiModel,
        raw: text,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Gemini评分失败' };
    } finally {
      clearTimeout(timer);
    }
  }
}
