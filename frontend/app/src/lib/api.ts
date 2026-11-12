import { MAX_CHARS, type Correction, type Input, type Job, type Language, type Recording, isRecording } from './model';
import { sha256Hex } from './sha256';
import { SubmissionLedger } from '../../../shared/submissions';
const submissions = new SubmissionLedger();
submissions.configure({}, async () => { throw new Error('Chưa đọc được mã yêu cầu đã lưu. Hãy mở lại ứng dụng trước khi tạo bản thu.'); });
export const configureSubmissionStore = submissions.configure.bind(submissions);
export class ApiError extends Error {
  constructor(message: string, public code: string) { super(message); this.name = 'ApiError'; }
}

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
export const DEMO = !API_BASE;
let demoToken = '';
export const setDemoToken = (token: string) => { demoToken = token.trim(); };
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal,
      headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(demoToken ? { 'X-Demo-Token': demoToken } : {}),
        ...(typeof init?.body === 'string' ? { 'x-amz-content-sha256': sha256Hex(init.body) } : {}),
        ...init?.headers } });
    let body;
    try { body = await response.json(); }
    catch { throw new Error('Máy chủ trả về dữ liệu không hợp lệ.'); }
    if (!response.ok) throw new ApiError(body?.error?.message || `Không hoàn tất được yêu cầu (${response.status}).`, body?.error?.code ?? 'INTERNAL');
    return body as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Kết nối quá lâu. Bạn hãy thử lại.');
    if (error instanceof TypeError) throw new Error('Không kết nối được máy chủ. Hãy kiểm tra mạng.');
    throw error;
  } finally { clearTimeout(timer); }
}
export function checkedJob(value: Job): Job {
  if (!value || typeof value.jobId !== 'string' || !['PENDING', 'PROCESSING', 'DONE', 'FAILED'].includes(value.status) ||
    (value.style !== undefined && typeof value.style !== 'string') || (value.resolvedStyle !== undefined && typeof value.resolvedStyle !== 'string') ||
    !(value.audioUrl === null || (typeof value.audioUrl === 'string' && /^https?:\/\//.test(value.audioUrl))))
    throw new Error('Thông tin bản thu chưa đúng định dạng.');
  return value;
}
export const api = {
  async voices(): Promise<Language[]> {
    const data = await request<{ languages: Language[]; limits?: { maxChars?: number }; features?: { translation?: boolean; autoEmotion?: boolean } }>('/voices');
    if (!Array.isArray(data?.languages) || !data.languages.every(l => typeof l?.lang === 'string' && Array.isArray(l.voices) &&
      l.voices.every(v => typeof v?.id === 'string' && typeof v.gender === 'string' && (v.name === undefined || typeof v.name === 'string') &&
        (v.styles === undefined || (Array.isArray(v.styles) && v.styles.every(style => typeof style === 'string')))))) throw new Error('Danh sách giọng đọc chưa hợp lệ.');
    const limit = data.limits?.maxChars;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 2 || limit > MAX_CHARS)) throw new Error('Giới hạn giọng đọc chưa hợp lệ.');
    return data.languages.map(language => ({ ...language, ...(limit !== undefined ? { maxChars: limit } : {}),
      ...(typeof data.features?.autoEmotion === 'boolean' ? { autoEmotionEnabled: data.features.autoEmotion } : {}),
      ...(typeof data.features?.translation === 'boolean' ? { translationEnabled: data.features.translation } : {}) }));
  },
  async correct(text: string, lang: string): Promise<Correction | null> {
    const data = await request<Correction>('/text/correct', { method: 'POST', body: JSON.stringify({ text, lang }) });
    if (!data || data.originalText !== text || typeof data.correctedText !== 'string' || !data.correctedText.trim() ||
      data.correctedText.length > MAX_CHARS || typeof data.hasTypos !== 'boolean') return null;
    return data.hasTypos && data.correctedText !== text ? data : null;
  },
  async translate(text: string, sourceLang: string, targetLang: string, context = '') {
    if (DEMO) throw new ApiError('Hãy kết nối backend để dịch tài liệu trên app.', 'FEATURE_NOT_ENABLED');
    const result = await request<{ sourceLang: string; targetLang: string; translatedText: string }>(
      '/text/translate', { method: 'POST', body: JSON.stringify({ text, sourceLang, targetLang, context }) });
    if (result?.sourceLang !== sourceLang || result.targetLang !== targetLang ||
        typeof result.translatedText !== 'string' || !result.translatedText.trim() || result.translatedText.length > 6000)
      throw new ApiError('Bản dịch trả về không hợp lệ.', 'INVALID_RESPONSE');
    return result;
  },
  async synthesize(input: Input, context = '') {
    const digest = sha256Hex(JSON.stringify([API_BASE, demoToken, context, input]));
    const key = await submissions.reserve(digest);
    try {
      const result = checkedJob(await request<Job>('/synthesize', { method: 'POST', body: JSON.stringify(input), headers: { 'Idempotency-Key': key } }));
      await submissions.accepted(digest, result.jobId);
      if (result.status === 'DONE' || result.status === 'FAILED') await submissions.finish(result.jobId);
      return result;
    } catch (error) {
      if (error instanceof ApiError && ['TOO_MANY_REQUESTS', 'INVALID_INPUT', 'LANG_REQUIRED', 'LANG_NOT_SUPPORTED', 'TEXT_TOO_LONG', 'UNSUPPORTED_SPEED', 'UNSUPPORTED_STYLE', 'EMOTION_NOT_CONFIGURED', 'FEATURE_NOT_ENABLED', 'TRANSLATION_NOT_CONFIGURED'].includes(error.code)) await submissions.reject(digest);
      throw error;
    }
  },
  async job(id: string) {
    const job = checkedJob(await request<Job>(`/jobs/${encodeURIComponent(id)}`));
    if (job.status === 'DONE' || job.status === 'FAILED') await submissions.finish(job.jobId);
    return job;
  },
  async history(cursor?: string) {
    const data = await request<{ items: Recording[]; nextCursor: string | null }>(`/history?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!Array.isArray(data?.items) || !data.items.every(isRecording) || !(data.nextCursor === null || typeof data.nextCursor === 'string'))
      throw new Error('Danh sách bản thu chưa hợp lệ.');
    return data;
  },
  async remove(id: string) {
    const result = await request<{ deleted: boolean }>(`/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (result?.deleted !== true) throw new Error('Chưa xóa được bản thu.');
  },
};
