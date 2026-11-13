export interface CatalogVoice { id: string; gender: string; name?: string; description?: string; styles?: string[]; styleIntensityRange?: [number, number] }
export interface CatalogLanguage {
  lang: string; provider: string; engine: string | null; voices: CatalogVoice[];
  name?: string; model?: string; available?: boolean; maxChars?: number; translationEnabled?: boolean; autoEmotionEnabled?: boolean;
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const providerNames: Record<string, string> = { azure: 'Azure Speech', gemini: 'Gemini TTS', elevenlabs: 'ElevenLabs', polly: 'Amazon Polly' };
export const providerName = (id?: string) => providerNames[id ?? ''] ?? id ?? '';
export const voiceGender = (gender: string) => gender === 'F' ? 'Nữ' : gender === 'M' ? 'Nam' : 'Giọng đọc';
export const providerOptions = (languages: CatalogLanguage[]) => [...new Set(languages.map(l => l.provider))].map(value => ({ value, label: providerName(value) }));

export function catalogLanguages(value: unknown, maxChars: number, strictLimit = false): CatalogLanguage[] {
  const fail = () => { throw new Error('Danh sách giọng đọc chưa hợp lệ.'); };
  if (!record(value) || !Array.isArray(value.languages)) return fail();
  const limit = record(value.limits) ? value.limits.maxChars : undefined;
  if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < (strictLimit ? 2 : 1) || strictLimit && limit > maxChars)) throw new Error('Giới hạn giọng đọc chưa hợp lệ.');
  const features = record(value.features) ? value.features : {};
  const seen = new Set<string>();
  const result: CatalogLanguage[] = [];
  function add(items: unknown[], group?: Record<string, unknown>) {
    for (const item of items) {
      if (!record(item) || typeof item.lang !== 'string' || typeof item.provider !== 'string' || !Array.isArray(item.voices) ||
        (item.engine != null && typeof item.engine !== 'string') || (group && item.provider !== group.id)) return fail();
      if (!item.voices.every(v => record(v) && typeof v.id === 'string' && typeof v.gender === 'string' &&
        ['name', 'description'].every(key => v[key] === undefined || typeof v[key] === 'string') &&
        (v.styles === undefined || Array.isArray(v.styles) && v.styles.every(s => typeof s === 'string')) &&
        (v.styleIntensityRange === undefined || Array.isArray(v.styleIntensityRange) && v.styleIntensityRange.length === 2 &&
          v.styleIntensityRange[0] === 0.1 && v.styleIntensityRange[1] === 2))) return fail();
      const key = `${item.provider}:${item.lang}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ ...item, engine: item.engine ?? null,
        ...(typeof limit === 'number' ? { maxChars: Math.min(maxChars, limit) } : {}),
        ...(typeof features.translation === 'boolean' ? { translationEnabled: features.translation } : {}),
        ...(group ? { available: group.enabled } : {}),
        ...(typeof group?.model === 'string' ? { model: group.model } : {}),
        ...(group?.nativeEmotion === true ? { autoEmotionEnabled: true } : typeof features.autoEmotion === 'boolean' ? { autoEmotionEnabled: features.autoEmotion } : {}) } as CatalogLanguage);
    }
  }
  // Metadata của provider phải được áp dụng cả khi đây là catalog mặc định.
  const groups = value.providers === undefined ? [] : value.providers;
  if (!Array.isArray(groups)) return fail();
  for (const group of groups) {
    if (!record(group) || typeof group.id !== 'string' || typeof group.enabled !== 'boolean' || !Array.isArray(group.languages)) return fail();
  }
  for (const item of value.languages) {
    const group = groups.find(g => g.id === item?.provider);
    add([item], group);
  }
  for (const group of groups) add(group.languages, group);
  return result;
}
