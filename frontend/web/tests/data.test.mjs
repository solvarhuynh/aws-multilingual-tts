import assert from "node:assert/strict";
import test from "node:test";
import { environment, recording } from "./environment.mjs";

test("API frontend: nội dung sửa và phản hồi không hợp lệ", async (suite) => {
  const env = await environment();
  const { api } = await env.load("lib/api.ts");
  const response = (body, status = 200) => { globalThis.fetch = async () => ({ ok: status < 400, status, json: async () => body }); };
  const original = "toi muon nghe";
  const valid = { status: "checked", language: "vi-VN", hasTypos: true, originalText: original,
    correctedText: "tôi muốn nghe", changes: [{ from: "toi", to: "tôi", start: 0, end: 3 }] };
  try {
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
    await suite.test("từ chối loại không hỗ trợ và tệp vượt 10 MB", async () => {
      await assert.rejects(extractDocument(file("x.exe", "abc")), /Hỗ trợ tệp/);
      await assert.rejects(extractDocument(file("x.pdf", "", 11 * 1024 * 1024)), /10 MB/);
    });
    await suite.test("từ chối rỗng, dữ liệu nhị phân và quá 20.000 ký tự", async () => {
      for (const [text, message] of [["   ", /chưa có nội dung/], ["abc\0def", /không phải văn bản/], ["a".repeat(20001), /20.000/]])
        await assert.rejects(extractDocument(file("x.txt", text)), message);
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
