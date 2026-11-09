import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const result = await build({ entryPoints: ['scripts/pdf-entry.js'], bundle: true, write: false, format: 'iife', platform: 'browser',
  target: 'safari16', minify: true, legalComments: 'inline', external: ['fs', 'canvas', 'node:*'] });
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const ocrWorker = await readFile('node_modules/tesseract.js/dist/worker.min.js', 'utf8');
const bootstrap = `window.TTS_OCR_WORKER=URL.createObjectURL(new Blob([${JSON.stringify(ocrWorker)}],{type:'text/javascript'}));`.replace(/<\/script/gi, '<\\/script');
await mkdir('assets/generated', { recursive: true });
await writeFile('assets/generated/pdf.html', `<!doctype html><html><meta charset="utf-8"><body><script>${bootstrap}${script}</script></body></html>`);
