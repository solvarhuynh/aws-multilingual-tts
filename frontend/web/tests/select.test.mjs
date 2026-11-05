import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { Window } from "happy-dom";
import { createServer } from "vite";

test("Dropdown: bàn phím, trạng thái và lớp dialog", async (suite) => {
  const win = new Window({ url: "http://localhost" });
  const globals = ["document", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "HTMLFormElement", "HTMLButtonElement", "HTMLOptionElement", "SVGElement", "ShadowRoot", "Document", "Element", "Node", "NodeFilter",
    "DocumentFragment", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "PointerEvent", "MutationObserver", "ResizeObserver"];
  Object.defineProperty(globalThis, "window", { value: win, configurable: true });
  for (const key of globals) Object.defineProperty(globalThis, key, { value: win[key], configurable: true });
  for (const key of ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"])
    Object.defineProperty(globalThis, key, { value: win[key].bind(win), configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  win.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import("react-dom/client");
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  const { default: Select } = await server.ssrLoadModule("/src/components/Select.tsx");
  const dialog = document.createElement("dialog");
  document.body.append(dialog);
  dialog.showModal();
  const root = createRoot(dialog);
  let disabled = false;
  function Harness() {
    const [value, setValue] = useState("vi-VN");
    return React.createElement(Select, { label: "Ngôn ngữ", value, onValueChange: setValue, disabled,
      options: [{ value: "vi-VN", label: "Tiếng Việt" }, { value: "en-US", label: "Tiếng Anh" }] });
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  async function key(element, value) {
    await act(async () => {
      element.dispatchEvent(new win.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: value }));
      await settle();
    });
  }
  try {
    await act(async () => { root.render(React.createElement(Harness)); await settle(); });
    await suite.test("mở bằng bàn phím, menu ở cùng lớp với dialog", async () => {
      const trigger = dialog.querySelector('[role="combobox"]');
      assert.match(trigger.textContent, /Tiếng Việt/);
      await key(trigger, "ArrowDown");
      const list = document.querySelector('[role="listbox"]');
      assert.ok(list);
      assert.equal(list.closest("dialog"), dialog);
      assert.equal(list.querySelectorAll('[role="option"]').length, 2);
    });
    await suite.test("phím mũi tên và Enter chọn giá trị, đóng menu", async () => {
      await key(document.activeElement, "End");
      assert.match(document.activeElement.textContent, /Tiếng Anh/);
      await key(document.activeElement, "Enter");
      assert.match(dialog.querySelector('[role="combobox"]').textContent, /Tiếng Anh/);
      assert.equal(document.querySelector('[role="listbox"]'), null);
    });
    await suite.test("Escape đóng và giữ lựa chọn", async () => {
      await key(dialog.querySelector('[role="combobox"]'), "ArrowDown");
      await key(document.activeElement, "Escape");
      assert.equal(document.querySelector('[role="listbox"]'), null);
      assert.match(dialog.querySelector('[role="combobox"]').textContent, /Tiếng Anh/);
    });
    await suite.test("khóa ô chọn trong lúc xử lý", async () => {
      disabled = true;
      await act(async () => { root.render(React.createElement(Harness)); await settle(); });
      assert.equal(dialog.querySelector('[role="combobox"]').disabled, true);
    });
  } finally {
    await act(async () => { root.unmount(); await settle(); });
    await server.close();
    await win.happyDOM.close();
  }
});
