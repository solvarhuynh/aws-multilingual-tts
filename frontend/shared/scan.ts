// Paper corner selection adapted from jscanify 1.4 (MIT, Copyright 2023 ColonelParrot).
// https://github.com/puffinsoft/jscanify — license in web/public/licenses and app/licenses.
import { abortable, checkCancelled, type ImportOptions } from './browser-document';

type Point = { x: number; y: number };
type Mat = { data32S: Int32Array; delete(): void };
type Cv = {
  Mat: new () => Mat;
  MatVector: new () => { size(): number; get(index: number): Mat; delete(): void };
  Size: new (width: number, height: number) => unknown;
  Scalar: new (...values: number[]) => unknown;
  [key: string]: unknown;
  imread(image: HTMLCanvasElement): Mat;
  cvtColor(input: Mat, output: Mat, code: unknown): void;
  Canny(input: Mat, output: Mat, low: number, high: number): void;
  findContours(input: Mat, contours: unknown, hierarchy: Mat, mode: unknown, method: unknown): void;
  contourArea(contour: Mat): number;
  arcLength(contour: Mat, closed: boolean): number;
  approxPolyDP(contour: Mat, result: Mat, epsilon: number, closed: boolean): void;
  isContourConvex(contour: Mat): boolean;
  matFromArray(rows: number, columns: number, type: unknown, points: number[]): Mat;
  getPerspectiveTransform(source: Mat, target: Mat): Mat;
  warpPerspective(source: Mat, target: Mat, matrix: Mat, size: unknown, interpolation: unknown, border: unknown, color: unknown): void;
  imshow(canvas: HTMLCanvasElement, image: Mat): void;
};
let loading: Promise<{ cv: Cv }> | undefined;

function loadCv(options: ImportOptions) {
  if (loading) return loading;
  loading = new Promise<{ cv: Cv }>((resolve, reject) => {
    const host = window as unknown as { cv?: Cv | Promise<Cv>; TTS_OPENCV_SOURCE?: string };
    const script = document.createElement('script');
    const timer = setTimeout(() => { script.remove(); reject(new Error('Chưa tải được bộ căn ảnh. Hãy kiểm tra mạng rồi thử lại.')); }, 45000);
    const finish = () => { clearTimeout(timer); script.remove(); };
    const ready = (cv?: Cv) => {
      if (!cv) { finish(); reject(new Error('Bộ căn ảnh chưa sẵn sàng.')); return; }
      // OpenCV 4 is self-thenable: resolving it directly loops forever in Promise assimilation.
      const done = () => { finish(); resolve({ cv }); };
      if (cv.Mat) done(); else cv.onRuntimeInitialized = done;
    };
    script.onload = () => {
      if (host.cv instanceof Promise) void host.cv.then(ready).catch(error => { finish(); reject(error); });
      else ready(host.cv);
    };
    script.onerror = () => { finish(); reject(new Error('Chưa tải được bộ căn ảnh. Hãy kiểm tra mạng rồi thử lại.')); };
    if (host.TTS_OPENCV_SOURCE) script.textContent = host.TTS_OPENCV_SOURCE;
    else script.src = new URL('opencv.js', new URL(options.ocrBase ?? 'ocr/', document.baseURI)).href;
    document.head.append(script);
    if (host.TTS_OPENCV_SOURCE) script.onload?.(new Event('load'));
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}

export function paperCorners(points: Point[]): Point[] {
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
  const corners: Point[] = [];
  for (const point of points) {
    const index = (point.x >= center.x ? 1 : 0) + (point.y >= center.y ? 2 : 0);
    const previous = corners[index];
    if (!previous || Math.hypot(point.x - center.x, point.y - center.y) > Math.hypot(previous.x - center.x, previous.y - center.y)) corners[index] = point;
  }
  return corners.filter(Boolean).length === 4 ? corners : [];
}

/** Conservative paper detection; never discard a page when no reliable border is found. */
export async function scanPaper(image: HTMLCanvasElement, options: ImportOptions): Promise<HTMLCanvasElement> {
  checkCancelled(options);
  const context = image.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Thiết bị không hỗ trợ căn ảnh tài liệu.');
  const margins = [[0, 0], [image.width - 1, 0], [0, image.height - 1], [image.width - 1, image.height - 1]];
  // A scan already on white paper needs no crop; inner tables must not become the page border.
  if (margins.filter(([x, y]) => {
    const [r, g, b] = context.getImageData(x, y, 1, 1).data;
    return (r + g + b) / 3 < 210;
  }).length < 3) return image;
  options.onProgress?.('Đang căn ảnh chụp…');
  const { cv } = await abortable(loadCv(options), options);
  checkCancelled(options);
  const sample = document.createElement('canvas');
  const ratio = Math.min(1, 1000 / Math.max(image.width, image.height));
  sample.width = Math.round(image.width * ratio); sample.height = Math.round(image.height * ratio);
  sample.getContext('2d')!.drawImage(image, 0, 0, sample.width, sample.height);
  const owned: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(value: T): T => { owned.push(value); return value; };
  try {
    const source = own(cv.imread(sample)), edges = own(new cv.Mat()), hierarchy = own(new cv.Mat()), contours = own(new cv.MatVector());
    cv.cvtColor(source, edges, cv.COLOR_RGBA2GRAY);
    cv.Canny(edges, edges, 50, 150);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let corners: Point[] = [], largest = sample.width * sample.height * 0.45;
    for (let index = 0; index < contours.size(); index++) {
      const contour = contours.get(index), polygon = new cv.Mat();
      try {
        const area = cv.contourArea(contour);
        if (area <= largest) continue;
        cv.approxPolyDP(contour, polygon, cv.arcLength(contour, true) * 0.02, true);
        if (polygon.data32S.length !== 8 || !cv.isContourConvex(polygon)) continue;
        const points = Array.from({ length: 4 }, (_, n) => ({ x: polygon.data32S[n * 2] / ratio, y: polygon.data32S[n * 2 + 1] / ratio }));
        const selected = paperCorners(points);
        if (selected.length === 4) { corners = selected; largest = area; }
      } finally { contour.delete(); polygon.delete(); }
    }
    if (!corners.length) { options.onProgress?.('Đang đọc toàn bộ ảnh…'); return image; }
    const [tl, tr, bl, br] = corners;
    const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const width = Math.round(Math.max(distance(tl, tr), distance(bl, br)));
    const height = Math.round(Math.max(distance(tl, bl), distance(tr, br)));
    if (Math.min(width, height) < 200 || width * height > 4_000_000) return image;
    const original = own(cv.imread(image)), output = own(new cv.Mat());
    const from = own(cv.matFromArray(4, 1, cv.CV_32FC2, corners.flatMap(point => [point.x, point.y])));
    const to = own(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, 0, height, width, height]));
    const matrix = own(cv.getPerspectiveTransform(from, to));
    cv.warpPerspective(original, output, matrix, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar(255, 255, 255, 255));
    const result = document.createElement('canvas');
    cv.imshow(result, output);
    return result;
  } finally { for (const mat of owned.reverse()) mat.delete(); sample.width = 0; sample.height = 0; }
}
