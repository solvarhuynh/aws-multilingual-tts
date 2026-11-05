import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { environment, recording } from "./environment.mjs";

test("Tìm kiếm header: gõ trực tiếp và chọn gợi ý", async (suite) => {
  const env = await environment();
  const { default: Search } = await env.load("components/HeaderSearch.tsx");
  const pages = [
    { id: "studio", title: "Tạo giọng đọc", icon: "wave" },
    { id: "translation", title: "Dịch và đọc", icon: "translate" },
    { id: "documents", title: "Đọc tài liệu", icon: "book" },
    { id: "dashboard", title: "Tổng quan", icon: "dashboard" },
  ];
  const history = [{ ...recording(), text: "Thông báo họp ngày mai." }];
  let revision = 0, destination, selected;
  const input = () => env.mount.querySelector('input[role="combobox"]');
  const options = () => [...env.mount.querySelectorAll('[role="option"]')];
  async function mount(items = history) {
    destination = selected = undefined;
    await act(() => env.root.render(React.createElement(Search, { key: ++revision, pages, history: items,
      onNavigate: (page) => { destination = page; }, onRecording: (item) => { selected = item; } })));
  }
  async function type(text) {
    await act(() => {
      input().focus();
      Object.getOwnPropertyDescriptor(env.win.HTMLInputElement.prototype, "value").set.call(input(), text);
      input().dispatchEvent(new env.win.Event("input", { bubbles: true }));
    });
  }
  async function key(value) {
    await act(() => input().dispatchEvent(new env.win.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: value })));
  }
  try {
    await suite.test("gõ từng ký tự lọc ngay, nhận tiếng Việt không dấu và không mở modal", async () => {
      await mount();
      await act(() => input().focus());
      assert.equal(input().getAttribute("aria-expanded"), "false");
      await type("d");
      assert.equal(options().length, 3);
      await type("doc tai");
      assert.equal(options().length, 1);
      assert.match(options()[0].textContent, /Đọc tài liệu/);
      assert.equal(document.querySelector("dialog"), null);
      assert.equal(env.mount.querySelector("kbd"), null);
      await act(() => options()[0].click());
      assert.equal(destination, "documents");
      assert.equal(input().value, "");
      assert.equal(input().getAttribute("aria-expanded"), "false");
    });
    await suite.test("phím mũi tên và Enter chọn đúng công cụ", async () => {
      await mount();
      await type("doc");
      await key("ArrowDown");
      assert.match(env.mount.querySelector('[aria-selected="true"]').textContent, /Dịch và đọc/);
      assert.equal(input().getAttribute("aria-activedescendant"), options()[1].id);
      await key("Enter");
      assert.equal(destination, "translation");
      assert.equal(env.mount.querySelector('[role="listbox"]'), null);
    });
    await suite.test("tìm theo nội dung hoặc giọng rồi mở đúng bản thu", async () => {
      await mount();
      await type("thong bao");
      assert.equal(options().length, 1);
      assert.match(options()[0].textContent, /Thông báo họp/);
      await type("LINH");
      await key("Enter");
      assert.equal(selected.jobId, "one");
      assert.equal(destination, undefined);
      assert.equal(input().value, "");
    });
    await suite.test("Escape và bấm ngoài đóng gợi ý; bấm lại ô nhập mở lại", async () => {
      await mount();
      await type("doc");
      await key("Escape");
      assert.equal(input().value, "doc");
      assert.equal(env.mount.querySelector('[role="listbox"]'), null);
      await act(() => input().click());
      assert.ok(env.mount.querySelector('[role="listbox"]'));
      await act(() => document.body.dispatchEvent(new env.win.PointerEvent("pointerdown", { bubbles: true })));
      assert.equal(env.mount.querySelector('[role="listbox"]'), null);
      await key("ArrowUp");
      assert.equal(input().getAttribute("aria-activedescendant"), options().at(-1).id);
    });
    await suite.test("xóa tìm kiếm, khoảng trắng và không có kết quả đều rõ trạng thái", async () => {
      await mount();
      await type("khong ton tai");
      assert.match(env.mount.querySelector('[role="status"]').textContent, /Không tìm thấy/);
      assert.equal(input().hasAttribute("aria-activedescendant"), false);
      await act(() => env.mount.querySelector('[aria-label="Xóa tìm kiếm"]').click());
      assert.equal(input().value, "");
      assert.equal(document.activeElement, input());
      assert.equal(env.mount.querySelector('[role="listbox"]'), null);
      await type("   ");
      assert.equal(env.mount.querySelector('[role="listbox"]'), null);
    });
    await suite.test("danh sách gợi ý giữ gọn khi có nhiều bản thu", async () => {
      await mount(Array.from({ length: 10 }, (_, index) => ({ ...recording(String(index)), text: `Bản thu ${index}` })));
      await type("a");
      assert.equal(options().length, 6);
      assert.equal(document.querySelector("dialog"), null);
    });
  } finally { await act(() => env.root.unmount()); await env.close(); }
});

test("Lời chào tự đổi theo buổi, không hiển thị đồng hồ hoặc nhãn phím tắt", async () => {
  const env = await environment();
  const { default: Header } = await env.load("components/PageHeader.tsx");
  const RealDate = globalThis.Date;
  const originalInterval = env.win.setInterval, originalClear = env.win.clearInterval;
  const timers = new Map();
  let hour = 8;
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [new RealDate(2026, 10, 5, hour, 15).getTime()])); }
  };
  env.win.setInterval = (callback, delay, ...args) => {
    const id = originalInterval.call(env.win, callback, delay, ...args);
    timers.set(id, callback); return id;
  };
  env.win.clearInterval = (id) => { timers.delete(id); originalClear.call(env.win, id); };
  try {
    await act(() => env.root.render(React.createElement(Header, { onMenu: () => {}, onExport: () => {}, children: null })));
    assert.match(env.mount.querySelector('.header-greeting').textContent, /Chào buổi sáng, Nhóm 5/);
    assert.equal(timers.size, 1);
    for (const [nextHour, greeting] of [[12, "Chào buổi chiều"], [18, "Chào buổi tối"], [0, "Chào buổi tối"], [5, "Chào buổi sáng"]]) {
      hour = nextHour;
      await act(() => env.win.dispatchEvent(new env.win.Event("focus")));
      assert.match(env.mount.querySelector('.header-greeting').textContent, new RegExp(greeting));
    }
    hour = 14;
    await act(() => [...timers.values()][0]());
    assert.match(env.mount.querySelector('.header-greeting').textContent, /Chào buổi chiều/);
    assert.ok(env.mount.querySelector('.header-avatar[aria-label="Điện toán đám mây"] svg'));
    assert.equal(env.mount.querySelector("time, kbd, [aria-keyshortcuts]"), null);
    assert.doesNotMatch(env.mount.textContent, /\d{1,2}:\d{2}|Ctrl|⌘/);
  } finally {
    await act(() => env.root.unmount());
    globalThis.Date = RealDate;
    env.win.setInterval = originalInterval; env.win.clearInterval = originalClear;
    await env.close();
  }
  assert.equal(timers.size, 0);
});
