import assert from "node:assert/strict";
import test from "node:test";
import { environment } from "./environment.mjs";

test("Chỉ bật bridge local khi cấu hình rõ; TTS và Stats vẫn ở mock mode", async () => {
  const env = await environment({ demo: true, localAi: "http://127.0.0.1:8765" });
  try {
    const { api, DEMO, saveDemoToken } = await env.load("lib/api.ts");
    saveDemoToken('only-for-main-api');
    const sent = [];
    globalThis.fetch = async (url, init) => {
      sent.push(url);
      assert.equal(init.headers['X-Demo-Token'], undefined, 'Không gửi mã API chính sang bridge riêng');
      const body = JSON.parse(init.body);
      const data = url.endsWith("/text/correct")
        ? { status: "checked", language: body.lang, hasTypos: true, originalText: body.text,
            correctedText: "Xin chào.", changes: [{ from: "chàoo", to: "chào", start: 4, end: 8 }] }
        : { sourceLang: body.sourceLang, targetLang: body.targetLang, translatedText: "Hello." };
      return { ok: true, json: async () => data };
    };
    assert.equal(DEMO, true);
    assert.equal((await api.correct("Xin chàoo.", "vi-VN")).hasTypos, true);
    assert.equal((await api.translate("Xin chào.", "vi-VN", "en-US")).translatedText, "Hello.");
    assert.equal((await api.synthesize({ text: "Xin chào.", lang: "vi-VN", voice: "Linh", speed: 1, translateTo: null })).status, "PENDING");
    await api.stats();
    assert.deepEqual(sent, ["http://127.0.0.1:8765/text/correct", "http://127.0.0.1:8765/text/translate"]);
  } finally { await env.close(); }
});
