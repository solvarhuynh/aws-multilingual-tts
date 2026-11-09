import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { environment, recording, settle } from "./environment.mjs";

test("Luồng tạo giọng và dữ liệu đến không đúng thứ tự", async (suite) => {
  const env = await environment();
  const { api, DEMO } = await env.load("lib/api.ts");
  const { useStudio } = await env.load("hooks/useStudio.ts");
  assert.equal(DEMO, false);
  const languages = [{ lang: "vi-VN", voices: [{ id: "Linh", gender: "F" }], provider: "external", engine: null },
    { lang: "en-US", voices: [{ id: "English", gender: "F" }], provider: "azure", engine: null, translationEnabled: true }];
  let studio, revision = 0, checked = [], submitted = [];
  const correction = (text) => ({ status: "checked", language: "vi-VN", hasTypos: true, originalText: text,
    correctedText: "tôi muốn nghe", changes: [{ from: "toi", to: "tôi", start: 0, end: 3 }] });
  function Harness({ target = null }) { studio = useStudio(() => {}, target); return null; }
  async function mount(text = "toi muon nghe", target = null) {
    checked = []; submitted = [];
    api.voices = async () => languages;
    api.history = async () => ({ items: [], nextCursor: null });
    api.synthesize = async (input) => { submitted.push(input); return recording(); };
    api.correct = async (text, lang) => { checked.push({ text, lang }); return { ...correction(text), hasTypos: false, correctedText: text }; };
    localStorage.clear();
    await act(async () => { env.root.render(React.createElement(Harness, { key: ++revision, target })); await settle(); });
    await act(() => studio.updateText(text));
  }
  try {
    await suite.test("double click chỉ kiểm tra và tạo job một lần; giữ nguyên khoảng trắng", async () => {
      await mount("  Nội dung nguyên bản.  ");
      await act(async () => { await Promise.all([studio.generate(), studio.generate()]); });
      assert.equal(checked.length, 1); assert.equal(submitted.length, 1);
      assert.equal(submitted[0].text, "  Nội dung nguyên bản.  ");
      assert.equal(studio.busy, false);
    });
    await suite.test("chờ chọn bản sửa, không kiểm tra lần hai hoặc gửi job trùng", async () => {
      await mount();
      api.correct = async (text) => { checked.push(text); return correction(text); };
      await act(async () => { await studio.generate(); });
      assert.ok(studio.review); assert.equal(submitted.length, 0);
      await act(async () => { await Promise.all([studio.resolveReview(true), studio.resolveReview(true)]); });
      assert.equal(checked.length, 1); assert.equal(submitted.length, 1);
      assert.equal(submitted[0].text, "tôi muốn nghe"); assert.equal(studio.text, "tôi muốn nghe");
    });
    await suite.test("giữ bản gốc hoặc bỏ qua khi kiểm tra lỗi", async () => {
      await mount(); api.correct = async (text) => correction(text);
      await act(async () => { await studio.generate(); await studio.resolveReview(false); });
      assert.equal(submitted[0].text, "toi muon nghe");
      await mount(); api.correct = async () => { throw new Error("Mất kết nối"); };
      await act(async () => { await studio.generate(); });
      assert.equal(submitted[0].text, "toi muon nghe"); assert.equal(studio.error, "");
      await mount();
      api.correct = async (text, lang) => { checked.push(text); return { status: "skipped", language: lang,
        hasTypos: false, originalText: text, correctedText: text, changes: [] }; };
      await act(async () => { await studio.generate(); });
      assert.equal(checked.length, 1);
      assert.equal(submitted[0].text, "toi muon nghe");
      assert.equal(studio.review, null);
    });
    await suite.test("sửa văn bản làm mất hiệu lực đề xuất cũ", async () => {
      await mount(); api.correct = async (text) => correction(text);
      await act(async () => { await studio.generate(); });
      await act(() => studio.updateText("Văn bản mới"));
      await act(async () => { await studio.resolveReview(true); });
      assert.equal(studio.review, null); assert.equal(submitted.length, 0);
    });
    await suite.test("bỏ kết quả kiểm tra nếu thiết lập đầu vào thay đổi giữa chừng", async () => {
      await mount(); let release, pending;
      api.correct = (text) => new Promise((resolve) => { release = () => resolve(correction(text)); });
      await act(() => { pending = studio.generate(); });
      await act(() => studio.setSpeed(1.5));
      await act(async () => { release(); await pending; });
      assert.equal(studio.review, null); assert.equal(submitted.length, 0); assert.equal(studio.busy, false);
    });
    await suite.test("phản hồi giọng cũ không ghi đè lần tải mới", async () => {
      await mount(); const queue = [];
      api.voices = () => new Promise((resolve) => queue.push(resolve));
      let first, second;
      await act(() => { first = studio.loadVoices(); second = studio.loadVoices(); });
      const latest = [{ ...languages[0], lang: "en-US", voices: [{ id: "Joanna", gender: "F" }] }];
      await act(async () => { queue[1](latest); await second; queue[0](languages); await first; });
      assert.equal(studio.lang, "en-US"); assert.equal(studio.voice, "Joanna");
    });
    await suite.test("chọn bản thu mới không bị phản hồi cũ ghi đè", async () => {
      await mount(); const queue = [];
      api.job = (id) => new Promise((resolve) => queue.push(() => resolve(recording(id))));
      let first, second;
      await act(() => { first = studio.openRecording(recording("old")); second = studio.openRecording(recording("new")); });
      await act(async () => { queue[1](); await second; queue[0](); await first; });
      assert.equal(studio.currentAudio.jobId, "new");
    });
    await suite.test("tài liệu dài gửi tuần tự, dừng khi hết quota và tiếp tục phần chưa xong", async () => {
      await mount('a'.repeat(10000) + 'b'.repeat(10000) + 'c'.repeat(900));
      let active = 0, maxActive = 0, count = 0;
      api.synthesize = async input => {
        submitted.push(input); active++; maxActive = Math.max(active, maxActive);
        await settle(); active--;
        if (++count === 2) throw new Error('Hết quota');
        return recording(`part-${count}`);
      };
      await act(async () => { await studio.generateAll(); });
      assert.equal(submitted.length, 2); assert.equal(maxActive, 1);
      assert.match(studio.error, /Hết quota/); assert.equal(checked.length, 0);
      await act(async () => { await studio.generateAll(); });
      assert.equal(submitted.length, 4);
      assert.equal(submitted[2].text, 'b'.repeat(10000));
      assert.equal(submitted[3].text, 'c'.repeat(900));
      assert.equal(studio.text.length, 20900);
    });
    await suite.test("dừng sau phần hiện tại và giữ các phần lặp là các bản thu riêng", async () => {
      await mount('a'.repeat(20000) + 'tail');
      api.synthesize = async input => { submitted.push(input); studio.stopBatch(); return recording(); };
      await act(async () => { await studio.generateAll(); });
      assert.equal(submitted.length, 1);
      api.synthesize = async input => { submitted.push(input); return recording(); };
      await act(async () => { await studio.generateAll(); });
      assert.equal(submitted.length, 3);
      assert.equal(submitted[0].text, submitted[1].text);
      assert.equal(submitted[2].text, 'tail');
    });
    await suite.test("sửa chính tả phần đã chọn giữ nguyên các phần khác", async () => {
      await mount('a'.repeat(10000) + 'toi muon nghe');
      const contexts = [];
      api.synthesize = async (input, context) => { submitted.push(input); contexts.push(context); return recording(); };
      await act(() => studio.setPartIndex(1));
      api.correct = async text => correction(text);
      await act(async () => { await studio.generate(); });
      assert.equal(studio.review.input.text, 'toi muon nghe');
      await act(() => studio.setPartIndex(0));
      await act(async () => { await studio.resolveReview(true); });
      assert.equal(studio.text, 'a'.repeat(10000) + 'tôi muốn nghe');
      assert.equal(submitted[0].text, 'tôi muốn nghe');
      assert.deepEqual(contexts, ['part-1']);
    });
    await suite.test("bỏ phần trắng không làm lệch idempotency context của phần sau", async () => {
      await mount('a'.repeat(10000) + ' '.repeat(20000) + 'b');
      const contexts = [];
      api.synthesize = async (input, context) => { contexts.push(context); return recording(); };
      await act(async () => { await studio.generateAll(); });
      assert.deepEqual(contexts, ['part-0', 'part-3']);
    });
    await suite.test("Azure là mặc định, giữ nguồn và dùng giọng đích; không gọi Gemini", async () => {
      await mount('Xin chào.', 'en-US');
      api.translate = async () => { throw new Error('Không tự đổi dịch vụ dịch'); };
      api.synthesize = async input => { submitted.push(input); return { ...recording('azure'), translated: true, text: 'Hello.', sourceLang: 'vi-VN', lang: 'en-US' }; };
      await act(async () => { await studio.generate(); });
      assert.equal(submitted.length, 1);
      assert.equal(submitted[0].translateTo, 'en-US');
      assert.equal(submitted[0].voice, 'English');
      assert.equal(studio.text, 'Xin chào.');
      assert.equal(studio.currentAudio.text, 'Hello.');
    });
  } finally { await act(() => env.root.unmount()); await env.close(); }
});

