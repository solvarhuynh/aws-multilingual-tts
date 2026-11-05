import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Window } from "happy-dom";
import { createServer } from "vite";

test("Nút gạt: kéo, hủy và bàn phím", async (suite) => {
  const win = new Window({ url: "http://localhost" });
  for (const key of ["window", "document", "HTMLElement", "Node", "Event", "MouseEvent", "PointerEvent"])
    Object.defineProperty(globalThis, key, { value: key === "window" ? win : win[key], configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  const { default: Switch } = await server.ssrLoadModule("/src/components/PreferenceSwitch.tsx");
  const mount = document.createElement("div");
  document.body.append(mount);
  const root = createRoot(mount);
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
    await server.close();
    await win.happyDOM.close();
  }
});
