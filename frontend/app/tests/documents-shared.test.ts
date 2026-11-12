import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkedDocument, splitDocument, wordCount, ocrLanguage } from '../../shared/documents';
import { abortable, imageText, joinTextItems, pdfText } from '../../shared/browser-document';
import { loadOcrModels, recognizeText } from '../../shared/ocr';
import { sha256Hex } from '../../shared/sha256';
import { paperCorners } from '../../shared/scan';
import { expressionHint, expressionOptions } from '../../shared/expression';
import { createVietnameseReader } from '../../shared/vietocr';
import ocrModels from '../../shared/ocr-models.json';

test('Model tự phục vụ kiểm hash, không phụ thuộc crypto.subtle trên mạng LAN', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document;
  const bytes = new Uint8Array([31, 139, 8, 0]), requests: string[] = [];
  let corrupt = false;
  globalThis.document = { baseURI: 'http://fixture.test/' } as Document;
  globalThis.fetch = (async (url: URL) => {
    requests.push(url.href);
    return url.pathname.endsWith('manifest.json') ? Response.json({ eng: { bytes: bytes.length, sha256: sha256Hex(bytes) } }) :
      new Response(corrupt ? new Uint8Array([31, 139, 0, 0]) : bytes);
  }) as typeof fetch;
  try {
    const result = await loadOcrModels({ lang: 'en-US' });
    assert.deepEqual(result, [{ code: 'eng', data: bytes }]);
    assert.ok(requests.every(url => url.startsWith('http://fixture.test/ocr/')));
    corrupt = true;
    await assert.rejects(loadOcrModels({ lang: 'en-US' }), /Chưa tải được/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(loadOcrModels({ lang: 'en-US', signal: controller.signal }), /Đã hủy/);
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument; }
});

test('Model tiếng Việt có đủ dấu, đúng bảng mã của bản export đã khóa', () => {
  const { vocab, offset, sos, eos } = ocrModels.recognition;
  for (const char of 'ăâđêôơưĂÂĐÊÔƠƯ' + Array.from({ length: 90 }, (_, i) => String.fromCharCode(0x1ea0 + i)).join(''))
    assert.ok(vocab.includes(char), `Thiếu ${char}`);
  assert.equal(new Set(vocab).size, vocab.length);
  assert.equal(offset, 4); assert.equal(sos, 1); assert.equal(eos, 2);
});

test('Bộ đọc chạy trong worker riêng, hủy/lỗi không giữ request hoặc nhận kết quả cũ', async () => {
  const originalWorker = globalThis.Worker, originalDocument = globalThis.document;
  let instance: FakeWorker;
  class FakeWorker {
    onmessage?: (event: { data: object }) => void;
    onerror?: (event: { preventDefault(): void }) => void;
    stopped = false;
    request?: { base: string; width: number; height: number; pixels: Uint8ClampedArray };
    constructor() { instance = this; }
    postMessage(request: FakeWorker['request']) { this.request = request; }
    terminate() { this.stopped = true; }
  }
  globalThis.Worker = FakeWorker as unknown as typeof Worker;
  globalThis.document = { baseURI: 'https://fixture.test/' } as Document;
  const image = { width: 1, height: 1, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }) }) } as unknown as HTMLCanvasElement;
  const controller = new AbortController(), progress: string[] = [], warnings: string[] = [];
  const reader = createVietnameseReader({ signal: controller.signal, onProgress: value => progress.push(value), onWarning: value => warnings.push(value) });
  try {
    const result = reader.recognize(image);
    assert.equal(instance!.request?.base, 'https://fixture.test/ocr/');
    instance!.onmessage?.({ data: { progress: 'Đang đọc dòng 1/1…' } });
    instance!.onmessage?.({ data: { text: 'Tiếng Việt', warning: 'Chữ mờ' } });
    assert.equal(await result, 'Tiếng Việt'); assert.equal(progress.length, 1); assert.deepEqual(warnings, ['Chữ mờ']);
    const pending = reader.recognize(image);
    controller.abort(); await assert.rejects(pending, /Đã hủy/);
    instance!.onmessage?.({ data: { text: 'Phản hồi cũ' } });
    assert.equal(instance!.stopped, true);
    await assert.rejects(reader.recognize(image), /Đã hủy/);
  } finally { reader.terminate(); globalThis.Worker = originalWorker; globalThis.document = originalDocument; }
});

