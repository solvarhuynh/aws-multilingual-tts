import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createHash } from 'node:crypto';
import { environment, settle } from './environment.mjs';

test('Đọc ảnh trực tuyến: API, đối chiếu trước khi thay bản nháp và xử lý hủy/lỗi', async suite => {
  const env = await environment();
  const { api, saveDemoToken } = await env.load('lib/api.ts');
  const { useStudio } = await env.load('hooks/useStudio.ts');
  const result = { text: 'Nguyễn Thị Mỹ · 1.250.000 đồng', unclear: true, warnings: ['Cuối trang mờ.'], provider: 'gemini', model: 'gemini-test' };
  let studio;
  const OldImage = globalThis.Image;
  const oldCreateUrl = URL.createObjectURL, oldRevokeUrl = URL.revokeObjectURL;
  globalThis.Image = class {
    naturalWidth = 800; naturalHeight = 1200;
    set src(value) { if (value) queueMicrotask(() => this.onload?.()); }
  };
  URL.createObjectURL = () => 'blob:fixture'; URL.revokeObjectURL = () => {};
  env.win.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {}, fillRect() {} });
  env.win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,/9j/Zml4dHVyZQ==';
  const image = { name: 'tai-lieu.png', size: 100, type: 'image/png' };
  function Harness() { studio = useStudio(() => {}); return null; }
  try {
    await suite.test('Ảnh gửi đúng API/token/hash; lỗi quota không fallback', async () => {
      const page = { data: 'fixture', mimeType: 'image/png' };
      saveDemoToken('fixture-token');
      globalThis.fetch = async (url, init) => {
        assert.equal(url, 'https://tts.test/documents/recognize');
        assert.equal(init.headers['X-Demo-Token'], 'fixture-token');
        assert.equal(init.headers['x-amz-content-sha256'], createHash('sha256').update(JSON.stringify(page)).digest('hex'));
        return { ok: true, json: async () => result };
      };
      assert.equal((await api.recognizeDocument(page)).text, result.text);
      globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: { code: 'GEMINI_QUOTA', message: 'Hết lượt đọc.' } }) });
      await assert.rejects(api.recognizeDocument(page), /Hết lượt đọc/);
    });
    api.voices = async () => [{ lang: 'vi-VN', voices: [{ id: 'verified', gender: 'F' }], provider: 'azure', engine: null }];
    api.history = async () => ({ items: [], nextCursor: null });
    await act(async () => { env.root.render(React.createElement(Harness)); await settle(); });
    await act(() => studio.updateText('Bản nháp đang soạn.'));
    api.recognizeDocument = async () => result;
    await suite.test('Đọc xong phải duyệt; hủy giữ bản gốc, không tạo giọng ngầm', async () => {
      await act(async () => { await studio.importFile(image); });
      assert.equal(studio.documentMode, 'gemini');
      assert.equal(studio.text, 'Bản nháp đang soạn.');
      assert.equal(studio.documentReview.text, result.text);
      assert.match(studio.documentReview.warning, /Cuối trang/);
      let calls = 0; api.synthesize = async () => { calls++; };
      await act(async () => { await studio.generate(); await studio.generateAll(); });
      assert.equal(calls, 0);
      await act(() => studio.closeDocumentReview());
      assert.equal(studio.documentReview, null);
      assert.equal(studio.text, 'Bản nháp đang soạn.');
    });
    await suite.test('Chấp nhận bản chỉnh và chặn kết quả cũ khi bản nháp thay đổi', async () => {
      await act(async () => { await studio.importFile(image); });
      await act(() => studio.acceptDocument('Nội dung đã đối chiếu.'));
      assert.equal(studio.text, 'Nội dung đã đối chiếu.');
      assert.equal(studio.fileName, 'tai-lieu.png');
      await act(async () => { await studio.importFile(image); });
      await act(() => studio.updateText('Nội dung mới.'));
      await act(() => studio.acceptDocument(result.text));
      assert.equal(studio.text, 'Nội dung mới.');
      assert.match(studio.error, /Bản nháp đã thay đổi/);
    });
    await suite.test('Lỗi mạng/quota giữ bản nháp; không mở màn review giả', async () => {
      api.recognizeDocument = async () => { throw new Error('Gemini hết quota.'); };
      await act(async () => { await studio.importFile(image); });
      assert.equal(studio.text, 'Nội dung mới.');
      assert.equal(studio.documentReview, null);
      assert.match(studio.error, /hết quota/);
    });
    await suite.test('Bản sửa quá số từ báo lỗi ngay trong màn duyệt', async () => {
      const { default: DocumentReview } = await env.load('components/DocumentReview.tsx');
      let accepted = false;
      await act(async () => { env.root.render(React.createElement(DocumentReview, {
        text: result.text, file: image, warning: '', onClose() {}, onAccept() { accepted = true; },
      })); await settle(); });
      const input = env.mount.querySelector('textarea');
      await act(() => {
        Object.getOwnPropertyDescriptor(env.win.HTMLTextAreaElement.prototype, 'value').set.call(input, 'a '.repeat(50001));
        input.dispatchEvent(new env.win.Event('input', { bubbles: true }));
      });
      await act(() => env.mount.querySelector('.primary-button').click());
      assert.equal(accepted, false);
      assert.match(env.mount.querySelector('[role="alert"]').textContent, /50.000/);
    });
  } finally {
    await act(() => env.root.unmount());
    globalThis.Image = OldImage;
    URL.createObjectURL = oldCreateUrl; URL.revokeObjectURL = oldRevokeUrl;
    await env.close();
  }
});
