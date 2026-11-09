import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkedDocument, splitDocument, wordCount, ocrLanguage } from '../../shared/documents';
import { abortable, imageText, pdfText } from '../../shared/browser-document';

test('Chia tài liệu giữ đủ nội dung, giới hạn phần và cặp UTF-16', () => {
  for (const text of ['Xin chào. '.repeat(15000), '日本語'.repeat(12000), 'a'.repeat(1999) + '🌏'.repeat(2000), 'a'.repeat(2000) + ' '.repeat(4000) + 'b']) {
    const parts = splitDocument(text);
    assert.equal(parts.join(''), text);
    assert.ok(parts.every(part => part.length <= 2000));
    assert.ok(parts.every(part => !/[\uD800-\uDBFF]$/.test(part) && !/^[\uDC00-\uDFFF]/.test(part)));
  }
  assert.throws(() => splitDocument('text', 1));
  assert.equal(wordCount('Tiếng Việt\nhello\tworld'), 4);
});

test('Giới hạn ký tự và từ độc lập; ngôn ngữ OCR khớp lựa chọn', () => {
  assert.equal(checkedDocument('x'.repeat(200000)).length, 200000);
  assert.throws(() => checkedDocument('x '.repeat(50001)), /50\.000/);
  assert.equal(ocrLanguage('vi-VN'), 'vie+eng');
  assert.equal(ocrLanguage('ja-JP'), 'jpn+eng');
  assert.equal(ocrLanguage('zh-TW'), 'chi_tra+eng');
  assert.equal(ocrLanguage('en-US'), 'eng');
});

function fakePdf(texts: string[]) {
  let rendered = 0, cleaned = 0;
  const canvases: { width: number; height: number }[] = [];
  const original = globalThis.document;
  globalThis.document = { createElement: () => {
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }) };
    canvases.push(canvas); return canvas;
  } } as unknown as Document;
  const pdf = { numPages: texts.length, getPage: async (index: number) => ({
    getTextContent: async () => ({ items: [{ str: texts[index - 1] }] }),
    getViewport: ({ scale }: { scale: number }) => ({ width: 1000 * scale, height: 1000 * scale }),
    render: () => { rendered++; return { promise: Promise.resolve() }; },
    cleanup: () => { cleaned++; },
  }) };
  return { pdf, canvases, stats: () => ({ rendered, cleaned }), restore: () => { globalThis.document = original; } };
}

test('PDF có chữ không gọi OCR; PDF hỗn hợp chỉ OCR trang scan', async () => {
  const fixture = fakePdf(['Nội dung có chữ', '', 'Trang cuối']);
  let calls = 0;
  try {
    const text = await pdfText(fixture.pdf, async () => { calls++; return 'Chữ nhận dạng'; });
    assert.match(text, /Nội dung có chữ/); assert.match(text, /Chữ nhận dạng/); assert.match(text, /Trang cuối/);
    assert.equal(calls, 1);
    assert.deepEqual(fixture.stats(), { rendered: 1, cleaned: 3 });
    assert.ok(fixture.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  } finally { fixture.restore(); }
});

test('PDF vượt cap trang/scan hoặc OCR lỗi không trả nội dung thiếu', async () => {
  const fixture = fakePdf(Array(31).fill(''));
  try {
    await assert.rejects(pdfText({ ...fixture.pdf, numPages: 201 }, async () => ''), /200 trang/);
    await assert.rejects(pdfText(fixture.pdf, async () => 'scan'), /30 trang scan/);
    await assert.rejects(pdfText(fixture.pdf, async () => { throw new Error('ocr failed'); }), /ocr failed/);
    await assert.rejects(pdfText(fixture.pdf, async () => ''), /chưa nhập tài liệu thiếu trang/);
  } finally { fixture.restore(); }
});

test('PDF đủ 200.000 ký tự được nhận; vượt giới hạn bị từ chối', async () => {
  const fixture = fakePdf(['x'.repeat(200000)]);
  try {
    assert.equal((await pdfText(fixture.pdf, async () => '')).length, 200000);
    fixture.pdf.getPage = async () => ({ getTextContent: async () => ({ items: [{ str: 'x'.repeat(200001) }] }),
      getViewport: () => ({ width: 1, height: 1 }), render: () => ({ promise: Promise.resolve() }), cleanup() {} });
    await assert.rejects(pdfText(fixture.pdf, async () => ''), /200\.000/);
  } finally { fixture.restore(); }
});

test('Hủy OCR đang treo kết thúc ngay và dọn canvas/page', async () => {
  const fixture = fakePdf(['']);
  const controller = new AbortController();
  try {
    const pending = pdfText(fixture.pdf, async () => { controller.abort(); return new Promise(() => {}); }, { signal: controller.signal });
    await assert.rejects(pending, /Đã hủy/);
    assert.equal(fixture.stats().cleaned, 1);
    assert.equal(fixture.canvases[0].width, 0);
  } finally { fixture.restore(); }
});

test('Worker tạo xong sau hủy được terminate qua callback', async () => {
  const controller = new AbortController(); let resolve!: (value: string) => void, cleaned = '';
  const pending = abortable(new Promise<string>(done => { resolve = done; }), { signal: controller.signal }, value => { cleaned = value; });
  controller.abort(); await assert.rejects(pending, /Đã hủy/);
  resolve('late worker'); await Promise.resolve();
  assert.equal(cleaned, 'late worker');
});

test('Ảnh scan OCR có cleanup và không chấp nhận ảnh quá lớn', async () => {
  const fixture = fakePdf([]), original = globalThis.Image;
  class FakeImage {
    naturalWidth = 2000; naturalHeight = 1000; onload?: () => void;
    set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); }
  }
  globalThis.Image = FakeImage as unknown as typeof Image;
  try {
    assert.equal(await imageText('image', async () => 'Tiếng Việt.'), 'Tiếng Việt.');
    assert.equal(fixture.canvases[0].width, 0);
    FakeImage.prototype.naturalWidth = 50000;
    globalThis.Image = class extends FakeImage { naturalWidth = 50000; } as unknown as typeof Image;
    await assert.rejects(imageText('large', async () => 'text'), /40 megapixel/);
  } finally { fixture.restore(); globalThis.Image = original; }
});
