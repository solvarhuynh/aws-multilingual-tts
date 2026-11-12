import assert from 'node:assert/strict';
import test from 'node:test';
import { checkedRecognition, documentPage, readDocumentPage, type DocumentResult } from '../../shared/vision';

const result: DocumentResult = { text: 'Nguyễn Thị Mỹ · 1.250.000 đồng', unclear: false, warnings: [], provider: 'gemini', model: 'gemini-test' };
const canvas = { toDataURL: () => 'data:image/jpeg;base64,/9j/Zml4dHVyZQ==' } as HTMLCanvasElement;

test('Kết quả đọc ảnh giữ dấu, chuẩn hóa Unicode và từ chối phản hồi thiếu hoặc quá dài', () => {
  assert.equal(checkedRecognition({ ...result, text: result.text.normalize('NFD') }).text, result.text);
  for (const fields of [{ text: '' }, { text: 'a'.repeat(20001) }, { unclear: 'false' }, { warnings: ['x'.repeat(201)] }, { provider: 'device' }])
    assert.throws(() => checkedRecognition({ ...result, ...fields } as DocumentResult), /Bản nháp được giữ nguyên/);
});

test('Chuẩn bị ảnh tối đa 2 MiB, không đổi kích thước hoặc tự giảm chất lượng vô hạn', async () => {
  assert.equal((await documentPage(canvas)).mimeType, 'image/jpeg');
  let attempts = 0;
  const huge = { toDataURL: () => { attempts++; return 'data:image/jpeg;base64,' + 'A'.repeat(3 * 1024 * 1024); } } as HTMLCanvasElement;
  await assert.rejects(documentPage(huge), /quá 2 MB/);
  assert.equal(attempts, 3);
});

test('Hủy trước/sau phản hồi không nhận nội dung; cảnh báo không biến thành văn bản đọc', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(readDocumentPage(canvas, async () => { calls++; return result; }, { signal: controller.signal }), /Đã hủy/);
  assert.equal(calls, 0);
  const late = new AbortController();
  await assert.rejects(readDocumentPage(canvas, async () => { late.abort(); return result; }, { signal: late.signal }), /Đã hủy/);
  const warnings: string[] = [];
  assert.equal(await readDocumentPage(canvas, async () => ({ ...result, unclear: true, warnings: ['Cuối trang bị mờ.'] }), {
    onWarning: value => warnings.push(value),
  }), result.text);
  assert.match(warnings[0], /chưa đọc rõ/);
  assert.match(warnings[0], /Cuối trang/);
});
