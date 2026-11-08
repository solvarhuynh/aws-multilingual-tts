import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { environment, recording, settle } from "./environment.mjs";

test("Trình phát: phát từ danh sách, đổi bài và âm lượng", async (suite) => {
  const env = await environment();
  const { default: Player } = await env.load("components/AudioPlayer.tsx");
  let setSelection, currentVolume = .35, plays = 0, playingId = null;
  env.win.HTMLMediaElement.prototype.play = function () { plays++; this.dispatchEvent(new env.win.Event("play")); return Promise.resolve(); };
  env.win.HTMLMediaElement.prototype.pause = function () { this.dispatchEvent(new env.win.Event("pause")); };
  function Harness() {
    const [selection, select] = useState({ item: recording("one"), request: null });
    const [volume, setVolume] = useState(.35);
    setSelection = select; currentVolume = volume;
    return React.createElement(Player, { item: selection.item, playbackRequest: selection.request, queue: [],
      onSelect: async () => {}, onLibrary: () => {}, volume, onVolume: setVolume, notify: () => {},
      onPlayingChange: (id) => { playingId = id; } });
  }
  try {
    await act(async () => { env.root.render(React.createElement(Harness)); await settle(); });
    await suite.test("tắt rồi bật tiếng trả về mức cũ", async () => {
      await act(() => env.mount.querySelector('[aria-label="Tắt âm thanh"]').click());
      assert.equal(currentVolume, 0);
      await act(() => env.mount.querySelector('[aria-label="Bật âm thanh"]').click());
      assert.equal(currentVolume, .35);
    });
    await suite.test("một yêu cầu phát chỉ phát một lần; bấm lại tạm dừng", async () => {
      await act(async () => { setSelection({ item: recording("one"), request: { jobId: "one", serial: 1 } }); await settle(); });
      await act(async () => { await settle(); });
      assert.equal(plays, 1); assert.equal(playingId, "one");
      await act(async () => { setSelection({ item: recording("one"), request: { jobId: "one", serial: 2 } }); await settle(); });
      await act(async () => { await settle(); });
      assert.equal(plays, 1); assert.equal(playingId, null);
    });
    await suite.test("đổi bản thu đang phát không dừng nhầm bài mới", async () => {
      await act(async () => { setSelection({ item: recording("one"), request: { jobId: "one", serial: 3 } }); await settle(); });
      await act(async () => { await settle(); });
      await act(async () => { setSelection({ item: recording("two"), request: { jobId: "two", serial: 4 } }); await settle(); });
      await act(async () => { await settle(); });
      assert.equal(plays, 3); assert.equal(playingId, "two");
    });
  } finally { await act(() => env.root.unmount()); await env.close(); }
});

test("Timeline MP3 lấy đồng hồ của tệp, không đoán từ số ký tự", async (suite) => {
  const env = await environment();
  const { default: Player } = await env.load("components/AudioPlayer.tsx");
  const notices = [];
  let select, rejectPlay;
  env.win.HTMLMediaElement.prototype.play = function () { this.dispatchEvent(new env.win.Event("play")); return Promise.resolve(); };
  env.win.HTMLMediaElement.prototype.pause = function () { this.dispatchEvent(new env.win.Event("pause")); };
  function Harness() {
    const [item, setItem] = useState(recording());
    select = setItem;
    return React.createElement(Player, { item, queue: [], onSelect: async () => {}, onLibrary() {}, volume: .5,
      onVolume() {}, notify: (...args) => notices.push(args) });
  }
  const audio = () => env.mount.querySelector("audio");
  const seek = () => env.mount.querySelector('[aria-label="Vị trí phát"]');
  const times = () => [...env.mount.querySelectorAll(".player-track time")].map(node => node.textContent);
  async function media(event, duration, time) {
    await act(() => {
      if (duration !== undefined) Object.defineProperty(audio(), "duration", { configurable: true, value: duration });
      if (time !== undefined) audio().currentTime = time;
      audio().dispatchEvent(new env.win.Event(event));
    });
  }
  try {
    await act(() => env.root.render(React.createElement(Harness)));
    await suite.test("chưa có metadata thì chưa hiển thị thời lượng hoặc cho tua", async () => {
      assert.deepEqual(times(), ["0:00", "—:—"]);
      assert.equal(seek().disabled, true);
    });
    await suite.test("durationchange xử lý cả metadata tải muộn và Infinity", async () => {
      await media("loadedmetadata", Infinity, 0);
      assert.equal(seek().disabled, true);
      await media("durationchange", 95.4, 12.3);
      assert.deepEqual(times(), ["0:12", "1:35"]);
      assert.equal(Number(seek().max), 95.4);
      assert.equal(Number(seek().value), 12.3);
      assert.equal(seek().disabled, false);
    });
    await suite.test("đang phát hoặc đang đệm không tự cộng thời gian", async () => {
      await media("play", 95.4, 12.3);
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 230)); });
      assert.equal(Number(seek().value), 12.3);
      await media("timeupdate", 95.4, 42.7);
      assert.equal(Number(seek().value), 42.7);
      await media("pause");
      await act(async () => { await settle(); });
      assert.deepEqual(times(), ["0:42", "1:35"]);
    });
    await suite.test("seeked và ended bám vị trí thực, lặp lại giữ đúng tệp", async () => {
      await media("seeked", 95.4, 82);
      assert.equal(Number(seek().value), 82);
      await act(() => env.mount.querySelector('[aria-label="Lặp lại bản thu"]').click());
      assert.equal(audio().loop, true);
      await media("timeupdate", 95.4, .4);
      assert.equal(Number(seek().value), .4);
      await media("ended", 95.4, 95.4);
      assert.deepEqual(times(), ["1:35", "1:35"]);
      assert.ok(env.mount.querySelector('[aria-label="Phát âm thanh"]'));
    });
    await suite.test("đổi bản thu hoặc gia hạn URL xóa metadata cũ", async () => {
      await act(() => select(recording("two")));
      assert.deepEqual(times(), ["0:00", "—:—"]);
      await media("loadedmetadata", 7, 3);
      await act(() => select({ ...recording("two"), audioUrl: "https://audio.test/two.mp3?renewed" }));
      assert.deepEqual(times(), ["0:00", "—:—"]);
      assert.equal(seek().disabled, true);
    });
    await suite.test("promise phát của bản thu cũ không báo lỗi sang bản mới", async () => {
      env.win.HTMLMediaElement.prototype.play = () => new Promise((resolve, reject) => { rejectPlay = reject; });
      await act(() => env.mount.querySelector('[aria-label="Phát âm thanh"]').click());
      assert.equal(env.mount.querySelector('[aria-label="Phát âm thanh"]').disabled, true);
      await act(() => select(recording("three")));
      await act(async () => { rejectPlay(new Error("expired")); await settle(); });
      assert.deepEqual(notices, []);
      assert.equal(env.mount.querySelector('[aria-label="Phát âm thanh"]').disabled, false);
    });
  } finally { await act(() => env.root.unmount()); await env.close(); }
});

