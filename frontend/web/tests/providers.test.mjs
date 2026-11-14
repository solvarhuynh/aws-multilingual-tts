import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { environment, recording, settle } from './environment.mjs';

test('Đổi Azure/Gemini giữ nháp, chọn đúng giọng và không gửi cấu hình cũ', async suite => {
  const env = await environment();
  const { api } = await env.load('lib/api.ts');
  const { useStudio } = await env.load('hooks/useStudio.ts');
  let studio, submitted = [], revision = 0;
  const languages = [
    { lang: 'vi-VN', provider: 'azure', engine: null, voices: [{ id: 'HoaiMy', gender: 'F' }] },
    { lang: 'vi-VN', provider: 'gemini', engine: 'gemini-3.8-flash-tts', available: true, autoEmotionEnabled: true, voices: [{ id: 'Kore', gender: 'N', styles: ['cheerful', 'whispering'] }] },
    { lang: 'th-TH', provider: 'gemini', engine: 'gemini-3.8-flash-tts', available: true, autoEmotionEnabled: true, voices: [{ id: 'Kore', gender: 'N', styles: ['cheerful'] }] },
  ];
  function Harness() { studio = useStudio(() => {}); return null; }
  async function mount(catalog = languages) {
    submitted = []; api.voices = async () => catalog; api.history = async () => ({ items: [], nextCursor: null });
    api.correct = async text => ({ status: 'skipped', originalText: text, correctedText: text, hasTypos: false });
    api.synthesize = async input => { submitted.push(input); return { ...recording(), provider: input.provider, engine: input.provider === 'gemini' ? 'gemini-3.8-flash-tts' : null }; };
    await act(async () => { env.root.render(React.createElement(Harness, { key: ++revision })); await settle(); });
    await act(() => studio.updateText('Nội dung tiếng Việt được giữ nguyên.'));
  }
  try {
    await suite.test('lọc 2 provider, đổi nguồn giữ nháp và gửi Gemini emotion vào đúng body', async () => {
      await mount(); assert.equal(studio.languages.length, 1); assert.equal(studio.voice, 'HoaiMy');
      await act(() => studio.setProvider('gemini'));
      assert.equal(studio.languages.length, 2); assert.equal(studio.voice, 'Kore');
      assert.equal(studio.text, 'Nội dung tiếng Việt được giữ nguyên.');
      await act(() => studio.setStyle('auto'));
      await act(async () => { await studio.generate(); });
      assert.equal(submitted[0].provider, 'gemini'); assert.equal(submitted[0].style, 'auto');
      await act(() => studio.setProvider('azure'));
      assert.equal(studio.voice, 'HoaiMy'); assert.equal(studio.style, 'neutral');
      await act(async () => { await studio.generate(); });
      assert.equal(submitted[1].provider, undefined); assert.equal(submitted[1].style, undefined);
    });
    await suite.test('Gemini chưa bật không gửi job dù có catalog để xem', async () => {
      await mount(languages.map(l => l.provider === 'gemini' ? { ...l, available: false } : l));
      await act(() => studio.setProvider('gemini'));
      await act(async () => { await studio.generate(); await studio.generateAll(); });
      assert.match(studio.error, /Chưa bật Gemini/); assert.equal(submitted.length, 0);
    });
    await suite.test('đổi nguồn lúc kiểm chữ bỏ phản hồi đến muộn, không đọc với provider cũ', async () => {
      await mount(); let resolve;
      await act(() => studio.setCheckSpelling(true));
      api.correct = () => new Promise(done => { resolve = done; });
      let generation;
      await act(async () => { generation = studio.generate(); await settle(); });
      await act(() => studio.setProvider('gemini'));
      await act(async () => { resolve({ status: 'skipped', hasTypos: false, originalText: studio.text, correctedText: studio.text }); await generation; });
      assert.equal(submitted.length, 0); assert.equal(studio.busy, false); assert.equal(studio.review, null);
    });
  } finally { await act(() => env.root.unmount()); await env.close(); }
});
