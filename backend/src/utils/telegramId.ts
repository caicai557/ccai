type TelegramTargetType = 'group' | 'channel';

/**
 * 统一目标ID形态，避免 -100123 与 123 被当作不同目标。
 */
export const normalizeTelegramTargetId = (
  raw: string | number,
  _type: TelegramTargetType
): string => {
  const value = String(raw ?? '').trim();
  if (!value) {
    return '';
  }

  if (/^-100\d+$/.test(value)) {
    return toCanonicalDigits(value.slice(4));
  }

  if (/^-?\d+$/.test(value)) {
    return toCanonicalDigits(value.replace(/^-/, ''));
  }

  return value;
};

/**
 * 兼容历史数据查询：同时查标准形态与历史 -100 形态。
 */
export const buildTelegramTargetIdLookupCandidates = (
  raw: string | number,
  type: TelegramTargetType
): string[] => {
  const normalized = normalizeTelegramTargetId(raw, type);
  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>([normalized]);
  if (/^\d+$/.test(normalized)) {
    candidates.add(`-100${normalized}`);
  }
  return Array.from(candidates);
};

const toCanonicalDigits = (rawDigits: string): string => {
  if (!rawDigits) {
    return '';
  }

  const digits = rawDigits.replace(/^0+(?=\d)/, '');
  if (!digits) {
    return '0';
  }

  try {
    return BigInt(digits).toString();
  } catch {
    return digits;
  }
};
