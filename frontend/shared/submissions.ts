type Entry = { key: string; jobId?: string };
type Records = Record<string, Entry>;

/** Only digests and opaque keys are persisted, never text, tokens or signed URLs. */
export class SubmissionLedger {
  private records: Records = {};
  private save: (records: Records) => Promise<void> = async () => {};
  private pending: Promise<unknown> = Promise.resolve();

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation);
    this.pending = next.catch(() => {});
    return next;
  }

  configure(value: unknown, save: (records: Records) => Promise<void>) {
    this.records = {};
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [digest, entry] of Object.entries(value)) {
        if (/^[a-f0-9]{64}$/.test(digest) && entry && typeof entry === 'object' &&
            typeof entry.key === 'string' && /^[a-zA-Z0-9-]{8,128}$/.test(entry.key) &&
            (entry.jobId === undefined || typeof entry.jobId === 'string'))
          this.records[digest] = { key: entry.key, ...(entry.jobId === undefined ? {} : { jobId: entry.jobId }) };
      }
    }
    this.save = save;
  }

  async reserve(digest: string): Promise<string> {
    return this.serial(async () => {
      let entry = this.records[digest];
      if (!entry) {
        if (Object.keys(this.records).length >= 200) throw new Error('Có quá nhiều yêu cầu chưa rõ kết quả. Hãy kiểm tra Lịch sử trước khi tạo tiếp.');
        entry = { key: globalThis.crypto?.randomUUID?.() ?? `tts-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` };
        this.records[digest] = entry;
      }
      await this.save({ ...this.records });
      return entry.key;
    });
  }

  async accepted(digest: string, jobId: string) {
    return this.serial(async () => {
      if (this.records[digest]) this.records[digest] = { ...this.records[digest], jobId };
      await this.save({ ...this.records });
    });
  }

  async finish(jobId: string) {
    return this.serial(async () => {
      const next = { ...this.records };
      for (const [digest, entry] of Object.entries(next)) if (entry.jobId === jobId) delete next[digest];
      try { await this.save(next); this.records = next; } catch { /* A terminal replay remains safe if storage is temporarily unavailable. */ }
    });
  }

  async reject(digest: string) {
    return this.serial(async () => {
      delete this.records[digest];
      await this.save({ ...this.records });
    });
  }
}