test('Sắc thái chỉ hiện đúng khả năng của giọng, nhận diện tự động cần cấu hình', () => {
  assert.deepEqual(expressionOptions([], true), [{ value: 'neutral', label: 'Tự nhiên' }]);
  assert.deepEqual(expressionOptions(['cheerful', 'sad', 'sad', '<bad>']).map(item => item.value), ['neutral', 'cheerful', 'sad']);
  assert.deepEqual(expressionOptions(['cheerful'], true).map(item => item.value), ['neutral', 'auto', 'cheerful']);
  assert.match(expressionHint('azure'), /Danh sách giọng cũ/);
  assert.doesNotMatch(expressionHint('azure', []), /Danh sách giọng cũ/);
  assert.doesNotMatch(expressionHint('elevenlabs'), /Danh sách giọng cũ/);
});

test('OCR nhận dạng bố cục tự động, chỉnh nghiêng và giữ dấu tiếng Việt', async () => {
  let settings: unknown, rotation: unknown;
  const worker = {
    setParameters: async (value: unknown) => { settings = value; },
    recognize: async (_: unknown, value: unknown) => { rotation = value; return { data: { text: ' Tiếng Việt ', confidence: 87 } }; },
  };
  assert.equal(await recognizeText(worker, {} as HTMLCanvasElement), ' Tiếng Việt ');
  assert.deepEqual(settings, { tessedit_pageseg_mode: '3', preserve_interword_spaces: '1', user_defined_dpi: '300' });
  assert.deepEqual(rotation, { rotateAuto: true });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(recognizeText(worker, {} as HTMLCanvasElement, { signal: controller.signal }), /Đã hủy/);
});

test('Căn giấy giữ bốn góc theo thứ tự và không dùng tứ giác thiếu góc', () => {
  assert.deepEqual(paperCorners([{ x: 800, y: 1000 }, { x: 40, y: 30 }, { x: 100, y: 950 }, { x: 850, y: 80 }]),
    [{ x: 40, y: 30 }, { x: 850, y: 80 }, { x: 100, y: 950 }, { x: 800, y: 1000 }]);
  assert.deepEqual(paperCorners([{ x: 1, y: 1 }, { x: 3, y: 3 }, { x: 2, y: 2 }]), []);
});

test('Chia tài liệu giữ đủ nội dung, giới hạn phần và cặp UTF-16', () => {
  for (const text of ['Xin chào. '.repeat(15000), '日本語'.repeat(12000), 'a'.repeat(1999) + '🌏'.repeat(2000), 'a'.repeat(2000) + ' '.repeat(4000) + 'b']) {
    const parts = splitDocument(text);
    assert.equal(parts.join(''), text);
    assert.ok(parts.every(part => part.length <= 10000));
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

// Mảnh chữ pdf.js: transform = [scaleX, skewY, skewX, scaleY, x, y], cỡ chữ 12.
const piece = (str: string, x: number, width: number, y = 700, hasEOL = false) =>
  ({ str, hasEOL, width, transform: [12, 0, 0, 12, x, y] });

test('PDF tiếng Việt: ghép mảnh chữ có dấu nằm sát nhau, giữ khoảng trắng thật', () => {
  const items = [piece('Hồ sơ ', 0, 36), piece('thuy', 36, 24), piece('ế', 60, 7), piece('t', 67, 4),
    piece('minh', 75, 26), piece('d', 105, 6), piece('ự', 111, 7), piece('án', 122, 13, 700, true),
    piece('Mẫu', 0, 22, 680)];
  assert.equal(joinTextItems(items), 'Hồ sơ thuyết minh dự án\nMẫu');
});

test('PDF: không nhân đôi dấu cách, dựng lại dấu tách rời và giữ cách cũ khi thiếu vị trí', () => {
  assert.equal(joinTextItems([piece('Cuộc thi ', 0, 50), piece('UTE', 80, 20)]), 'Cuộc thi UTE');
  const decomposed = 'thuye' + String.fromCharCode(0x302, 0x301) + 't';
  assert.notEqual(decomposed, 'thuyết');
  assert.equal(joinTextItems([{ str: decomposed }]), 'thuyết');
  assert.equal(joinTextItems([{ str:'thuyết' }]), 'thuyết');
  assert.equal(joinTextItems([{ str: 'Không' }, { str: 'vị trí', hasEOL: true }, { str: 'dòng hai' }]), 'Không vị trí\ndòng hai');
  assert.equal(joinTextItems([piece('Dòng một', 0, 50), piece('Dòng hai', 0, 50, 680)]), 'Dòng một Dòng hai');
  assert.equal(joinTextItems([{}, piece('', 10, 0), piece('chữ', 20, 15)]), 'chữ');
});
