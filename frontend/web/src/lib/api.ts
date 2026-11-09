import { demoLanguages, MAX_CHARS, readStored, storeValue } from "./data";
import type { HistoryItem, HistoryResponse, Job, Language, SynthesizeInput, Stats, TextCorrection, Translation } from "./types";
import { SubmissionLedger } from '../../../shared/submissions';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
export const DEMO = !API_BASE;
const AI_BASE = (import.meta.env.DEV ? import.meta.env.VITE_LOCAL_AI_BASE_URL || API_BASE : API_BASE).trim().replace(/\/+$/, "");
const HISTORY_KEY = "voxa.demo.history.v1";
const TOKEN_KEY = "voxa.demoToken.v1";
const submissions = new SubmissionLedger();
submissions.configure(readStored('voxa.pendingSubmits.v1', {}), async records => {
  if (!storeValue('voxa.pendingSubmits.v1', records)) throw new ApiError('Không lưu được mã yêu cầu. Hãy cho phép lưu trữ trước khi tạo bản thu.', 'STORAGE');
});

export function getDemoToken(): string {
  const token = readStored<unknown>(TOKEN_KEY, "");
  return typeof token === "string" ? token : "";
}
export const saveDemoToken = (token: string) => storeValue(TOKEN_KEY, token.trim());

// CloudFront OAC yêu cầu hash của đúng body với POST; crypto.subtle chỉ có trên HTTPS.
async function bodyHash(body: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
const pending = new Map<string, { input: SynthesizeInput; started: number }>();

export class ApiError extends Error {
  constructor(
    message: string,
    public code = "INTERNAL",
    public status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const statuses = ["PENDING", "PROCESSING", "DONE", "FAILED"];
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function isJob(value: unknown): value is Job {
  if (
    !isRecord(value) ||
    typeof value.jobId !== "string" ||
    !value.jobId ||
    !statuses.includes(String(value.status))
  )
    return false;
  if (value.audioUrl !== null && typeof value.audioUrl !== "string") return false;
  if (typeof value.audioUrl === "string") {
    try {
      if (!["https:", "http:"].includes(new URL(value.audioUrl).protocol)) return false;
    } catch {
      return false;
    }
  }
  if (
    value.progress !== undefined &&
    (!isRecord(value.progress) ||
      typeof value.progress.done !== "number" ||
      !Number.isFinite(value.progress.done) ||
      value.progress.done < 0 ||
      typeof value.progress.total !== "number" ||
      !Number.isFinite(value.progress.total) ||
      value.progress.total < 0)
  )
    return false;
  return true;
}
function isHistoryItem(value: unknown): value is HistoryItem {
  return (
    isJob(value) &&
    isRecord(value) &&
    typeof value.text === "string" &&
    typeof value.lang === "string" &&
    typeof value.voice === "string" &&
    typeof value.charCount === "number" &&
    Number.isFinite(value.charCount) &&
    value.charCount >= 0 &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    (value.speed === undefined || (typeof value.speed === "number" && value.speed >= 0.5 && value.speed <= 2))
  );
}
function checkedJob(value: unknown): Job {
  if (!isJob(value))
    throw new ApiError("Thông tin bản thu chưa đúng định dạng. Vui lòng thử lại.", "INVALID_RESPONSE");
  return value;
}

async function request<T>(path: string, init?: RequestInit, timeout = 45000, base = API_BASE): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const token = getDemoToken();
    const hash = typeof init?.body === "string" ? await bodyHash(init.body) : null;
    const response = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { "X-Demo-Token": token } : {}),
        ...(hash ? { "x-amz-content-sha256": hash } : {}),
        ...init?.headers,
      },
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiError("Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại.", "INVALID_RESPONSE");
    }
    if (!response.ok) {
      if (response.status === 501) throw new ApiError("Máy chủ chưa hỗ trợ chức năng này. Vui lòng thử lại sau.", "NOT_IMPLEMENTED", 501);
      const error = (body as { error?: { message?: string; code?: string } })?.error;
      throw new ApiError(error?.message || `Không thể hoàn tất yêu cầu (${response.status}).`, error?.code, response.status);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError")
      throw new ApiError("Kết nối mất quá nhiều thời gian. Vui lòng thử lại.", "TIMEOUT");
    throw new ApiError("Không kết nối được máy chủ. Kiểm tra kết nối mạng và thử lại.", "NETWORK");
  } finally {
    window.clearTimeout(timer);
  }
}

