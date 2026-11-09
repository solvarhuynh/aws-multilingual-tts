import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const modules = path.join(root, 'node_modules');
const output = path.join(root, 'public/ocr');
await rm(output, { recursive: true, force: true });
for (const name of ['core', 'lang']) await mkdir(path.join(output, name), { recursive: true });
await copyFile(path.join(modules, 'tesseract.js/dist/worker.min.js'), path.join(output, 'worker.min.js'));
// Tesseract 7 không đóng worker khi tải model lỗi; chuyển lỗi trước khi giải phóng.
await writeFile(path.join(output, 'worker-entry.js'), `
const send = self.postMessage.bind(self);
let timer;
self.addEventListener('message', ({ data }) => {
  // Tesseract 7 initialize nhầm Lang.data thành tên file khi truyền model bytes.
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
  if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(name))
    await copyFile(path.join(modules, 'tesseract.js-core', name), path.join(output, 'core', name));
const manifest = {};
for (const lang of ['eng', 'vie', 'jpn', 'kor', 'chi_sim', 'chi_tra']) {
  await copyFile(path.join(modules, `@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`),
    path.join(output, 'lang', `${lang}.bin`));
  // .bin giữ nguyên gzip bytes; static host không tự gắn Content-Encoding theo .gz.
  const data = await readFile(path.join(output, 'lang', `${lang}.bin`));
  manifest[lang] = { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest));

for (const name of ['cmaps', 'standard_fonts', 'wasm'])
  await cp(path.join(modules, 'pdfjs-dist', name), path.join(root, 'public/pdf', name), { recursive: true });
await copyFile(path.join(modules, 'pdfjs-dist/LICENSE'), path.join(root, 'public/pdf/LICENSE'));
