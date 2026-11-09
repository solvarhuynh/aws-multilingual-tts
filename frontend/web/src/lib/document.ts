import { checkedDocument, MAX_FILE_BYTES, ocrLanguage } from '../../../shared/documents';
import { abortable, checkCancelled, imageText, pdfText, type ImportOptions } from '../../../shared/browser-document';

export async function extractDocument(file: File, options: ImportOptions = {}): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['txt', 'md', 'pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp'].includes(extension))
    throw new Error('Hỗ trợ PDF, DOCX, TXT, Markdown và ảnh JPG/PNG/WebP.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Tệp tối đa 20 MB. Hãy chia nhỏ tài liệu.');
  let worker: Awaited<ReturnType<typeof import('tesseract.js').createWorker>> | undefined;
  const cancel = () => { void worker?.terminate(); };
  options.signal?.addEventListener('abort', cancel);
  const recognize = async (image: HTMLCanvasElement) => {
    checkCancelled(options);
    if (!worker) {
      options.onProgress?.('Đang tải bộ nhận dạng chữ lần đầu…');
      const [{ createWorker, OEM }, workerScript] = await Promise.all([
        import('tesseract.js'), import('tesseract.js/dist/worker.min.js?url'),
      ]);
      checkCancelled(options);
      worker = await abortable(createWorker(ocrLanguage(options.lang ?? 'vi-VN'), OEM.LSTM_ONLY, {
        workerPath: workerScript.default,
        logger: info => { if (info.status === 'recognizing text') options.onProgress?.(`Đang nhận dạng chữ ${Math.round(info.progress * 100)}%…`); },
      }), options, late => { void late.terminate(); });
    }
    checkCancelled(options);
    return (await abortable(worker.recognize(image), options)).data.text;
  };
  try {
    checkCancelled(options);
    if (extension === 'pdf') {
      const [pdfjs, script] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
      pdfjs.GlobalWorkerOptions.workerSrc = script.default;
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true });
      try { return await pdfText(await abortable(task.promise, options), recognize, options); }
      catch (error) {
        if ((error as Error).name === 'PasswordException') throw new Error('Vui lòng mở khóa PDF trước khi nhập.');
        throw error;
      } finally { await task.destroy(); }
    }
    if (['png', 'jpg', 'jpeg', 'webp'].includes(extension)) {
      const url = URL.createObjectURL(file);
      try { return await imageText(url, recognize, options); }
      finally { URL.revokeObjectURL(url); }
    }
    if (extension === 'docx') {
      const mammoth = await import('mammoth');
      return checkedDocument((await abortable(mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }), options)).value);
    }
    return checkedDocument(await abortable(file.text(), options));
  } finally {
    options.signal?.removeEventListener('abort', cancel);
    await worker?.terminate();
  }
}
