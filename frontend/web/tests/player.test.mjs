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
