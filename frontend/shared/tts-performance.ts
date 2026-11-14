/** Chỉ ghi thời lượng và trạng thái; không nhận nội dung, token hay URL. */
export const ttsNow = () => globalThis.performance?.now() ?? Date.now();
export function ttsTiming(stage: string, started: number, provider: string, status: string) {
  const durationMs = Math.round(ttsNow() - started);
  if (durationMs >= 0 && Number.isFinite(durationMs))
    console.info('[TTS_TIMING]', JSON.stringify({ stage, durationMs, provider, status }));
}

const ready = new Map<string, { started: number; provider: string }>();
export function markTtsDone(jobId: string, provider: string) {
  if (ready.size >= 20) ready.delete(ready.keys().next().value!);
  ready.set(jobId, { started: ttsNow(), provider });
}
export function markTtsPlayable(jobId: string) {
  const value = ready.get(jobId);
  if (!value) return;
  ready.delete(jobId);
  ttsTiming('done_to_audio_playable', value.started, value.provider, 'PLAYABLE');
}
