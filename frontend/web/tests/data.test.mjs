import assert from "node:assert/strict";
import test from "node:test";
import { environment, recording } from "./environment.mjs";

test("API frontend: nội dung sửa và phản hồi không hợp lệ", async (suite) => {
  const env = await environment();
  const { api } = await env.load("lib/api.ts");
  const { API_BASE, DEMO } = await env.load("lib/api.ts");
  const response = (body, status = 200) => { globalThis.fetch = async () => ({ ok: status < 400, status, json: async () => body }); };
  const original = "toi muon nghe";
  const valid = { status: "checked", language: "vi-VN", hasTypos: true, originalText: original,
    correctedText: "tôi muốn nghe", changes: [{ from: "toi", to: "tôi", start: 0, end: 3 }] };
  try {
    await suite.test("có API base thì dùng CloudFront URL cấu hình, không vào mock mode", () => {
      assert.equal(API_BASE, "https://tts.test");
      assert.equal(DEMO, false);
    });
    await suite.test("nhận giọng Azure và hiển thị tên dịch vụ", async () => {
      const { providerLabel } = await env.load("lib/data.ts");
      response({ languages: [{ lang: "vi-VN", provider: "azure", engine: null,
        voices: [{ id: "vi-VN-HoaiMyNeural", name: "Hoài My", gender: "F" }] }] });
      const languages = await api.voices();
      assert.equal(languages[0].voices[0].name, "Hoài My");
      assert.equal(providerLabel(languages[0].provider), "Azure Speech");
    });
    await suite.test("gửi token người dùng nhập và hash đúng của body", async () => {
      let headers;
      globalThis.fetch = async (_, init) => { headers = init.headers; return { ok: true, json: async () => valid }; };
      const { saveDemoToken } = await env.load("lib/api.ts");
      saveDemoToken(" ma-demo ");
      await api.correct(original, "vi-VN");
      saveDemoToken("");
      const { createHash } = await import("node:crypto");
      const body = JSON.stringify({ text: original, lang: "vi-VN" });
      assert.equal(headers["X-Demo-Token"], "ma-demo");
      assert.equal(headers["x-amz-content-sha256"], createHash("sha256").update(body).digest("hex"));
    });
    await suite.test("gửi đúng route và giữ nguyên văn bản cần kiểm tra", async () => {
      let sent;
      globalThis.fetch = async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return { ok: true, json: async () => valid }; };
      assert.equal((await api.correct(original, "vi-VN")).correctedText, "tôi muốn nghe");
      assert.equal(sent.url, "https://tts.test/text/correct");
      assert.deepEqual(sent.body, { text: original, lang: "vi-VN" });
    });
    await suite.test("bỏ phản hồi sửa nhầm bản gốc hoặc vị trí vượt văn bản", async () => {
      response({ ...valid, originalText: "Văn bản khác" });
      await assert.rejects(api.correct(original, "vi-VN"), { code: "INVALID_RESPONSE" });
      response({ ...valid, changes: [{ from: "a", to: "b", start: 0, end: 999 }] });
      await assert.rejects(api.correct(original, "vi-VN"), { code: "INVALID_RESPONSE" });
    });
    await suite.test("dịch gửi đúng đoạn/ngữ cảnh và từ chối phản hồi sai", async () => {
      let sent;
      globalThis.fetch = async (url, init) => {
        sent = { url, body: JSON.parse(init.body) };
        return { ok: true, json: async () => ({ sourceLang: "vi-VN", targetLang: "en-US", translatedText: "Hello." }) };
      };
      assert.equal((await api.translate("Xin chào.", "vi-VN", "en-US", "Đoạn trước.")).translatedText, "Hello.");
      assert.equal(sent.url, "https://tts.test/text/translate");
      assert.deepEqual(sent.body, { text: "Xin chào.", sourceLang: "vi-VN", targetLang: "en-US", context: "Đoạn trước." });
      response({ sourceLang: "vi-VN", targetLang: "ja-JP", translatedText: "Hello." });
      await assert.rejects(api.translate("Xin chào.", "vi-VN", "en-US"), { code: "INVALID_RESPONSE" });
    });
    await suite.test("không hiện TODO của backend cho người dùng", async () => {
      response({ error: { code: "NOT_IMPLEMENTED", message: "TODO" } }, 501);
      await assert.rejects(api.synthesize({ text: original, lang: "vi-VN", voice: "Linh", speed: 1, translateTo: null }),
        (error) => error.code === "NOT_IMPLEMENTED" && !error.message.includes("TODO"));
    });
    await suite.test("từ chối URL âm thanh không phải HTTP và lịch sử sai kiểu", async () => {
      response({ jobId: "bad", status: "DONE", audioUrl: "javascript:alert(1)" });
      await assert.rejects(api.job("bad"), { code: "INVALID_RESPONSE" });
      response({ items: {}, nextCursor: null });
      await assert.rejects(api.history(), { code: "INVALID_RESPONSE" });
    });
    await suite.test("Stats lấy đúng route, giữ số 0 và báo 503 có mã HTTP", async () => {
      let sent;
      globalThis.fetch = async url => { sent = url; return { ok: true, status: 200,
        json: async () => ({ totalJobs: 0, totalChars: 0, byLang: {}, cacheHits: 0 }) }; };
      assert.equal((await api.stats()).totalJobs, 0);
      assert.equal(sent, "https://tts.test/stats");
      globalThis.fetch = async () => ({ ok: false, status: 503,
        json: async () => ({ error: { code: "STATS_UNAVAILABLE", message: "Quét chưa đủ" } }) });
      await assert.rejects(api.stats(), error => error.status === 503 && error.code === "STATS_UNAVAILABLE");
    });
    await suite.test("gửi lại cùng key sau mất mạng/503; phần khác dùng key khác", async () => {
      const keys = []; let count = 0;
      const input = { text: 'Nội dung cần thử lại.', lang: 'vi-VN', voice: 'Linh', speed: 1, translateTo: null };
      globalThis.fetch = async (_, init) => {
        keys.push(init.headers['Idempotency-Key']);
        if (++count === 1) throw new TypeError('network');
        if (count === 2) return { ok: false, status: 503, json: async () => ({ error: { code: 'SUBMIT_UNCERTAIN', message: 'Kiểm tra lịch sử' } }) };
        return { ok: true, status: 202, json: async () => ({ jobId: 'retry', status: 'PENDING', audioUrl: null }) };
      };
      await assert.rejects(api.synthesize(input, 'part-1'));
      await assert.rejects(api.synthesize(input, 'part-1'), { code: 'SUBMIT_UNCERTAIN' });
      assert.equal((await api.synthesize(input, 'part-1')).jobId, 'retry');
      assert.equal(keys[0], keys[1]); assert.equal(keys[1], keys[2]);
      await api.synthesize(input, 'part-2'); assert.notEqual(keys[2], keys[3]);
      assert.equal(localStorage.getItem('voxa.pendingSubmits.v1').includes(input.text), false);
    });
    await suite.test("job kết thúc xóa key cũ; tạo bản thu mới dùng key mới", async () => {
      const keys = [], input = { text: 'Terminal replay', lang: 'vi-VN', voice: 'Linh', speed: 1, translateTo: null };
      globalThis.fetch = async (_, init) => {
        keys.push(init.headers['Idempotency-Key']);
        return { ok: true, json: async () => ({ jobId: 'terminal', status: 'DONE', audioUrl: 'https://audio.test/one.mp3' }) };
      };
      await api.synthesize(input); await api.synthesize(input);
      assert.notEqual(keys[0], keys[1]);
    });
  } finally { await env.close(); }
});

