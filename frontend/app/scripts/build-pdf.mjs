import { prepareOcr } from '../../shared/build-ocr.mjs';
await prepareOcr(new URL('../', import.meta.url), new URL('../assets/generated/pdf.html', import.meta.url));
