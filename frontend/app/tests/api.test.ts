import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createHash } from 'node:crypto';
import { api, checkedJob, configureSubmissionStore, request, setDemoToken } from '../src/lib/api';
const original = globalThis.fetch;
configureSubmissionStore({}, async () => {});
after(() => { globalThis.fetch = original; });
test('Gửi token và hash đúng của body', async () => {
  let headers: Record<string, string> = {};
  globalThis.fetch = async (_, init) => {
    headers = init?.headers as Record<string, string>;
    return new Response('{}');
  };
  setDemoToken(' ma-demo ');
  const body = JSON.stringify({ text: 'Xin chào 🎙️' });
  await request('/synthesize', { method: 'POST', body });
  setDemoToken('');
  assert.equal(headers['X-Demo-Token'], 'ma-demo');
  assert.equal(headers['x-amz-content-sha256'], createHash('sha256').update(body, 'utf8').digest('hex'));
  await request('/voices');
  assert.equal(headers['X-Demo-Token'], undefined);
  assert.equal(headers['x-amz-content-sha256'], undefined);
});
test('Giữ định dạng API và gửi nội dung đúng một lần', async () => {
  const calls: { url: string; body: string | undefined }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body?.toString() });
    return new Response(JSON.stringify({ jobId: 'job-1', status: 'PENDING', audioUrl: null }), { status: 202 });
  };
  const input = { text: 'Xin chào.', lang: 'vi-VN', voice: 'Linh', speed: 1, translateTo: null };
  await api.synthesize(input);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/synthesize');
  assert.deepEqual(JSON.parse(calls[0].body!), input);
});
test('Không dùng kết quả kiểm tra nhầm nội dung', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ originalText: 'Văn bản khác', correctedText: 'Sai', hasTypos: true }));
  assert.equal(await api.correct('Xin chào.', 'vi-VN'), null);
});
test('Nhận giọng Azure có tên từ API', async () => {
  const language = { lang: 'vi-VN', provider: 'azure', engine: null,
    voices: [{ id: 'vi-VN-HoaiMyNeural', name: 'Hoài My', gender: 'F' }] };
  globalThis.fetch = async () => new Response(JSON.stringify({ languages: [language] }));
  assert.deepEqual(await api.voices(), [language]);
});
test('Lỗi máy chủ và dữ liệu sai không trở thành thành công', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'PROVIDER_ERROR', message: 'Giọng đọc tạm bận.' } }), { status: 502 });
  await assert.rejects(request('/voices'), /Giọng đọc tạm bận/);
  globalThis.fetch = async () => new Response(JSON.stringify({ languages: [null] }));
  await assert.rejects(api.voices(), /chưa hợp lệ/);
  assert.throws(() => checkedJob({ jobId: 'x', status: 'DONE', audioUrl: 'file:///secret' }), /chưa đúng/);
});

test('App nhận giới hạn và khả năng dịch thực; không dùng giới hạn sai từ catalog', async () => {
  const language = { lang: 'vi-VN', provider: 'azure', engine: null, voices: [{ id: 'verified', gender: 'F' }] };
  globalThis.fetch = async () => new Response(JSON.stringify({ languages: [language], limits: { maxChars: 1200 }, features: { translation: false } }));
  assert.deepEqual(await api.voices(), [{ ...language, maxChars: 1200, translationEnabled: false }]);
  globalThis.fetch = async () => new Response(JSON.stringify({ languages: [language], limits: { maxChars: 1 } }));
  await assert.rejects(api.voices(), /Giới hạn/);
});

test('Replay sau mất kết nối và SUBMIT_UNCERTAIN dùng cùng key, khác phần dùng key riêng', async () => {
  configureSubmissionStore({}, async () => {});
  const keys: string[] = [];
  let count = 0;
  const input = { text: 'Idempotent content', lang: 'vi-VN', voice: 'Linh', speed: 1, translateTo: null };
  globalThis.fetch = async (_, init) => {
    keys.push((init!.headers as Record<string, string>)['Idempotency-Key']);
    if (++count === 1) throw new TypeError('network');
    if (count === 2) return new Response(JSON.stringify({ error: { code: 'SUBMIT_UNCERTAIN', message: 'Kiểm tra lịch sử' } }), { status: 503 });
    return new Response(JSON.stringify({ jobId: 'same-job', status: 'PENDING', audioUrl: null }), { status: 202 });
  };
  await assert.rejects(api.synthesize(input, 'part-1'));
  await assert.rejects(api.synthesize(input, 'part-1'));
  assert.equal((await api.synthesize(input, 'part-1')).jobId, 'same-job');
  assert.equal(keys[0], keys[1]); assert.equal(keys[1], keys[2]);
  await api.synthesize(input, 'part-2'); assert.notEqual(keys[2], keys[3]);
});

test('Storage hỏng ngăn submit trước khi gửi mạng', async () => {
  configureSubmissionStore({}, async () => { throw new Error('storage'); });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{}'); };
  await assert.rejects(api.synthesize({ text: 'one', lang: 'vi-VN', voice: 'Linh', speed: 1, translateTo: null }), /storage/);
  assert.equal(calls, 0);
  configureSubmissionStore({}, async () => {});
});
