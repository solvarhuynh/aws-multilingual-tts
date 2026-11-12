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
  async function type(input, value) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(env.win.HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new env.win.Event("input", { bubbles: true }));
      await settle();
    });
  }
  try {
    await act(async () => { env.root.render(React.createElement(App)); await settle(); });
    await suite.test("bảy màn hình render và giữ tên sản phẩm trên tab", async () => {
      for (const [route, title] of [["dashboard", "Tổng quan"], ["studio", "Tạo giọng đọc"], ["translation", "Dịch và đọc"],
        ["voices", "Chọn giọng đọc"], ["library", "Bản thu đã lưu"]]) {
        await click(env.mount.querySelector(`.sidebar a[href="#${route}"]`));
        assert.equal(env.mount.querySelector("h1").textContent, title);
        assert.match(document.title, /TTS Studio/);
      }
      assert.equal(env.mount.querySelector('.sidebar a[href="#documents"]'), null);
      await click(env.mount.querySelector('[aria-label="Cài đặt"]'));
      assert.equal(env.mount.querySelector("h1").textContent, "Cài đặt");
      await click(env.mount.querySelector('[aria-label="Hướng dẫn"]'));
      assert.equal(env.mount.querySelector("h1").textContent, "Hướng dẫn sử dụng");
    });
    await suite.test("chọn giao diện sáng/tối và lưu cùng tùy chọn cũ", async () => {
      await click(env.mount.querySelector('.sidebar a[href="#settings"]'));
      await click(env.mount.querySelector('input[name="theme"][value="dark"]'));
      assert.equal(document.documentElement.dataset.theme, "dark");
      assert.equal(document.documentElement.style.colorScheme, "dark");
      const saved = JSON.parse(localStorage.getItem("voxa.preferences.v1"));
      assert.equal(saved.theme, "dark");
      assert.equal(saved.volume, 0.8);
      assert.equal(saved.highContrast, false);
      await click(env.mount.querySelector('input[name="theme"][value="light"]'));
      assert.equal(document.documentElement.dataset.theme, "light");
    });
    await suite.test("thanh trên chào Nhóm 5, đặt tên trang bên dưới và xuất báo cáo CSV", async () => {
      await click(env.mount.querySelector('.sidebar a[href="#help"]'));
      const header = env.mount.querySelector('.page-header');
      assert.match(header.querySelector('.header-greeting').textContent, /Chào buổi (sáng|chiều|tối), Nhóm 5/);
      assert.equal(header.querySelector('.header-greeting strong').textContent, "Nhóm 5");
      assert.ok(header.querySelector('.header-avatar[role="img"] svg'));
      assert.equal(header.querySelector('h1'), null);
      assert.equal(header.nextElementSibling.tagName, "H1");
      assert.ok(header.nextElementSibling.classList.contains('page-title'));
      assert.equal(header.nextElementSibling.textContent, "Hướng dẫn sử dụng");
      assert.ok(header.querySelector('img[alt="HCMUTE"]'));
      assert.equal(env.mount.querySelector('.sidebar img[alt="HCMUTE"]'), null);
      assert.ok(env.mount.querySelector('.sidebar img[alt="AWS"]'));
      assert.equal(header.querySelector('.header-create'), null);
      const originalClick = env.win.HTMLAnchorElement.prototype.click;
      const originalCreate = URL.createObjectURL;
      let exported, filename;
      URL.createObjectURL = (blob) => { exported = blob; return "blob:tts-report"; };
      env.win.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
      try {
        await click(header.querySelector('.header-utility'));
        assert.match(filename, /^tts-studio-report-.*\.csv$/);
        assert.match(await exported.text(), /Nội dung bản thu/);
      } finally {
        env.win.HTMLAnchorElement.prototype.click = originalClick;
        URL.createObjectURL = originalCreate;
      }
    });
    await suite.test("nút tạo giọng nằm trong ô nhập và submit không tạo bản thu trùng", async () => {
      await click(env.mount.querySelector('.sidebar a[href="#studio"]'));
      const form = env.mount.querySelector('.composer');
      const button = form.querySelector('.editor-status button[type="submit"]');
      const editor = form.querySelector('textarea');
      assert.ok(button);
      assert.equal(env.mount.querySelector('.editor-panel > .editor-footer'), null);
      assert.equal(form.querySelector('.editor-footer'), null);
      const originalCorrect = api.correct, originalSynthesize = api.synthesize;
      let submissions = 0;
      api.correct = async (text, language) => ({ status: "skipped", language, hasTypos: false,
        originalText: text, correctedText: text, changes: [] });
      api.synthesize = async () => { submissions++; return recording("inline"); };
      try {
        await act(() => {
          Object.getOwnPropertyDescriptor(env.win.HTMLTextAreaElement.prototype, "value").set.call(editor, "Nội dung kiểm tra.");
          editor.dispatchEvent(new env.win.Event("input", { bubbles: true }));
        });
        await act(async () => { button.click(); button.click(); await settle(); });
        assert.equal(submissions, 1);
        await click(form.querySelector('[aria-label="Xóa nội dung văn bản"]'));
        await click(button);
        assert.ok(form.querySelector('#form-error[role="alert"]'));
        assert.equal(submissions, 1);
      } finally {
        api.correct = originalCorrect; api.synthesize = originalSynthesize;
      }
      await click(env.mount.querySelector('[aria-label="Hướng dẫn"]'));
    });
    await suite.test("đợi Speech không hiện 0% giả; lỗi polling dừng trạng thái bận và giữ nội dung", async () => {
      await click(env.mount.querySelector('.sidebar a[href="#studio"]'));
      const originalCorrect = api.correct, originalSynthesize = api.synthesize, originalJob = api.job;
      const originalTimeout = env.win.setTimeout;
      let resolveJob;
      const pending = { ...recording('waiting'), status: 'PROCESSING', audioUrl: null, progress: { done: 0, total: 1 } };
      api.correct = async () => ({ status: 'skipped' });
      api.synthesize = async () => pending;
      api.job = () => new Promise(resolve => { resolveJob = resolve; });
      env.win.setTimeout = (callback, delay, ...args) => originalTimeout.call(env.win, callback, delay === 2500 ? 0 : delay, ...args);
      try {
        const form = env.mount.querySelector('.composer'), editor = form.querySelector('textarea');
        await act(() => {
          Object.getOwnPropertyDescriptor(env.win.HTMLTextAreaElement.prototype, 'value').set.call(editor, 'Nội dung cần giữ lại.');
          editor.dispatchEvent(new env.win.Event('input', { bubbles: true }));
        });
        await click(form.querySelector('button[type="submit"]'));
        await act(async () => { for (let i = 0; i < 20 && !resolveJob; i++) await settle(); });
        const progress = form.querySelector('progress');
        assert.ok(progress);
        assert.equal(progress.hasAttribute('value'), false);
        assert.doesNotMatch(form.querySelector('.job-progress').textContent, /0%/);
        assert.equal(editor.readOnly, true);
        await act(async () => { resolveJob({ ...pending, progress: { done: 1, total: 3 } }); await settle(); });
        assert.equal(form.querySelector('progress').value, 33);
        assert.match(form.querySelector('.job-progress').textContent, /33%/);
        await act(async () => { resolveJob({ ...pending, status: 'FAILED', error: 'Kết nối Azure Speech quá thời gian chờ.' }); await settle(); });
        assert.match(form.querySelector('[role="alert"]').textContent, /thời gian chờ/);
        assert.equal(form.querySelector('.job-progress'), null);
        assert.equal(editor.value, 'Nội dung cần giữ lại.');
        assert.equal(editor.readOnly, false);
        assert.equal(form.querySelector('button[type="submit"]').disabled, false);
      } finally {
        api.correct = originalCorrect; api.synthesize = originalSynthesize; api.job = originalJob;
        env.win.setTimeout = originalTimeout;
      }
    });
    await suite.test("màn dịch dùng Azure; Gemini chỉ là lựa chọn đọc ảnh", async () => {
      await click(env.mount.querySelector('.sidebar a[href="#translation"]'));
      const fileInput = env.mount.querySelector('input[aria-label="Chọn tài liệu văn bản"]');
      await act(async () => {
        Object.defineProperty(fileInput, 'files', { configurable: true, value: [new env.win.File(['Nội dung tài liệu.'], 'bai-hoc.txt', { type: 'text/plain' })] });
        fileInput.dispatchEvent(new env.win.Event('change', { bubbles: true }));
        await settle();
      });
      assert.equal(env.mount.querySelector('#editor').value, 'Nội dung tài liệu.');
      assert.equal(env.mount.querySelector('.imported-file').textContent, 'bai-hoc.txt');
      const textDrop = new env.win.Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(textDrop, 'dataTransfer', { value: { files: [] } });
      env.mount.querySelector('.composer').dispatchEvent(textDrop);
      assert.equal(textDrop.defaultPrevented, false);
      const fileDrop = new env.win.Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(fileDrop, 'dataTransfer', { value: { files: [new env.win.File(['Văn bản kéo thả.'], 'tai-lieu.txt', { type: 'text/plain' })] } });
      await act(async () => { env.mount.querySelector('.composer').dispatchEvent(fileDrop); await settle(); });
      assert.equal(fileDrop.defaultPrevented, true);
      assert.equal(env.mount.querySelector('#editor').value, 'Văn bản kéo thả.');
      await click(env.mount.querySelector('[aria-label="Xóa nội dung văn bản"]'));
      assert.equal(env.mount.querySelector('.imported-file'), null);
      assert.equal(env.mount.querySelector('#translation-mode'), null);
      assert.match(env.mount.querySelector('.document-privacy-note').textContent, /Gemini/);
      const originalTranslate = api.translate, originalSynthesize = api.synthesize;
      const submitted = [];
      api.translate = async () => { throw new Error('Không được gọi Gemini'); };
      api.synthesize = async (input) => { submitted.push(input); return { ...recording('azure'), translated: true, text: 'Hello.', sourceLang: 'vi-VN', lang: 'en-US' }; };
      try {
        const form = env.mount.querySelector('.composer');
        const editor = form.querySelector('textarea');
        await act(() => {
          Object.getOwnPropertyDescriptor(env.win.HTMLTextAreaElement.prototype, 'value').set.call(editor, 'Xin chào.');
          editor.dispatchEvent(new env.win.Event('input', { bubbles: true }));
        });
        assert.match(form.querySelector('button[type="submit"]').textContent, /Dịch và tạo giọng đọc/);
        await click(form.querySelector('button[type="submit"]'));
        assert.equal(submitted.length, 1);
        assert.equal(submitted[0].translateTo, 'en-US');
        assert.equal(submitted[0].text, 'Xin chào.');
      } finally { api.translate = originalTranslate; api.synthesize = originalSynthesize; }
    });
    await suite.test("sidebar thu gọn được và lưu lựa chọn", async () => {
      await click(env.mount.querySelector('[aria-label="Thu gọn thanh bên"]'));
      assert.ok(env.mount.querySelector(".app-shell.sidebar-collapsed"));
      assert.equal(localStorage.getItem("tts.sidebar.collapsed"), "true");
      assert.ok(env.mount.querySelector('.sidebar a[aria-label="Tổng quan"]'));
      await click(env.mount.querySelector('[aria-label="Hiện thanh bên"]'));
      assert.equal(env.mount.querySelector(".app-shell.sidebar-collapsed"), null);
    });
    await suite.test("sidebar dạng hẹp vẫn có nhãn nổi, tìm kiếm và đổi trạng thái liên tục", async () => {
      await click(env.mount.querySelector('[aria-label="Thu gọn thanh bên"]'));
      assert.equal(env.mount.querySelector('.sidebar-toggle').getAttribute("aria-expanded"), "false");
      const link = env.mount.querySelector('.sidebar a[href="#studio"]');
      await act(() => link.focus());
      assert.equal(env.mount.querySelector('[role="tooltip"]').textContent, "Tạo giọng đọc");
      await act(() => link.blur());
      assert.equal(env.mount.querySelector('[role="tooltip"]'), null);
      const search = env.mount.querySelector('.header-search input');
      await act(() => search.focus());
      await type(search, "dich");
      assert.ok(env.mount.querySelector('.header-search-menu'));
      assert.equal(document.querySelector('dialog[aria-label="Tìm kiếm"]'), null);
      await act(() => search.dispatchEvent(new env.win.KeyboardEvent("keydown", { bubbles: true, key: "Escape" })));
      assert.equal(env.mount.querySelector('.header-search-menu'), null);
      for (let i = 0; i < 5; i++) await click(env.mount.querySelector('.sidebar-toggle'));
      assert.equal(env.mount.querySelector('.sidebar-toggle').getAttribute("aria-expanded"), "true");
      assert.equal(localStorage.getItem("tts.sidebar.collapsed"), "false");
    });
    await suite.test("menu hẹp dùng cùng sidebar kính, giữ nhãn/count và đóng sau điều hướng", async () => {
      const originalWidth = env.win.innerWidth;
      env.win.innerWidth = 600;
      await click(env.mount.querySelector('[aria-label="Mở menu điều hướng"]'));
      const drawer = document.querySelector('.mobile-nav-modal .drawer-sidebar');
      assert.ok(drawer.querySelector('.sidebar-glass'));
      assert.ok(drawer.querySelector('.nav-selection'));
      assert.equal(drawer.querySelector('.product-name').textContent, 'TTS Studio');
      assert.equal(drawer.querySelectorAll('a').length, 7);
      assert.equal(drawer.querySelectorAll('.nav-item.active').length, 1);
      assert.ok(drawer.querySelector('.sidebar-bottom a[href="#settings"]'));
      assert.equal(drawer.querySelector('.mobile-nav'), null);
      await click(drawer.querySelector('a[href="#library"]'));
      assert.equal(document.querySelector('.mobile-nav-modal'), null);
      assert.equal(env.mount.querySelector('h1').textContent, 'Bản thu đã lưu');
      env.win.innerWidth = originalWidth;
    });
    await suite.test("gõ tìm kiếm lọc gợi ý ngay dưới ô nhập và mở đúng công cụ", async () => {
      await click(env.mount.querySelector('.sidebar a[href="#library"]'));
      const search = env.mount.querySelector('.header-search input');
      await act(() => search.focus());
      await type(search, "dich va");
      const options = env.mount.querySelectorAll('.header-search-menu [role="option"]');
      assert.equal(options.length, 1);
      assert.match(options[0].textContent, /Dịch và đọc/);
      assert.equal(env.mount.querySelectorAll('.record-row').length, 1);
      assert.equal(env.mount.querySelector('.page-header kbd'), null);
      assert.equal(env.mount.querySelector('.page-header [aria-keyshortcuts]'), null);
      await click(options[0]);
      assert.equal(env.mount.querySelector('h1').textContent, "Dịch và đọc");
      assert.equal(env.mount.querySelector('.header-search-menu'), null);
      assert.equal(search.value, "");
    });
    await suite.test("không báo trống khi lịch sử đang tải hoặc tải lỗi", async () => {
      let reject;
      api.history = () => new Promise((_, fail) => { reject = fail; });
      await act(async () => { env.root.render(React.createElement(App, { key: "loading" })); await settle(); });
      await click(env.mount.querySelector('.sidebar a[href="#dashboard"]'));
      assert.match(env.mount.textContent, /Đang tải bản thu/);
      assert.doesNotMatch(env.mount.textContent, /Chưa có bản thu/);
      await click(env.mount.querySelector('.header-utility'));
      assert.match(env.mount.textContent, /Đang tải lịch sử để xuất báo cáo/);
      assert.doesNotMatch(env.mount.textContent, /bạn có bản thu đầu tiên/);
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
