import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { environment } from "./environment.mjs";

test("Sidebar FLIP: đảo chiều và dọn chuyển động", async (suite) => {
  const env = await environment();
  const { useSidebarMotion } = await env.load("hooks/useSidebarMotion.ts");
  const prototype = env.win.HTMLElement.prototype;
  const originalAnimate = Object.getOwnPropertyDescriptor(prototype, "animate");
  const originalMatchMedia = env.win.matchMedia;
  const originalAdd = env.win.addEventListener.bind(env.win);
  const originalRemove = env.win.removeEventListener.bind(env.win);
  const resizeListeners = new Set(), mediaListeners = new Set();
  const visual = new Map();
  let animations = [], revision = 0, systemReduced = false;

  // Chỉ mô phỏng hình học/trạng thái WAAPI; HappyDOM không dựng layout hoặc đo FPS.
  const media = new env.win.EventTarget();
  Object.defineProperty(media, "matches", { get: () => systemReduced });
  const mediaAdd = media.addEventListener.bind(media), mediaRemove = media.removeEventListener.bind(media);
  media.addEventListener = (type, listener) => { mediaListeners.add(listener); mediaAdd(type, listener); };
  media.removeEventListener = (type, listener) => { mediaListeners.delete(listener); mediaRemove(type, listener); };
  env.win.matchMedia = () => media;
  env.win.addEventListener = (type, listener, options) => {
    if (type === "resize") resizeListeners.add(listener);
    originalAdd(type, listener, options);
  };
  env.win.removeEventListener = (type, listener, options) => {
    if (type === "resize") resizeListeners.delete(listener);
    originalRemove(type, listener, options);
  };
  Object.defineProperty(prototype, "animate", { configurable: true, writable: true, value(keyframes, options) {
    let finish, reject;
    const node = this;
    const animation = { node, keyframes, options, cancelled: 0,
      finished: new Promise((resolve, fail) => { finish = resolve; reject = fail; }),
      finish() { finish(); },
      cancel() { this.cancelled++; visual.delete(node); reject(new Error("Animation cancelled")); },
    };
    animations.push(animation);
    return animation;
  } });

  function Harness({ reduced }) {
    const [collapsed, setCollapsed] = useState(false);
    const motion = useSidebarMotion(() => setCollapsed((value) => !value), reduced);
    return React.createElement("div", { ref: motion.ref, "data-collapsed": String(collapsed),
      style: { "--sidebar-duration": "380ms", "--sidebar-ease": "ease-out" } },
    React.createElement("aside", null,
      React.createElement("div", { className: "sidebar-glass", "data-box": "glass", style: { borderRadius: collapsed ? "36px" : "30px" } }),
      React.createElement("div", { className: "sidebar-content" },
        React.createElement("div", { className: "sidebar-brand", "data-box": "brand" }, "AWS"),
        React.createElement("nav", { "data-box": "nav" },
          React.createElement("div", { className: "nav-selection", "data-box": "pill", style: { transform: "translateY(48px)" } })),
        React.createElement("nav", { "data-box": "footer" })),
      React.createElement("button", { className: "sidebar-toggle", "data-box": "toggle", onClick: motion.toggleWithMotion }, "Toggle")),
    React.createElement("main", { className: "workspace", "data-box": "workspace" }, "Nội dung"));
  }
  function baseRect(node) {
    const collapsed = node.closest("[data-collapsed]").dataset.collapsed === "true";
    const top = collapsed ? 64 : 16, width = collapsed ? 72 : 248, height = collapsed ? 672 : 768;
    const boxes = {
      glass: [16, top, width, height], brand: [32, top + 18, width - 24, 48],
      nav: [29, top + 100, width - 24, 288], footer: [29, top + height - 114, width - 24, 96],
      toggle: [16 + width - 13, top + 28, 26, 26], pill: [29, top + 148, width - 24, 44],
      workspace: [collapsed ? 108 : 284, 16, collapsed ? 876 : 700, 768],
    };
    return new env.win.DOMRect(...boxes[node.dataset.box]);
  }
  async function render(reduced = false) {
    await act(() => env.root.render(React.createElement(Harness, { key: revision, reduced })));
    for (const node of env.mount.querySelectorAll("[data-box]")) {
      node.getBoundingClientRect = () => visual.get(node) || baseRect(node);
      Object.defineProperties(node, {
        offsetWidth: { configurable: true, get: () => baseRect(node).width },
        offsetHeight: { configurable: true, get: () => baseRect(node).height },
      });
    }
  }
  async function mount(reduced = false) {
    revision++;
    await render(reduced);
    animations = [];
    visual.clear();
    systemReduced = false;
  }
  const shell = () => env.mount.querySelector("[data-collapsed]");
  const node = (name) => env.mount.querySelector(`[data-box="${name}"]`);
  const toggle = () => act(() => env.mount.querySelector("button").click());
  const frame = (list, name) => list.find((animation) => animation.node.dataset.box === name).keyframes[0];
  const values = (keyframe) => [...keyframe.transform.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  async function finish(list) {
    await act(async () => { list.forEach((animation) => animation.finish()); await Promise.resolve(); });
  }

  try {
    await suite.test("nối từ hình học cũ, chỉ scale nền và giữ icon nguyên tỉ lệ", async () => {
      await mount();
      await toggle();
      assert.equal(shell().dataset.collapsed, "true");
      assert.ok(shell().hasAttribute("data-sidebar-moving"));
      assert.equal(animations.length, 7);
      const workspace = values(frame(animations, "workspace"));
      assert.equal(workspace[0], 176);
      assert.ok(Math.abs(workspace[2] - 700 / 876) < 1e-9);
      const brand = values(frame(animations, "brand"));
      assert.deepEqual(brand, [0, -48, 1, 1]);
      assert.ok(frame(animations, "glass").borderRadius);
      assert.equal(animations[0].options.duration, 380);
      await finish(animations);
      assert.equal(shell().hasAttribute("data-sidebar-moving"), false);
    });
    await suite.test("đảo chiều đọc vị trí đang hiển thị trước khi cancel; lượt cũ không dọn lượt mới", async () => {
      await mount(); await toggle();
      const first = [...animations];
      visual.set(node("workspace"), new env.win.DOMRect(196, 16, 788, 768));
      visual.set(node("glass"), new env.win.DOMRect(16, 40, 160, 720));
      await toggle();
      const second = animations.slice(first.length);
      assert.equal(shell().dataset.collapsed, "false");
      assert.ok(first.every((animation) => animation.cancelled === 1));
      const workspace = values(frame(second, "workspace"));
      assert.equal(workspace[0], -88);
      assert.ok(Math.abs(workspace[2] - 788 / 700) < 1e-9);
      await act(async () => { await Promise.allSettled(first.map((animation) => animation.finished)); });
      assert.ok(shell().hasAttribute("data-sidebar-moving"));
      assert.ok(second.every((animation) => animation.cancelled === 0));
      await finish(second);
      assert.equal(shell().hasAttribute("data-sidebar-moving"), false);
    });
    await suite.test("tùy chọn giảm chuyển động bỏ qua animation và hủy lượt đang chạy", async () => {
      await mount(true); await toggle();
      assert.equal(shell().dataset.collapsed, "true");
      assert.equal(animations.length, 0);
      await render(false); await toggle();
      const active = [...animations];
      assert.ok(active.length);
      await render(true);
      assert.ok(active.every((animation) => animation.cancelled === 1));
      assert.equal(shell().hasAttribute("data-sidebar-moving"), false);
    });
    await suite.test("đổi giảm chuyển động của hệ điều hành hủy ngay và vẫn đổi trạng thái được", async () => {
      await mount(); await toggle();
      systemReduced = true;
      await act(() => media.dispatchEvent(new env.win.Event("change")));
      assert.ok(animations.every((animation) => animation.cancelled === 1));
      assert.equal(shell().hasAttribute("data-sidebar-moving"), false);
      const count = animations.length;
      await toggle();
      assert.equal(animations.length, count);
      assert.equal(shell().dataset.collapsed, "false");
    });
    await suite.test("resize và unmount hủy animation, gỡ listener", async () => {
      await mount(); await toggle();
      await act(() => env.win.dispatchEvent(new env.win.Event("resize")));
      assert.ok(animations.every((animation) => animation.cancelled === 1));
      assert.equal(shell().hasAttribute("data-sidebar-moving"), false);
      const count = animations.length;
      await toggle();
      const active = animations.slice(count);
      assert.equal(resizeListeners.size, 1);
      assert.equal(mediaListeners.size, 1);
      await act(() => env.root.render(null));
      assert.ok(active.every((animation) => animation.cancelled === 1));
      assert.equal(resizeListeners.size, 0);
      assert.equal(mediaListeners.size, 0);
    });
    await suite.test("không có WAAPI vẫn thu mở được", async () => {
      await mount();
      Object.defineProperty(shell(), "animate", { value: undefined, configurable: true });
      await toggle();
      assert.equal(shell().dataset.collapsed, "true");
      assert.equal(animations.length, 0);
      assert.equal(shell().hasAttribute("data-sidebar-moving"), false);
    });
  } finally {
    await act(() => env.root.unmount());
    if (originalAnimate) Object.defineProperty(prototype, "animate", originalAnimate);
    else delete prototype.animate;
    env.win.matchMedia = originalMatchMedia;
    env.win.addEventListener = originalAdd;
    env.win.removeEventListener = originalRemove;
    await env.close();
  }
});
