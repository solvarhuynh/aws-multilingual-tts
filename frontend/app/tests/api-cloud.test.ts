import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createHash } from 'node:crypto';

const original = globalThis.fetch;
after(() => { globalThis.fetch = original; delete process.env.EXPO_PUBLIC_API_BASE_URL; });

test('App dùng cùng API HTTPS cho giọng, tạo/phát, lịch sử và xóa; lỗi API không fallback', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://tts.test/';
  const { api, API_BASE, DEMO, configureSubmissionStore, setDemoToken } = await import('../src/lib/api');
  const calls: { url: string; init?: RequestInit }[] = [];
  const job = { jobId: 'fixture-job', status: 'DONE', audioUrl: 'https://audio.test/fixture.mp3',
    text: 'Xin chào.', lang: 'vi-VN', voice: 'verified', charCount: 9, createdAt: new Date().toISOString() };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const path = new URL(String(url)).pathname;
    const body = path === '/voices' ? { languages: [{ lang: 'vi-VN', provider: 'azure', engine: null, voices: [{ id: 'verified', gender: 'F' }] }] }
      : path === '/history' ? { items: [job], nextCursor: null }
      : path.startsWith('/history/') ? { deleted: true } : job;
    return new Response(JSON.stringify(body));
  };
  configureSubmissionStore({}, async () => {});
  setDemoToken('fixture-demo');
  assert.equal(API_BASE, 'https://tts.test'); assert.equal(DEMO, false);
  assert.equal((await api.voices())[0].provider, 'azure');
  assert.equal((await api.history()).items[0].jobId, job.jobId);
  await api.synthesize({ text: job.text, lang: job.lang, voice: job.voice, speed: 0.9, translateTo: null });
  assert.equal((await api.job(job.jobId)).audioUrl, job.audioUrl);
  await api.remove(job.jobId);
  assert.ok(calls.every(call => call.url.startsWith(API_BASE + '/') &&
    (call.init?.headers as Record<string, string>)['X-Demo-Token'] === 'fixture-demo'));
  assert.deepEqual(calls.map(call => new URL(call.url).pathname), ['/voices', '/history', '/synthesize', '/jobs/fixture-job', '/history/fixture-job']);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Mã truy cập chưa đúng.' } }), { status: 401 });
  await assert.rejects(api.voices(), /Mã truy cập chưa đúng/);
  setDemoToken('');
});

test('Đọc ảnh dùng API chung và mã demo, không gọi Gemini trực tiếp hoặc tạo MP3', async () => {
  const { api, setDemoToken } = await import('../src/lib/api');
  const calls: string[] = [];
  const page = { data: 'fixture-image-base64', mimeType: 'image/jpeg' };
  setDemoToken('ocr-test');
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    assert.equal((init?.headers as Record<string, string>)['X-Demo-Token'], 'ocr-test');
    assert.equal((init?.headers as Record<string, string>)['x-amz-content-sha256'], createHash('sha256').update(JSON.stringify(page)).digest('hex'));
    assert.deepEqual(JSON.parse(String(init?.body)), page);
    return new Response(JSON.stringify({ text: 'Chữ tiếng Việt', unclear: false, warnings: [], provider: 'gemini', model: 'gemini-test' }));
  };
  assert.equal((await api.recognizeDocument(page)).text, 'Chữ tiếng Việt');
  assert.deepEqual(calls, ['https://tts.test/documents/recognize']);
  setDemoToken('');
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'GEMINI_QUOTA', message: 'Đã hết lượt đọc.' } }), { status: 503 });
  await assert.rejects(api.recognizeDocument(page), /Đã hết lượt đọc/);
});
