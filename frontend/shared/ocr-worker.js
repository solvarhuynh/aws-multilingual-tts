import * as ort from 'onnxruntime-web';
import { DetectionService } from 'ppu-paddle-ocr/web';
import spec from './ocr-models.json';
import { sha256Hex } from './sha256';

let detector, encoder, decoder, loading;
const progress = message => self.postMessage({ progress: message });
const settings = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

class TextDetector extends DetectionService {
  async runInference(values, width, height) {
    const input = new ort.Tensor('float32', values, [1, 3, height, width]);
    let output;
    try {
      output = await this.session.run({ [this.session.inputNames[0]]: input });
      // Ignore background probabilities; the canvas SDK otherwise treats any nonzero pixel as text.
      return Float32Array.from(output[this.session.outputNames[0]].data, value => value >= 0.3 ? value : 0);
    } finally { input.dispose(); if (output) for (const tensor of Object.values(output)) tensor.dispose(); }
  }
}

async function model(base, name) {
  const expected = spec.models[name];
  const url = new URL(`viet/${name}`, base); url.searchParams.set('v', expected.sha256);
  const response = await fetch(url, { credentials: 'omit', cache: 'force-cache', signal: AbortSignal.timeout(300000) });
  if (!response.ok || !response.body) throw new Error('Không tải được bộ đọc tiếng Việt. Kiểm tra kết nối rồi thử lại.');
  const bytes = new Uint8Array(expected.bytes), reader = response.body.getReader();
  let offset = 0, last = -1;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      if (offset + value.length > bytes.length) throw new Error('Bộ đọc tiếng Việt không đúng phiên bản. Hãy tải lại ứng dụng.');
      bytes.set(value, offset); offset += value.length;
      const percent = Math.round(offset / bytes.length * 100);
      if (percent !== last) { last = percent; progress(`Đang tải bộ đọc tiếng Việt · ${Object.keys(spec.models).indexOf(name) + 1}/3 · ${percent}%`); }
    }
  } finally { await reader.cancel().catch(() => {}); }
  const digest = self.crypto?.subtle
    ? Array.from(new Uint8Array(await self.crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
    : sha256Hex(bytes);
  if (offset !== bytes.length || digest !== expected.sha256) throw new Error('Bộ đọc tiếng Việt chưa tải đầy đủ. Hãy kiểm tra mạng và thử lại.');
  return ort.InferenceSession.create(bytes, settings);
}

async function initialize(base) {
  if (loading) return loading;
  ort.env.wasm.wasmPaths = new URL('ort/', base).href;
  loading = (async () => {
    detector = new TextDetector(await model(base, 'det.onnx'), { maxSideLength: 1536, paddingVertical: 0.4 });
    encoder = await model(base, 'vietocr_encoder.onnx');
    decoder = await model(base, 'vietocr_decoder.onnx');
  })();
  return loading;
}

function deskewLine(canvas) {
  if (canvas.width < canvas.height * 3) return canvas;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height), points = [];
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    const i = (y * width + x) * 4;
    if (data[i] + data[i + 1] + data[i + 2] < 540) points.push([x - width / 2, y - height / 2]);
  }
  const score = angle => {
    const radians = angle * Math.PI / 180, sin = Math.sin(radians), cos = Math.cos(radians);
    const rows = new Uint32Array(height + Math.ceil(width * 0.3) + 4), center = rows.length / 2;
    for (const [x, y] of points) rows[Math.round(x * sin + y * cos + center)]++;
    return rows.reduce((sum, count) => sum + count * count, 0);
  };
  const initial = score(0); let best = initial, angle = 0;
  for (let candidate = -12; candidate <= 12; candidate += 2) { const value = score(candidate); if (value > best) { best = value; angle = candidate; } }
  const coarse = angle;
  for (let candidate = coarse - 1; candidate <= coarse + 1; candidate += 0.25) { const value = score(candidate); if (value > best) { best = value; angle = candidate; } }
  if (Math.abs(angle) < 0.5 || best < initial * 1.08) return canvas;
  const radians = angle * Math.PI / 180, cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
  const result = new OffscreenCanvas(Math.ceil(width * cos + height * sin), Math.ceil(width * sin + height * cos)), target = result.getContext('2d');
  target.fillStyle = 'white'; target.fillRect(0, 0, result.width, result.height);
  target.translate(result.width / 2, result.height / 2); target.rotate(radians); target.drawImage(canvas, -width / 2, -height / 2);
  canvas.width = canvas.height = 0;
  return result;
}

