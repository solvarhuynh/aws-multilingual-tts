import { copyFile, cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const shared = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(await readFile(path.join(shared, 'ocr-models.json'), 'utf8'));
const cache = path.join(shared, '../.cache/ocr', spec.release);
const valid = async (file, expected) => {
  try { const bytes = await readFile(file); return bytes.length === expected.bytes && createHash('sha256').update(bytes).digest('hex') === expected.sha256; }
  catch { return false; }
};

async function prepareTesseract(modules, output) {
  for (const name of ['core', 'lang']) await mkdir(path.join(output, name), { recursive: true });
  await copyFile(path.join(modules, 'tesseract.js/dist/worker.min.js'), path.join(output, 'worker.min.js'));
  await writeFile(path.join(output, 'worker-entry.js'), `
const send = self.postMessage.bind(self);
let timer;
self.addEventListener('message', ({ data }) => {
  // Tesseract 7 initialize requires codes rather than the model byte objects used by loadLanguage.
  if (data.action === 'initialize' && Array.isArray(data.payload.langs))
    data.payload.langs = data.payload.langs.map(lang => typeof lang === 'string' ? lang : lang.code).join('+');
  clearTimeout(timer);
  timer = setTimeout(() => self.postMessage({ workerId: data.workerId, jobId: data.jobId,
    action: data.action, status: 'reject', data: 'OCR_TIMEOUT' }), 120000);
});
self.postMessage = (message, ...args) => {
  if (message.status === 'resolve' || message.status === 'reject') clearTimeout(timer);
  send(message, ...args);
  if (message.status === 'reject') self.close();
};
importScripts(new URL('worker.min.js', self.location.href).href);
`);
  for (const name of await readdir(path.join(modules, 'tesseract.js-core')))
    if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(name)) await copyFile(path.join(modules, 'tesseract.js-core', name), path.join(output, 'core', name));
  const manifest = {};
  for (const lang of ['eng', 'vie', 'jpn', 'kor', 'chi_sim', 'chi_tra']) {
    const source = path.join(modules, `@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`);
    await copyFile(source, path.join(output, 'lang', `${lang}.bin`));
    const bytes = await readFile(source);
    manifest[lang] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest));
}

export async function prepareOcr(root, nativeReader) {
  root = root instanceof URL ? fileURLToPath(root) : root;
  const modules = path.join(root, 'node_modules'), output = path.join(root, 'public/ocr');
  const { build } = createRequire(path.join(root, 'package.json'))('esbuild');
  await mkdir(cache, { recursive: true });
  await mkdir(path.join(output, 'viet'), { recursive: true });
  await mkdir(path.join(output, 'ort'), { recursive: true });
  await prepareTesseract(modules, output);
  await copyFile(path.join(modules, '@techstark/opencv-js/dist/opencv.js'), path.join(output, 'opencv.js'));
  for (const name of ['cmaps', 'standard_fonts', 'wasm'])
    await cp(path.join(modules, 'pdfjs-dist', name), path.join(root, 'public/pdf', name), { recursive: true });
  await copyFile(path.join(modules, 'pdfjs-dist/LICENSE'), path.join(root, 'public/pdf/LICENSE'));
  for (const [name, expected] of Object.entries(spec.models)) {
    const file = path.join(cache, name);
    if (!await valid(file, expected)) {
      console.log(`Tải model OCR tiếng Việt: ${name}`);
      const temporary = `${file}.${process.pid}.download`;
      try {
        const response = await fetch(spec.base + name, { signal: AbortSignal.timeout(180000) });
        if (!response.ok || !response.body) throw new Error(`Không tải được model OCR ${name}: HTTP ${response.status}`);
        await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
        if (!await valid(temporary, expected)) throw new Error(`Model OCR ${name} sai kích thước hoặc SHA-256.`);
        await rename(temporary, file);
      } finally { await rm(temporary, { force: true }); }
    }
    await copyFile(file, path.join(output, 'viet', name));
  }
  for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'])
    await copyFile(path.join(modules, 'onnxruntime-web/dist', name), path.join(output, 'ort', name));
  const options = { bundle: true, platform: 'browser', target: 'safari16.4', minify: true, legalComments: 'inline', nodePaths: [modules], external: ['fs', 'canvas', 'node:*'] };
  await build({ ...options, entryPoints: [path.join(shared, 'ocr-worker.js')], outfile: path.join(output, 'viet-worker.js'), format: 'iife',
    alias: { 'onnxruntime-web': path.join(modules, 'onnxruntime-web/dist/ort.wasm.min.mjs') } });
  const bundled = await build({ ...options, entryPoints: [path.join(shared, 'reader-entry.js')], write: false, format: 'iife' });
  const script = bundled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><script>${script}</script></body></html>`;
  await writeFile(path.join(output, 'reader.html'), html);
  if (nativeReader) { await mkdir(path.dirname(fileURLToPath(nativeReader)), { recursive: true }); await writeFile(nativeReader, html); }
}
