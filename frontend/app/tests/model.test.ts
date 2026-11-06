import assert from 'node:assert/strict';
import { test } from 'node:test';
import { duration, isRecording, normalize, splitSpeech, validate, type Input } from '../src/lib/model';

const input: Input = { text: 'Xin chào.', lang: 'vi-VN', voice: 'Linh', speed: 1, translateTo: null };
test('Văn bản rỗng hiển thị thời lượng bằng không', () => {
  for (const text of ['', '  \n ']) assert.equal(duration(text), 0);
  assert.ok(duration('Xin chào.') >= 1);
});
test('Chặn nội dung rỗng, quá dài và tốc độ sai', () => {
  assert.equal(validate(input), null);
  for (const text of ['', '  \n ', 'x'.repeat(20001)]) assert.ok(validate({ ...input, text }));
  for (const speed of [0, 2.1, NaN, Infinity]) assert.ok(validate({ ...input, speed }));
  assert.ok(validate({ ...input, translateTo: 'vi-VN' }));
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
