import { MAX_CHARS, type Correction, type Input, type Job, type Language, type Recording, isRecording } from './model';
import { sha256Hex } from './sha256';

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
export const DEMO = !API_BASE;
let demoToken = '';
export const setDemoToken = (token: string) => { demoToken = token.trim(); };
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal,
      headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(demoToken ? { 'X-Demo-Token': demoToken } : {}),
        ...(typeof init?.body === 'string' ? { 'x-amz-content-sha256': sha256Hex(init.body) } : {}),
        ...init?.headers } });
    let body;
    try { body = await response.json(); }
    catch { throw new Error('Máy chủ trả về dữ liệu không hợp lệ.'); }
    if (!response.ok) throw new Error(body?.error?.message || `Không hoàn tất được yêu cầu (${response.status}).`);
    return body as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Kết nối quá lâu. Bạn hãy thử lại.');
    if (error instanceof TypeError) throw new Error('Không kết nối được máy chủ. Hãy kiểm tra mạng.');
    throw error;
  } finally { clearTimeout(timer); }
}
export function checkedJob(value: Job): Job {
  if (!value || typeof value.jobId !== 'string' || !['PENDING', 'PROCESSING', 'DONE', 'FAILED'].includes(value.status) ||
    !(value.audioUrl === null || (typeof value.audioUrl === 'string' && /^https?:\/\//.test(value.audioUrl))))
    throw new Error('Thông tin bản thu chưa đúng định dạng.');
  return value;
}
export const api = {
  async voices(): Promise<Language[]> {
    const data = await request<{ languages: Language[] }>('/voices');
    if (!Array.isArray(data?.languages) || !data.languages.every(l => typeof l?.lang === 'string' && Array.isArray(l.voices) &&
      l.voices.every(v => typeof v?.id === 'string' && typeof v.gender === 'string' && (v.name === undefined || typeof v.name === 'string')))) throw new Error('Danh sách giọng đọc chưa hợp lệ.');
    return data.languages;
  },
  async correct(text: string, lang: string): Promise<Correction | null> {
    const data = await request<Correction>('/text/correct', { method: 'POST', body: JSON.stringify({ text, lang }) });
    if (!data || data.originalText !== text || typeof data.correctedText !== 'string' || !data.correctedText.trim() ||
      data.correctedText.length > MAX_CHARS || typeof data.hasTypos !== 'boolean') return null;
    return data.hasTypos && data.correctedText !== text ? data : null;
  },
  async synthesize(input: Input) { return checkedJob(await request<Job>('/synthesize', { method: 'POST', body: JSON.stringify(input) })); },
  async job(id: string) { return checkedJob(await request<Job>(`/jobs/${encodeURIComponent(id)}`)); },
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
