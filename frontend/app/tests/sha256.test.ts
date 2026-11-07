import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { sha256Hex } from '../src/lib/sha256';

const expected = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

test('SHA-256 khớp thư viện chuẩn ở mọi độ dài biên', () => {
  for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 2000]) {
    assert.equal(sha256Hex('a'.repeat(length)), expected('a'.repeat(length)), `độ dài ${length}`);
  }
});
test('SHA-256 đúng với tiếng Việt, tiếng Nhật và emoji', () => {
  for (const text of ['Xin chào, tiếng Việt có dấu', 'こんにちは', 'Giọng đọc 🎙️ thử', '{"text":"Xin chào","speed":0.9}']) {
    assert.equal(sha256Hex(text), expected(text));
  }
});
