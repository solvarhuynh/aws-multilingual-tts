import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { environment, settle } from "./environment.mjs";

test("Nút gạt: kéo, hủy và bàn phím", async (suite) => {
  const env = await environment();
  const { win, mount, root } = env;
  const { default: Switch } = await env.load("components/PreferenceSwitch.tsx");
  let changes = [];
  function Harness() {
    const [checked, setChecked] = useState(false);
    return React.createElement(Switch, { checked, label: "Giảm chuyển động", descriptionId: "help",
      onChange: (value) => { changes.push(value); setChecked(value); } });
  }
  async function render() {
    changes = [];
    await act(() => root.render(React.createElement(Harness, { key: Math.random() })));
    const button = mount.querySelector("button");
    Object.defineProperties(button, { clientWidth: { value: 52 }, clientHeight: { value: 30 } });
    return button;
  }
  async function pointer(button, type, x) {
    await act(() => button.dispatchEvent(new win.PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientX: x })));
  }
  async function click(button, detail = 1) {
    await act(() => button.dispatchEvent(new win.MouseEvent("click", { bubbles: true, detail })));
  }
  try {
    await suite.test("click đổi trạng thái một lần và có nhãn hỗ trợ", async () => {
      const button = await render();
      assert.equal(button.getAttribute("role"), "switch");
      assert.equal(button.getAttribute("aria-label"), "Giảm chuyển động");
      await click(button);
      assert.equal(button.getAttribute("aria-checked"), "true");
      assert.deepEqual(changes, [true]);
    });
    await suite.test("kéo hai chiều không bật lại khi trình duyệt phát click", async () => {
      const button = await render();
      await pointer(button, "pointerdown", 10);
      await pointer(button, "pointermove", 40);
      await pointer(button, "pointerup", 40);
      await click(button);
      assert.equal(button.getAttribute("aria-checked"), "true");
      await pointer(button, "pointerdown", 40);
      await pointer(button, "pointermove", 10);
      await pointer(button, "pointerup", 10);
      await click(button);
      assert.equal(button.getAttribute("aria-checked"), "false");
      assert.deepEqual(changes, [true, false]);
    });
    await suite.test("kéo quá mép luôn giữ núm trong khoảng 0..1", async () => {
      const button = await render();
      await pointer(button, "pointerdown", 10);
      for (const [x, expected] of [[999, "1"], [-999, "0"]]) {
        await pointer(button, "pointermove", x);
        assert.equal(button.style.getPropertyValue("--switch-position"), expected);
      }
      await pointer(button, "pointerup", -999);
      await click(button);
      assert.deepEqual(changes, []);
    });
    await suite.test("hủy kéo trả về trạng thái cũ, bàn phím vẫn hoạt động", async () => {
      const button = await render();
      await pointer(button, "pointerdown", 10);
      await pointer(button, "pointermove", 40);
      await pointer(button, "pointercancel", 40);
      assert.equal(button.style.getPropertyValue("--switch-position"), "0");
      await click(button, 0);
      assert.equal(button.getAttribute("aria-checked"), "true");
      await act(() => button.dispatchEvent(new win.KeyboardEvent("keydown", { bubbles: true, key: "ArrowLeft" })));
      assert.equal(button.getAttribute("aria-checked"), "false");
      assert.deepEqual(changes, [true, false]);
    });
  } finally {
    await act(() => root.unmount());
    await env.close();
  }
});

test("Dropdown: bàn phím, trạng thái và lớp dialog", async (suite) => {
  const env = await environment();
  const { win, root, mount } = env;
  const { default: Select } = await env.load("components/Select.tsx");
  const dialog = document.createElement("dialog");
  document.body.append(dialog);
  dialog.append(mount);
  dialog.showModal();
  let disabled = false;
  function Harness() {
    const [value, setValue] = useState("vi-VN");
    return React.createElement(Select, { label: "Ngôn ngữ", value, onValueChange: setValue, disabled,
      options: [{ value: "vi-VN", label: "Tiếng Việt" }, { value: "en-US", label: "Tiếng Anh" }] });
  }
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
    await env.close();
  }
});
