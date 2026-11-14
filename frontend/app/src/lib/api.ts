import { catalogLanguages } from '../../../shared/voices';
import { MAX_CHARS, type Correction, type Input, type Job, type Language, type Recording, isRecording } from './model';
import { sha256Hex } from './sha256';
import { SubmissionLedger } from '../../../shared/submissions';
import { checkedRecognition, type DocumentPage, type DocumentResult } from '../../../shared/vision';
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
export async function request<T>(path: string, init?: RequestInit, timeout = 45000): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  init?.signal?.addEventListener('abort', abort, { once: true });
  if (init?.signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(), timeout);
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
    if (init?.signal?.aborted) throw new Error('Đã hủy đọc tài liệu.');
    if (controller.signal.aborted) throw new Error('Kết nối quá lâu. Bạn hãy thử lại.');
    if (error instanceof TypeError) throw new Error('Không kết nối được máy chủ. Hãy kiểm tra mạng.');
    throw error;
  } finally { clearTimeout(timer); init?.signal?.removeEventListener('abort', abort); }
}
export function checkedJob(value: Job): Job {
  if (!value || typeof value.jobId !== 'string' || !['PENDING', 'PROCESSING', 'DONE', 'FAILED'].includes(value.status) ||
    (value.style !== undefined && typeof value.style !== 'string') || (value.resolvedStyle !== undefined && typeof value.resolvedStyle !== 'string') ||
    (value.styleIntensity !== undefined && (typeof value.styleIntensity !== 'number' || !Number.isFinite(value.styleIntensity) || value.styleIntensity < 0.1 || value.styleIntensity > 2)) ||
    !(value.audioUrl === null || (typeof value.audioUrl === 'string' && /^https?:\/\//.test(value.audioUrl))))
    throw new Error('Thông tin bản thu chưa đúng định dạng.');
  return value;
}
export const api = {
  async recognizeDocument(page: DocumentPage, signal?: AbortSignal): Promise<DocumentResult> {
    if (DEMO) throw new Error('Cần kết nối backend và bật Gemini để đọc ảnh.');
    return checkedRecognition(await request<DocumentResult>('/documents/recognize', { method: 'POST', body: JSON.stringify(page), signal }));
  },
  async voices(): Promise<Language[]> {
    try { return catalogLanguages(await request('/voices'), MAX_CHARS, true); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(error instanceof Error ? error.message : 'Danh sách giọng đọc chưa hợp lệ.', 'INVALID_RESPONSE');
    }
  },
  async correct(text: string, lang: string, signal?: AbortSignal): Promise<Correction> {
    const data = await request<Correction>('/text/correct', { method: 'POST', body: JSON.stringify({ text, lang }), signal }, 12000);
    if (!data || !['checked', 'skipped'].includes(data.status) || data.originalText !== text ||
      typeof data.correctedText !== 'string' || !data.correctedText.trim() ||
      data.correctedText.length > MAX_CHARS || typeof data.hasTypos !== 'boolean' || !Array.isArray(data.changes) ||
      !data.changes.every(change => typeof change.from === 'string' && typeof change.to === 'string' &&
        Number.isInteger(change.start) && Number.isInteger(change.end) && change.start >= 0 &&
        change.end > change.start && change.end <= data.correctedText.length &&
        data.correctedText.slice(change.start, change.end) === change.to))
      throw new ApiError('Chưa kiểm tra được nội dung.', 'INVALID_RESPONSE');
    return data;
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
  async previewTranslation(text: string, sourceLang: string, targetLang: string) {
    if (DEMO) throw new ApiError('Cần kết nối backend để dùng Azure Translator.', 'TRANSLATION_NOT_CONFIGURED');
    const result = await request<{ sourceLang: string; targetLang: string; translatedText: string }>(
      '/text/preview-translation', { method: 'POST', body: JSON.stringify({ text, sourceLang, targetLang }) });
    if (!result || result.sourceLang !== sourceLang || result.targetLang !== targetLang ||
        typeof result.translatedText !== 'string' || !result.translatedText.trim() || result.translatedText.length > MAX_CHARS)
      throw new ApiError('Bản dịch Azure trả về không hợp lệ.', 'INVALID_RESPONSE');
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
      if (error instanceof ApiError && ['TOO_MANY_REQUESTS', 'INVALID_INPUT', 'LANG_REQUIRED', 'LANG_NOT_SUPPORTED', 'TEXT_TOO_LONG', 'INVALID_PROVIDER', 'GEMINI_TTS_NOT_CONFIGURED', 'UNSUPPORTED_SPEED', 'UNSUPPORTED_STYLE', 'EMOTION_NOT_CONFIGURED', 'FEATURE_NOT_ENABLED', 'TRANSLATION_NOT_CONFIGURED'].includes(error.code)) await submissions.reject(digest);
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
