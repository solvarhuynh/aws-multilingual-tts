import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { environment, recording, settle } from "./environment.mjs";

test("Ứng dụng: điều hướng, sidebar, loading và modal", async (suite) => {
  const env = await environment();
  const { api } = await env.load("lib/api.ts");
  const { default: App } = await env.load("App.tsx");
  const { Modal } = await env.load("components/ui.tsx");
  api.voices = async () => [
    { lang: "vi-VN", voices: [{ id: "Linh", gender: "F" }], provider: "external", engine: null },
    { lang: "en-US", voices: [{ id: "Joanna", gender: "F" }], provider: "polly", engine: "neural" },
  ];
  api.history = async () => ({ items: [recording()], nextCursor: null });
  api.stats = async () => ({ totalJobs: 1, totalChars: 17, byLang: { "vi-VN": 1 }, cacheHits: 0 });
  env.win.HTMLMediaElement.prototype.pause = () => {};
  async function click(element) { assert.ok(element); await act(async () => { element.click(); await settle(); }); }
  try {
    await act(async () => { env.root.render(React.createElement(App)); await settle(); });
    await suite.test("tám màn hình render và giữ tên sản phẩm trên tab", async () => {
      for (const [route, title] of [["dashboard", "Tổng quan"], ["studio", "Tạo giọng đọc"], ["translation", "Dịch và đọc"],
        ["documents", "Đọc tài liệu"], ["voices", "Chọn giọng đọc"], ["library", "Bản thu đã lưu"]]) {
        await click(env.mount.querySelector(`.sidebar a[href="#${route}"]`));
        assert.equal(env.mount.querySelector("h1").textContent, title);
        assert.match(document.title, /TTS Studio/);
      }
      await click(env.mount.querySelector('[aria-label="Cài đặt"]'));
      assert.equal(env.mount.querySelector("h1").textContent, "Cài đặt");
      await click(env.mount.querySelector('[aria-label="Hướng dẫn"]'));
      assert.equal(env.mount.querySelector("h1").textContent, "Hướng dẫn sử dụng");
    });
    await suite.test("sidebar thu gọn được và lưu lựa chọn", async () => {
      await click(env.mount.querySelector('[aria-label="Thu gọn thanh bên"]'));
      assert.ok(env.mount.querySelector(".app-shell.sidebar-collapsed"));
      assert.equal(localStorage.getItem("tts.sidebar.collapsed"), "true");
      assert.ok(env.mount.querySelector('.sidebar a[aria-label="Tổng quan"]'));
      await click(env.mount.querySelector('[aria-label="Hiện thanh bên"]'));
      assert.equal(env.mount.querySelector(".app-shell.sidebar-collapsed"), null);
    });
    await suite.test("Ctrl K mở tìm kiếm; Escape đóng qua state và phục hồi focus", async () => {
      await act(async () => { window.dispatchEvent(new env.win.KeyboardEvent("keydown", { key: "k", ctrlKey: true })); await settle(); });
      const dialog = document.querySelector('dialog[aria-label="Tìm kiếm"]');
      assert.ok(dialog?.open);
      await act(async () => { dialog.dispatchEvent(new env.win.Event("cancel", { cancelable: true })); await settle(); });
      assert.equal(document.querySelector('dialog[aria-label="Tìm kiếm"]'), null);
    });
    await suite.test("không báo trống khi lịch sử đang tải hoặc tải lỗi", async () => {
      let reject;
      api.history = () => new Promise((_, fail) => { reject = fail; });
      await act(async () => { env.root.render(React.createElement(App, { key: "loading" })); await settle(); });
      await click(env.mount.querySelector('.sidebar a[href="#dashboard"]'));
      assert.match(env.mount.textContent, /Đang tải bản thu/);
      assert.doesNotMatch(env.mount.textContent, /Chưa có bản thu/);
      await act(async () => { reject(new Error("Lịch sử tạm thời chưa tải được")); await settle(); });
      assert.match(env.mount.textContent, /Lịch sử tạm thời chưa tải được/);
      assert.doesNotMatch(env.mount.textContent, /Chưa có bản thu/);
    });
    await suite.test("Escape không đóng hộp thoại trong lúc thao tác chưa hoàn tất", async () => {
      let dismissible = false, closes = 0;
      function Dialog() {
        const [open, setOpen] = useState(true);
        return open && React.createElement(Modal, { title: "Đang xử lý", dismissible,
          onClose: () => { closes++; setOpen(false); } }, "Nội dung");
      }
      await act(async () => { env.root.render(React.createElement(Dialog)); await settle(); });
      const dialog = document.querySelector("dialog");
      const cancel = new env.win.Event("cancel", { cancelable: true });
      await act(() => dialog.dispatchEvent(cancel));
      assert.equal(cancel.defaultPrevented, true); assert.equal(dialog.open, true); assert.equal(closes, 0);
      assert.equal(dialog.querySelector('[aria-label="Đóng cửa sổ"]').disabled, true);
      dismissible = true;
      await act(() => env.root.render(React.createElement(Dialog)));
      await act(() => dialog.dispatchEvent(new env.win.Event("cancel", { cancelable: true })));
      assert.equal(closes, 1); assert.equal(document.querySelector("dialog"), null);
    });
  } finally { await act(() => env.root.unmount()); await env.close(); }
});