test("Tạo giọng đọc và Dịch và đọc giữ nội dung, tài liệu và bản nháp riêng", async () => {
  const env = await environment();
  const { api } = await env.load("lib/api.ts");
  const { useSession, useEditor, DRAFT_KEYS } = await env.load("hooks/useStudio.ts");
  api.voices = async () => [{ lang: "vi-VN", voices: [{ id: "Linh", gender: "F" }], provider: "azure", engine: null },
    { lang: "en-US", voices: [{ id: "English", gender: "F" }], provider: "azure", engine: null, translationEnabled: true }];
  api.history = async () => ({ items: [], nextCursor: null });
  localStorage.clear();
  localStorage.setItem(DRAFT_KEYS.speech, JSON.stringify("Bản nháp cũ trước khi tách trang."));
  let speech, translation;
  function Harness() {
    const session = useSession(() => {});
    speech = useEditor(session, () => {}, { draftKey: DRAFT_KEYS.speech });
    translation = useEditor(session, () => {}, { draftKey: DRAFT_KEYS.translation, translateTo: "en-US" });
    return null;
  }
  try {
    await act(async () => { env.root.render(React.createElement(Harness)); await settle(); });
    assert.equal(speech.text, "Bản nháp cũ trước khi tách trang.");
    assert.equal(translation.text, "");
    await act(() => translation.updateText("Nội dung cần dịch."));
    await act(() => speech.chooseVoice("en-US", "English"));
    assert.equal(speech.text, "Bản nháp cũ trước khi tách trang.");
    assert.equal(translation.text, "Nội dung cần dịch.");
    assert.equal(translation.lang, "vi-VN");
    assert.equal(speech.lang, "en-US");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });
    assert.equal(JSON.parse(localStorage.getItem(DRAFT_KEYS.speech)), "Bản nháp cũ trước khi tách trang.");
    assert.equal(JSON.parse(localStorage.getItem(DRAFT_KEYS.translation)), "Nội dung cần dịch.");
  } finally { await act(() => env.root.unmount()); await env.close(); }
});
