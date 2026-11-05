export type Page =
  "dashboard" | "studio" | "translation" | "documents" | "voices" | "library" | "settings" | "help";
export type JobStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED";
export interface Voice {
  id: string;
  gender: string;
}
export interface Language {
  lang: string;
  provider: string;
  engine: string | null;
  voices: Voice[];
}
export interface SynthesizeInput {
  text: string;
  lang: string;
  voice: string;
  speed: number;
  translateTo: string | null;
}
export interface Job {
  jobId: string;
  status: JobStatus;
  audioUrl: string | null;
  progress?: { done: number; total: number };
  error?: string | { code?: string; message?: string } | null;
  cached?: boolean;
}
export interface HistoryItem extends Job {
  text: string;
  lang: string;
  voice: string;
  charCount: number;
  createdAt: string;
  speed?: number;
}
export interface HistoryResponse {
  items: HistoryItem[];
  nextCursor: string | null;
}
export interface Preferences {
  reducedMotion: boolean;
  highContrast: boolean;
  volume: number;
}
export interface Stats {
  totalJobs: number;
  totalChars: number;
  byLang: Record<string, number>;
  cacheHits: number;
}
