export type ThemeMode = 'system' | 'light' | 'dark';
export type EditorMode = 'speech' | 'translation' | 'document';
export interface Voice { id: string; gender: string }
export interface Language { lang: string; provider: string; engine: string | null; voices: Voice[] }
export interface Input { text: string; lang: string; voice: string; speed: number; translateTo: string | null }
export interface Job {
  jobId: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  audioUrl: string | null;
  progress?: { done: number; total: number };
  error?: string | { message?: string } | null;
}
export interface Recording extends Job {
  text: string; lang: string; voice: string; speed?: number; charCount: number; createdAt: string;
  local?: boolean;
}
export interface Correction { originalText: string; correctedText: string; hasTypos: boolean }
export interface Preferences { theme: ThemeMode; reducedMotion: boolean; haptics: boolean; favorites: string[] }
export const MAX_CHARS = 20000;
export const languageNames: Record<string, string> = {
  'vi-VN': 'Tiếng Việt', 'en-US': 'Tiếng Anh', 'ja-JP': 'Tiếng Nhật', 'ko-KR': 'Tiếng Hàn',
  'fr-FR': 'Tiếng Pháp', 'de-DE': 'Tiếng Đức', 'es-ES': 'Tiếng Tây Ban Nha', 'cmn-CN': 'Tiếng Trung',
};
export const demoLanguages: Language[] = [
  { lang: 'vi-VN', provider: 'device', engine: null, voices: [{ id: 'Linh', gender: 'F' }, { id: 'Minh', gender: 'M' }] },
  { lang: 'en-US', provider: 'polly', engine: 'neural', voices: [{ id: 'Joanna', gender: 'F' }, { id: 'Matthew', gender: 'M' }] },
  { lang: 'ja-JP', provider: 'polly', engine: 'neural', voices: [{ id: 'Takumi', gender: 'M' }] },
  { lang: 'ko-KR', provider: 'polly', engine: 'neural', voices: [{ id: 'Seoyeon', gender: 'F' }] },
];
export const samples = [
  { title: 'Thông báo', icon: 'megaphone' as const, text: 'Mời các bạn kiểm tra lịch học trên cổng thông tin của trường trước khi đến lớp.' },
  { title: 'Bài học', icon: 'book' as const, text: 'Amazon Polly chuyển văn bản thành giọng nói. File âm thanh được lưu trên Amazon S3 để người dùng nghe và tải về.' },
  { title: 'Giới thiệu', icon: 'mic' as const, text: 'Xin chào, chúng tôi là Nhóm 5. Đây là ứng dụng chuyển văn bản thành giọng nói đa ngôn ngữ của nhóm.' },
];
export const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
export const time = (value: number) => `${Math.floor(Math.max(0, value) / 60)}:${String(Math.floor(Math.max(0, value) % 60)).padStart(2, '0')}`;
export const duration = (text: string, speed = 1) => Math.max(1, Math.round(text.trim().split(/\s+/).filter(Boolean).length / (2.5 * speed)));
export const date = (value: string) => new Date(value).toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' });
export const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
export const covers: [string, string][] = [['#416F98', '#193A59'], ['#9E8CB1', '#50425F'], ['#639E9A', '#244F56'], ['#BB936C', '#66503D']];
export function splitSpeech(text: string, limit = 1800) {
  if (!Number.isFinite(limit) || limit < 1) throw new Error('Giới hạn đoạn đọc không hợp lệ.');
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const last = remaining.slice(0, limit);
    const space = Math.max(last.lastIndexOf('. '), last.lastIndexOf(' '), last.lastIndexOf('\n'));
    let end = space > limit / 2 ? space + 1 : limit;
    const code = remaining.charCodeAt(end - 1);
    if (code >= 0xD800 && code <= 0xDBFF) end--;
    if (end <= 0) end = 2;
    chunks.push(remaining.slice(0, end)); remaining = remaining.slice(end);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
export function validate(input: Input): string | null {
  if (!input.text.trim()) return 'Bạn hãy nhập nội dung muốn đọc.';
  if (input.text.length > MAX_CHARS) return `Nội dung tối đa ${number(MAX_CHARS)} ký tự.`;
  if (!Number.isFinite(input.speed) || input.speed < 0.5 || input.speed > 2) return 'Tốc độ đọc cần từ 0,5× đến 2×.';
  if (!input.lang || !input.voice) return 'Hãy chọn ngôn ngữ và giọng đọc.';
  if (input.translateTo === input.lang) return 'Hãy chọn ngôn ngữ đích khác ngôn ngữ gốc.';
  return null;
}
export function isRecording(value: unknown): value is Recording {
  if (!value || typeof value !== 'object') return false;
  const r = value as Recording;
  return typeof r.jobId === 'string' && typeof r.text === 'string' && typeof r.lang === 'string' &&
    typeof r.voice === 'string' && typeof r.charCount === 'number' && Number.isFinite(r.charCount) &&
    typeof r.createdAt === 'string' && Number.isFinite(Date.parse(r.createdAt)) &&
    ['PENDING', 'PROCESSING', 'DONE', 'FAILED'].includes(r.status) &&
    (r.audioUrl === null || (typeof r.audioUrl === 'string' && /^https?:\/\//.test(r.audioUrl)));
}