function cropLine(image, box) {
  let canvas = new OffscreenCanvas(Math.ceil(box.width), Math.ceil(box.height));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height);
  canvas = deskewLine(canvas);
  const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const columns = new Uint32Array(width);
  let top = height, bottom = 0, left = width, right = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 < 180) {
      top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x); columns[x]++;
    }
  }
  if (top > bottom || left > right) { canvas.width = canvas.height = 0; return []; }
  const lineHeight = bottom - top + 1, pieces = [];
  let start = left;
  while (start <= right) {
    const limit = Math.min(right + 1, Math.round(start + lineHeight * 14));
    let end = right + 1;
    if (limit <= right) {
      let run = 0;
      for (let x = start; x <= limit; x++) {
        run = columns[x] ? 0 : run + 1;
        if (x - start > lineHeight * 7 && run >= Math.max(4, lineHeight * 0.24)) end = x + 1;
      }
      // Without a real word gap, preserve the word instead of cutting a glyph.
      if (end === right + 1 && right - start > lineHeight * 32) throw new Error('Một dòng chữ quá dài hoặc chưa thẳng. Hãy chụp gần và giữ trang giấy phẳng hơn.');
    }
    const piece = new OffscreenCanvas(end - start + 4, lineHeight + 4), ctx = piece.getContext('2d');
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, piece.width, piece.height);
    ctx.drawImage(canvas, start, top, end - start, lineHeight, 2, 2, end - start, lineHeight);
    pieces.push(piece); start = end;
  }
  canvas.width = canvas.height = 0;
  return pieces;
}

async function readLine(image) {
  const meta = spec.recognition;
  const width = Math.max(meta.image_min_width, Math.min(meta.image_max_width, Math.ceil(meta.image_height * image.width / image.height / 10) * 10));
  const canvas = new OffscreenCanvas(width, meta.image_height), context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, canvas.height);
  const pixels = context.getImageData(0, 0, width, canvas.height).data;
  const length = width * canvas.height, values = new Float32Array(length * 3);
  for (let i = 0; i < length; i++) for (let channel = 0; channel < 3; channel++) values[channel * length + i] = pixels[i * 4 + channel] / 255;
  canvas.width = canvas.height = 0;
  const tensor = new ort.Tensor('float32', values, [1, 3, meta.image_height, width]);
  let hidden, features, text = '', confidence = 0, tokens = 0;
  try {
    const encoded = await encoder.run({ image: tensor });
    hidden = encoded[encoder.outputNames[0]]; features = encoded[encoder.outputNames[1]];
    for (let index = 0, token = meta.sos; index < meta.max_seq_length; index++) {
      const input = new ort.Tensor('int64', BigInt64Array.from([BigInt(token)]), [1]);
      let decoded;
      try { decoded = await decoder.run({ tgt: input, hidden, encoder_outputs: features }); }
      finally { input.dispose(); }
      hidden.dispose(); hidden = decoded[decoder.outputNames[1]];
      const probabilities = decoded[decoder.outputNames[0]], scores = probabilities.data;
      token = 0;
      for (let i = 1; i < scores.length; i++) if (scores[i] > scores[token]) token = i;
      const score = Number(scores[token]); probabilities.dispose();
      if (token === meta.eos) return { text: text.trim().normalize('NFC'), confidence: tokens ? confidence / tokens : 0 };
      text += meta.vocab[token - meta.offset] ?? '�';
      confidence += Math.exp(score); tokens++;
    }
    throw new Error('Chưa đọc hết một dòng chữ. Hãy chụp gần hơn hoặc chia ảnh thành từng phần.');
  } finally { tensor.dispose(); hidden?.dispose(); features?.dispose(); }
}

self.onmessage = async ({ data }) => {
  let canvas;
  try {
    const { width, height, pixels } = data;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 4_100_000 || pixels.length !== width * height * 4)
      throw new Error('Ảnh quá lớn hoặc không đúng định dạng.');
    await initialize(data.base);
    canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d').putImageData(new ImageData(pixels, width, height), 0, 0);
    progress('Đang tìm dòng chữ…');
    const boxes = await detector.run(canvas);
    if (!boxes.length) throw new Error('Không tìm được chữ rõ trong ảnh. Hãy chụp gần hơn, tránh lóa và giữ đủ sáng.');
    if (boxes.length > 500) throw new Error('Trang quá nhiều chữ nhỏ. Hãy chia ảnh thành các phần rõ hơn.');
    boxes.sort((a, b) => Math.abs(a.y - b.y) < Math.min(a.height, b.height) / 2 ? a.x - b.x : a.y - b.y);
    const lines = []; let uncertain = false;
    for (let index = 0; index < boxes.length; index++) {
      progress(`Đang đọc dòng ${index + 1}/${boxes.length}…`);
      const pieces = cropLine(canvas, boxes[index]), words = [];
      try {
        for (const piece of pieces) { const result = await readLine(piece); words.push(result.text); uncertain ||= result.confidence < 0.8; }
      } finally { for (const piece of pieces) piece.width = piece.height = 0; }
      if (!words.join('').trim()) throw new Error('Có dòng chưa nhận dạng được. Hãy chụp rõ hơn để tránh thiếu chữ.');
      lines.push(words.join(' '));
    }
    self.postMessage({ text: lines.join('\n'), warning: uncertain ? 'Có chữ chưa rõ. Kiểm tra dấu và số trước khi tạo giọng.' : '' });
  } catch (error) {
    self.postMessage({ error: /^(Không |Bộ đọc |Một dòng |Chưa |Ảnh |Trang |Có dòng )/.test(error?.message ?? '') ? error.message : 'Không mở được bộ đọc tiếng Việt. Kiểm tra kết nối hoặc thử ảnh nhỏ hơn.' });
  } finally { if (canvas) canvas.width = canvas.height = 0; }
};