test("Giọng thiết bị không dùng thời lượng ước tính làm đồng hồ", async () => {
  const env = await environment({ demo: true });
  const { default: Player } = await env.load("components/AudioPlayer.tsx");
  let spoken;
  const synth = { paused: false, getVoices: () => [{ lang: "vi-VN" }], cancel() {}, speak(value) { spoken = value; },
    pause() { this.paused = true; }, resume() { this.paused = false; } };
  Object.defineProperty(env.win, "speechSynthesis", { configurable: true, value: synth });
  const OriginalUtterance = globalThis.SpeechSynthesisUtterance;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const item = { ...recording(), audioUrl: null };
  const times = () => [...env.mount.querySelectorAll(".player-track time")].map(node => node.textContent);
  try {
    await act(() => env.root.render(React.createElement(Player, { item, queue: [], onSelect: async () => {}, onLibrary() {},
      volume: .5, onVolume() {}, notify() {} })));
    await act(() => env.mount.querySelector('[aria-label="Phát âm thanh"]').click());
    assert.deepEqual(times(), ["0:00", "—:—"]);
    assert.equal(env.mount.querySelector('[aria-label="Vị trí phát"]').disabled, true);
    await act(() => spoken.onstart());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 220)); });
    await act(() => spoken.onboundary({ charIndex: 8 }));
    assert.ok(parseFloat(env.mount.querySelector(".track-fill").style.width) > 0);
    await act(() => env.mount.querySelector('[aria-label="Tạm dừng âm thanh"]').click());
    assert.deepEqual(times(), ["0:00", "—:—"]);
    await new Promise(resolve => setTimeout(resolve, 250));
    await act(() => env.mount.querySelector('[aria-label="Phát âm thanh"]').click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 220)); });
    await act(() => spoken.onend());
    assert.deepEqual(times(), ["0:00", "0:00"]);
    const spokenSeconds = Number(env.mount.querySelector('[aria-label="Vị trí phát"]').max);
    assert.ok(spokenSeconds >= .4 && spokenSeconds < .65, `reading time: ${spokenSeconds}`);
    assert.equal(env.mount.querySelector(".track-fill").style.width, "100%");
  } finally {
    await act(() => env.root.unmount()); await env.close();
    if (OriginalUtterance === undefined) delete globalThis.SpeechSynthesisUtterance;
    else globalThis.SpeechSynthesisUtterance = OriginalUtterance;
  }
});

test("Tải MP3 bỏ qua cache để không dính response thiếu CORS từ thẻ audio", async () => {
  const env = await environment();
  const { default: Player } = await env.load("components/AudioPlayer.tsx");
  const notices = [];
  let requested;
  globalThis.fetch = async (url, init) => { requested = { url: String(url), init }; return { ok: true, blob: async () => new Blob(["ID3"]) }; };
  env.win.URL.createObjectURL = () => "blob:mp3";
  env.win.URL.revokeObjectURL = () => {};
  try {
    await act(async () => {
      env.root.render(React.createElement(Player, { item: recording("one"), queue: [], onSelect: async () => {},
        onLibrary() {}, volume: .5, onVolume() {}, notify: (...args) => notices.push(args) }));
      await settle();
    });
    await act(async () => { env.mount.querySelector('[aria-label="Tải MP3"]').click(); await settle(); });
    assert.equal(requested.url, recording("one").audioUrl);
    assert.equal(requested.init.cache, "no-store");
    assert.deepEqual(notices, []);
  } finally { await act(() => env.root.unmount()); await env.close(); }
});
