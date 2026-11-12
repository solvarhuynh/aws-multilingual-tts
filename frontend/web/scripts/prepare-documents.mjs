import { fileURLToPath } from 'node:url';
import { prepareOcr } from '../../shared/build-ocr.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await prepareOcr(root);
