import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import React, { act } from "react";
import { environment } from "./environment.mjs";

test("giao diện hệ thống cập nhật theo thiết bị và dọn listener khi đổi chế độ", async () => {
  const env = await environment();
  const callbacks = new Set();
  const media = { matches: false, addEventListener: (_, fn) => callbacks.add(fn), removeEventListener: (_, fn) => callbacks.delete(fn) };
  env.win.matchMedia = () => media;
  const { useTheme } = await env.load("hooks/useTheme.ts");
  function Probe({ mode }) { useTheme(mode); return null; }
  try {
    await act(() => env.root.render(React.createElement(Probe, { mode: "system" })));
    assert.equal(document.documentElement.dataset.theme, "light");
    assert.equal(callbacks.size, 1);
    await act(() => { media.matches = true; callbacks.forEach(fn => fn()); });
    assert.equal(document.documentElement.dataset.theme, "dark");
    await act(() => env.root.render(React.createElement(Probe, { mode: "light" })));
    assert.equal(document.documentElement.dataset.theme, "light");
    assert.equal(callbacks.size, 0);
    await act(() => env.root.unmount());
    assert.equal(callbacks.size, 0);
  } finally { await env.close(); }
});

test("chọn đúng màu trước khi React tải, kể cả dữ liệu cũ/hỏng hoặc bộ nhớ bị chặn", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const [stored, dark, expected] of [['{"theme":"dark"}', false, "dark"], ['{"theme":"light"}', true, "light"],
    ['{"volume":0.3}', true, "dark"], ['{"theme":"system"}', false, "light"], ['{broken', true, "dark"], [null, true, "dark"]]) {
    const root = { dataset: {}, style: {} }, meta = {};
    runInNewContext(script, { document: { documentElement: root, querySelector: () => meta },
      matchMedia: () => ({ matches: dark }), localStorage: { getItem: () => { if (stored === null) throw new Error("blocked"); return stored; } } });
    assert.equal(root.dataset.theme, expected);
    assert.equal(root.style.colorScheme, expected);
    assert.equal(meta.content, expected === "dark" ? "#000000" : "#edf4f9");
  }
});
