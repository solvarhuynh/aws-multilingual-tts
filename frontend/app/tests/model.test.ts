import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DEFAULT_SPEED, duration, isRecording, languageNames, MAX_SPEED, MIN_SPEED, normalize, splitSpeech, validate, voiceName, type Input } from '../src/lib/model';

const input: Input = { text: 'Xin chào.', lang: 'vi-VN', voice: 'Linh', speed: 1, translateTo: null };
test('Văn bản rỗng hiển thị thời lượng bằng không', () => {
  for (const text of ['', '  \n ']) assert.equal(duration(text), 0);
  assert.ok(duration('Xin chào.') >= 1);
});
test('Chặn nội dung rỗng, quá dài và tốc độ sai', () => {
  assert.equal(validate(input), null);
  for (const text of ['', '  \n ', 'x'.repeat(2001)]) assert.ok(validate({ ...input, text }));
  assert.equal(validate({ ...input, text: 'x'.repeat(2000) }), null);
  for (const speed of [MIN_SPEED, DEFAULT_SPEED, MAX_SPEED]) assert.equal(validate({ ...input, speed }), null);
  for (const speed of [0, 0.5, 1.3, 2, 2.1, NaN, Infinity]) assert.ok(validate({ ...input, speed }));
  assert.ok(validate({ ...input, translateTo: 'vi-VN' }));
});
test('Hiển thị tên giọng, không lộ ID ngẫu nhiên', () => {
  const languages = [{ lang: 'vi-VN', provider: 'elevenlabs', engine: null, voices: [{ id: 'XrExE9', gender: 'F', name: 'Matilda' }, { id: 'Linh', gender: 'F' }] }];
  assert.equal(voiceName(languages, 'XrExE9'), 'Matilda');
  assert.equal(voiceName(languages, 'Linh'), 'Linh');
  assert.equal(voiceName([], 'XrExE9'), 'XrExE9');
});
test('Mọi ngôn ngữ trong registry đều có tên tiếng Việt', () => {
  const registry = JSON.parse(readFileSync(new URL('../../../backend/m2-trung-khang/config/voices.json', import.meta.url), 'utf8'));
  const codes = Object.keys(registry).filter(code => !code.startsWith('_'));
  assert.equal(codes.length, 33);
  assert.deepEqual(codes.filter(code => !languageNames[code]), []);
  // Azure thêm hai biến thể tiếng Trung ngoài registry gốc.
  assert.deepEqual(['zh-TW', 'zh-HK'].filter(code => !languageNames[code]), []);
});
test('Tìm tiếng Việt không dấu, kể cả chữ đ', () => {
  assert.equal(normalize('Giọng đọc tiếng Việt'), 'giong doc tieng viet');
  assert.equal(normalize('Đọc tài liệu'), 'doc tai lieu');
});
test('Tách văn bản dài không mất dấu cách, emoji hoặc ký tự', () => {
  const text = 'Xin chào 🌍. Đây là bài đọc tiếng Việt.\n'.repeat(700);
  const chunks = splitSpeech(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every(chunk => chunk.length <= 1800 && !/[\uD800-\uDBFF]$/.test(chunk)));
  const noSpace = '🌍'.repeat(2000);
  assert.equal(splitSpeech(noSpace, 1799).join(''), noSpace);
  assert.throws(() => splitSpeech(text, 0));
});
test('Bỏ bản thu hỏng khỏi dữ liệu lưu', () => {
  const valid = { jobId: 'one', text: 'Hello', lang: 'en-US', voice: 'Joanna', charCount: 5,
    createdAt: '2026-11-05T12:00:00Z', status: 'DONE', audioUrl: null };
  assert.equal(isRecording(valid), true);
  for (const wrong of [null, {}, { ...valid, createdAt: 'bad' }, { ...valid, audioUrl: 'javascript:alert(1)' }, { ...valid, status: 'UNKNOWN' }])
    assert.equal(isRecording(wrong), false);
});
