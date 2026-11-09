import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translateDocument, TRANSLATION_PART_CHARS, type TranslationDraft } from '../../shared/translation';

test('Dịch và đọc có giới hạn riêng; tài liệu 10.000+ ký tự dịch thành phần 2.000', async () => {
  const source = 'a'.repeat(1999) + '🌏'.repeat(4000) + ' tail';
  const calls: { text: string; context: string }[] = [];
  let result: TranslationDraft | null = null;
  for await (const draft of translateDocument(source, 'vi-VN', 'en-US', async (text, _from, _to, context) => {
    calls.push({ text, context }); return { translatedText: text };
  }, null, () => false)) result = draft;
  assert.equal(result!.sourceParts.join(''), source);
  assert.ok(calls.length > 5);
  assert.ok(calls.every(call => call.text.length <= TRANSLATION_PART_CHARS && call.context.length <= 600));
  assert.ok(calls.every(call => !/^[\uDC00-\uDFFF]/.test(call.context) && !/[\uD800-\uDBFF]$/.test(call.context)));
});

test('Dừng giữ phần đã xong; tiếp tục không gọi lại và ngữ cảnh lấy từ bản gốc', async () => {
  const source = 'a'.repeat(2000) + 'b'.repeat(2000) + 'tail';
  const calls: string[] = [];
  const translate = async (text: string, _from: string, _to: string, context: string) => {
    calls.push(context); return { translatedText: text.toUpperCase() };
  };
  let saved: TranslationDraft | null = null;
  for await (const result of translateDocument(source, 'vi-VN', 'en-US', translate, null, () => false)) { saved = result; break; }
  assert.equal(saved!.translatedParts.length, 1);
  for await (const result of translateDocument(source, 'vi-VN', 'en-US', translate, saved, () => false)) saved = result;
  assert.equal(calls.length, 3);
  assert.equal(calls[1], 'a'.repeat(600));
  assert.equal(saved!.translatedParts.length, 3);
  for await (const result of translateDocument('new', 'vi-VN', 'en-US', translate, saved, () => false)) saved = result;
  assert.equal(saved!.translatedParts.join(''), 'NEW');
});

test('Kết quả về sau hủy/đổi nguồn không được ghi vào bản dịch', async () => {
  let cancelled = false, calls = 0, updates = 0;
  for await (const _ of translateDocument('source', 'vi-VN', 'en-US', async () => {
    calls++; cancelled = true; return { translatedText: 'late' };
  }, null, () => cancelled)) updates++;
  assert.equal(calls, 1); assert.equal(updates, 0);
});

test('Dịch lỗi giữ checkpoint, phần trắng không gọi provider và không chấp nhận bản dịch rỗng', async () => {
  let saved: TranslationDraft | null = null;
  await assert.rejects(async () => {
    for await (const result of translateDocument('a'.repeat(2000) + 'tail', 'vi-VN', 'en-US', async text => {
      if (text === 'tail') throw new Error('quota'); return { translatedText: text };
    }, null, () => false)) saved = result;
  }, /quota/);
  assert.equal((saved as TranslationDraft | null)?.translatedParts.length, 1);
  let count = 0;
  for await (const _ of translateDocument('a'.repeat(2000) + ' '.repeat(4000) + 'b', 'vi-VN', 'en-US', async text => {
    count++; return { translatedText: text };
  }, null, () => false)) {}
  assert.equal(count, 2);
  await assert.rejects(async () => {
    for await (const _ of translateDocument('text', 'vi-VN', 'en-US', async () => ({ translatedText: '' }), null, () => false)) {}
  }, /rỗng/);
});