function getDemoHistory(): HistoryItem[] {
  const value = readStored<unknown>(HISTORY_KEY, []);
  if (!Array.isArray(value)) return [];
  return value.filter(isHistoryItem);
}
export const api = {
  async correct(text: string, lang: string): Promise<TextCorrection> {
    if (!AI_BASE) return { status: "skipped", language: lang, hasTypos: false, originalText: text, correctedText: text, changes: [] };
    const result = await request<TextCorrection>("/text/correct", {
      method: "POST", body: JSON.stringify({ text, lang }),
    }, 12000, AI_BASE);
    if (!result || !["checked", "skipped"].includes(result.status) || typeof result.language !== "string" || result.originalText !== text ||
      typeof result.hasTypos !== "boolean" || typeof result.correctedText !== "string" ||
      !result.correctedText.trim() || result.correctedText.length > MAX_CHARS || !Array.isArray(result.changes) ||
      !result.changes.every((change) => typeof change?.from === "string" && typeof change.to === "string" &&
        Number.isInteger(change.start) && Number.isInteger(change.end) && change.start >= 0 &&
        change.end > change.start && change.end <= result.correctedText.length))
      throw new ApiError("Chưa kiểm tra được nội dung.", "INVALID_RESPONSE");
    return result;
  },
  async translate(text: string, sourceLang: string, targetLang: string, context = ""): Promise<Translation> {
    if (!AI_BASE) throw new ApiError("Hãy bật máy chủ Gemini local hoặc kết nối backend để dịch.", "FEATURE_NOT_ENABLED");
    const result = await request<Translation>("/text/translate", {
      method: "POST", body: JSON.stringify({ text, sourceLang, targetLang, context }),
    }, 35000, AI_BASE);
    if (!result || result.sourceLang !== sourceLang || result.targetLang !== targetLang ||
      typeof result.translatedText !== "string" || !result.translatedText.trim() || result.translatedText.length > 6000)
      throw new ApiError("Bản dịch trả về không hợp lệ.", "INVALID_RESPONSE");
    return result;
  },
  async stats(): Promise<Stats> {
    if (DEMO) {
      const items = getDemoHistory();
      return {
        totalJobs: items.length,
        totalChars: items.reduce((sum, item) => sum + item.charCount, 0),
        byLang: items.reduce<Record<string, number>>((result, item) => {
          result[item.lang] = (result[item.lang] || 0) + 1;
          return result;
        }, {}),
        cacheHits: 0,
      };
    }
    const data = await request<Stats>("/stats");
    const valid = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;
    if (
      !data ||
      !valid(data.totalJobs) ||
      !valid(data.totalChars) ||
      !valid(data.cacheHits) ||
      !isRecord(data.byLang) ||
      !Object.values(data.byLang).every(valid)
    )
      throw new ApiError("Thống kê chưa đúng định dạng.", "INVALID_RESPONSE");
    return data;
  },
  async voices(): Promise<Language[]> {
    if (DEMO) return demoLanguages;
    const data = await request<{ languages: Language[] }>("/voices");
    if (
      !data ||
      !Array.isArray(data.languages) ||
      !data.languages.every(
        (l) =>
          !!l &&
          typeof l.lang === "string" &&
          typeof l.provider === "string" &&
          Array.isArray(l.voices) &&
          l.voices.every((v) => !!v && typeof v.id === "string" && typeof v.gender === "string" &&
            (v.name === undefined || typeof v.name === "string")),
      )
    )
      throw new ApiError("Danh sách giọng đọc chưa đúng định dạng.", "INVALID_RESPONSE");
    return data.languages;
  },
  async synthesize(input: SynthesizeInput, context = ''): Promise<Job> {
    if (!DEMO) {
      const digest = await bodyHash(JSON.stringify([API_BASE, getDemoToken(), context, input]));
      if (!digest) throw new ApiError('Cần HTTPS để gửi yêu cầu an toàn.', 'HASH_UNAVAILABLE');
      const key = await submissions.reserve(digest);
      try {
        const result = checkedJob(await request('/synthesize', { method: 'POST', body: JSON.stringify(input), headers: { 'Idempotency-Key': key } }));
        await submissions.accepted(digest, result.jobId);
        if (result.status === 'DONE' || result.status === 'FAILED') await submissions.finish(result.jobId);
        return result;
      } catch (error) {
        if (error instanceof ApiError && ['TOO_MANY_REQUESTS', 'INVALID_INPUT', 'LANG_REQUIRED', 'LANG_NOT_SUPPORTED', 'TEXT_TOO_LONG', 'UNSUPPORTED_SPEED', 'FEATURE_NOT_ENABLED'].includes(error.code)) await submissions.reject(digest);
        throw error;
      }
    }
    if (input.translateTo)
      throw new ApiError(
        "Dịch tự động cần kết nối máy chủ. Bạn có thể nghe thử ở Tạo giọng đọc.",
        "DEMO_TRANSLATION",
      );
    const jobId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    pending.set(jobId, { input, started: Date.now() });
    return { jobId, status: "PENDING", audioUrl: null, cached: false };
  },
  async job(jobId: string): Promise<Job> {
    if (!DEMO) {
      const job = checkedJob(await request(`/jobs/${encodeURIComponent(jobId)}`));
      if (job.status === 'DONE' || job.status === 'FAILED') await submissions.finish(job.jobId);
      return job;
    }
    const entry = pending.get(jobId);
    if (!entry) {
      const saved = getDemoHistory().find((item) => item.jobId === jobId);
      if (saved) return saved;
      throw new ApiError("Không tìm thấy bản thu này.", "NOT_FOUND");
    }
    const done = Math.min(3, Math.floor((Date.now() - entry.started) / 650));
    if (done < 3)
      return {
        jobId,
        status: "PROCESSING",
        audioUrl: null,
        progress: { done, total: 3 },
      };
    const item: HistoryItem = {
      jobId,
      status: "DONE",
      audioUrl: null,
      text: entry.input.text,
      lang: entry.input.lang,
      voice: entry.input.voice,
      speed: entry.input.speed,
      charCount: entry.input.text.length,
      createdAt: new Date().toISOString(),
    };
    const saved = storeValue(HISTORY_KEY, [item, ...getDemoHistory()].slice(0, 100));
    pending.delete(jobId);
    if (!saved)
      throw new ApiError(
        "Bộ nhớ trình duyệt đã đầy hoặc bị chặn. Hãy cho phép lưu dữ liệu rồi thử lại.",
        "STORAGE",
      );
    return item;
  },
  async history(cursor?: string): Promise<HistoryResponse> {
    if (DEMO) return { items: getDemoHistory(), nextCursor: null };
    const data = await request<HistoryResponse>(
      `/history?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (
      !data ||
      !Array.isArray(data.items) ||
      !data.items.every(isHistoryItem) ||
      (data.nextCursor !== null && typeof data.nextCursor !== "string")
    )
      throw new ApiError("Lịch sử chưa đúng định dạng. Vui lòng tải lại.", "INVALID_RESPONSE");
    return data;
  },
  async remove(jobId: string): Promise<void> {
    if (!DEMO) {
      const result = await request<{ deleted: boolean }>(`/history/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
      });
      if (result?.deleted !== true)
        throw new ApiError(
          "Máy chủ chưa xác nhận xóa bản thu. Vui lòng tải lại lịch sử.",
          "INVALID_RESPONSE",
        );
      return;
    }
    if (
      !storeValue(
        HISTORY_KEY,
        getDemoHistory().filter((item) => item.jobId !== jobId),
      )
    )
      throw new ApiError("Chưa lưu được thay đổi. Vui lòng thử lại.", "STORAGE");
  },
};
