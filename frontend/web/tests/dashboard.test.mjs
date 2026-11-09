import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { environment, recording, settle } from "./environment.mjs";

test("Dashboard dùng GET /stats: tải, rỗng, dữ liệu thật và lỗi 503", async (suite) => {
  const env = await environment();
  const { api, ApiError } = await env.load("lib/api.ts");
  const { default: Dashboard } = await env.load("views/Dashboard.tsx");
  const props = {
    history: [], languages: [], navigate: () => {}, openRecording: async () => {}, playingJobId: null,
    loadingHistory: false, historyError: "", reloadHistory: async () => {}, hasMoreHistory: false,
  };
  let revision = 0;
  const values = () => [...env.mount.querySelectorAll(".overview-stat strong")].map(item => item.textContent);
  const render = async (history = []) => act(async () => {
    env.root.render(React.createElement(Dashboard, { ...props, history, key: ++revision }));
    await settle();
  });
  try {
    await suite.test("đang tải và bucket chưa có job", async () => {
      let resolve;
      api.stats = () => new Promise(done => { resolve = done; });
      await render();
      assert.match(env.mount.querySelector('[role="status"]').textContent, /Đang tải thống kê/);
      assert.deepEqual(values().slice(0, 2), ["—", "—"]);
      await act(async () => { resolve({ totalJobs: 0, totalChars: 0, byLang: {}, cacheHits: 0 }); await settle(); });
      assert.deepEqual(values().slice(0, 2), ["0", "0"]);
      assert.match(env.mount.textContent, /Chưa có bản thu/);
    });
    await suite.test("hiển thị số thật từ API, không dùng độ dài trang lịch sử đã tải", async () => {
      api.stats = async () => ({ totalJobs: 123, totalChars: 4567, byLang: { "vi-VN": 123 }, cacheHits: 0 });
      await render([recording()]);
      assert.deepEqual(values().slice(0, 2), ["123", "4.567"]);
    });
    await suite.test("503 giữ các mục khác dùng được và cho tải lại thống kê", async () => {
      let calls = 0;
      api.stats = async () => {
        if (++calls === 1) throw new ApiError("Scan cap", "STATS_UNAVAILABLE", 503);
        return { totalJobs: 5, totalChars: 80, byLang: { "vi-VN": 5 }, cacheHits: 0 };
      };
      await render();
      assert.match(env.mount.querySelector('[role="alert"]').textContent, /Thống kê tạm chưa sẵn sàng/);
      assert.ok(env.mount.textContent.includes("Tạo bản thu"));
      await act(async () => { env.mount.querySelector(".dashboard-error button").click(); await settle(); });
      assert.equal(calls, 2);
      assert.deepEqual(values().slice(0, 2), ["5", "80"]);
      assert.equal(env.mount.querySelector('[role="alert"]'), null);
    });
  } finally {
    await act(() => env.root.unmount());
    await env.close();
  }
});
