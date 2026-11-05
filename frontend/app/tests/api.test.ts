import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { api, checkedJob, request } from '../src/lib/api';
const original = globalThis.fetch;
after(() => { globalThis.fetch = original; });
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
test('Lỗi máy chủ và dữ liệu sai không trở thành thành công', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'PROVIDER_ERROR', message: 'Giọng đọc tạm bận.' } }), { status: 502 });
  await assert.rejects(request('/voices'), /Giọng đọc tạm bận/);
  globalThis.fetch = async () => new Response(JSON.stringify({ languages: [null] }));
  await assert.rejects(api.voices(), /chưa hợp lệ/);
  assert.throws(() => checkedJob({ jobId: 'x', status: 'DONE', audioUrl: 'file:///secret' }), /chưa đúng/);
});