test("Không cấu hình API base thì mock mode không gọi mạng", async () => {
  const env = await environment({ demo: true });
  try {
    const { api, API_BASE, DEMO } = await env.load("lib/api.ts");
    assert.equal(API_BASE, ""); assert.equal(DEMO, true);
    assert.equal((await api.stats()).totalJobs, 0);
    assert.equal((await api.correct("Xin chào", "vi-VN")).status, "skipped");
  } finally { await env.close(); }
});

test("Nhập tài liệu: nội dung và giới hạn", async (suite) => {
  const env = await environment();
  const { extractDocument } = await env.load("lib/document.ts");
  const file = (name, text, size = text.length) => ({ name, size, text: async () => text });
  try {
    await suite.test("giữ tiếng Việt, bỏ BOM và khoảng trắng ngoài", async () => {
      assert.equal(await extractDocument(file("THONGBAO.TXT", "\uFEFF  Nội dung tiếng Việt.\nDòng hai.  ")), "Nội dung tiếng Việt.\nDòng hai.");
    });
    await suite.test("từ chối loại không hỗ trợ và tệp vượt 50 MB", async () => {
      await assert.rejects(extractDocument(file("x.exe", "abc")), /Hỗ trợ/);
      await assert.rejects(extractDocument(file("x.pdf", "", 51 * 1024 * 1024)), /50 MB/);
    });
    await suite.test("từ chối rỗng, dữ liệu nhị phân và quá giới hạn tài liệu", async () => {
      for (const [text, message] of [["   ", /không có chữ/], ["abc\0def", /không phải văn bản/], ["a".repeat(200001), /200\.000/], ['a '.repeat(50001), /50\.000/]])
        await assert.rejects(extractDocument(file("x.txt", text)), message);
    });
    await suite.test("nhập hơn chục nghìn từ, không cắt còn 2.000 ký tự", async () => {
      const text = 'Bài học AWS. '.repeat(6000).trim();
      assert.equal(await extractDocument(file('long.md', text, 12 * 1024 * 1024)), text);
    });
    await suite.test("hủy đang đọc không ghi kết quả muộn", async () => {
      const controller = new AbortController();
      const pending = extractDocument({ name: 'slow.txt', size: 10, text: () => new Promise(() => {}) }, { signal: controller.signal });
      controller.abort();
      await assert.rejects(pending, /Đã hủy/);
    });
  } finally { await env.close(); }
});

test("Báo cáo CSV giữ tiếng Việt, dấu câu và không chứa link nghe tạm thời", async () => {
  const env = await environment();
  const { historyCsv } = await env.load("lib/data.ts");
  try {
    const csv = historyCsv([{ ...recording(), text: '=SUM(1,2)\n"Tiếng Việt"' }]);
    assert.equal(csv.charCodeAt(0), 0xFEFF);
    assert.match(csv, /"'=SUM\(1,2\)\n""Tiếng Việt"""/);
    assert.match(csv, /"Mã bản thu","Nội dung"/);
    assert.doesNotMatch(csv, /https:\/\/audio\.test/);
  } finally { await env.close(); }
});
