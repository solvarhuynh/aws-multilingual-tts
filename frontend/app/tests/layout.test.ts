import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutMetrics, type Insets } from '../src/lib/layout';

const devices: [string, number, number, Insets][] = [
  ['iPhone nhỏ', 320, 568, { top: 20, bottom: 0, left: 0, right: 0 }],
  ['iPhone có tai thỏ', 390, 844, { top: 59, bottom: 34, left: 0, right: 0 }],
  ['Android ba nút', 360, 800, { top: 24, bottom: 48, left: 0, right: 0 }],
  ['Android cử chỉ', 412, 915, { top: 24, bottom: 24, left: 0, right: 0 }],
  ['iPhone ngang', 844, 390, { top: 0, bottom: 21, left: 59, right: 59 }],
  ['Android ngang', 800, 360, { top: 24, bottom: 0, left: 0, right: 48 }],
  ['Tablet dọc', 768, 1024, { top: 24, bottom: 20, left: 0, right: 0 }],
  ['Tablet ngang', 1366, 1024, { top: 24, bottom: 20, left: 0, right: 0 }],
  ['Bàn phím mở', 390, 420, { top: 59, bottom: 0, left: 0, right: 0 }],
];

test('Thanh dưới và lưới nằm trong vùng an toàn khi đổi thiết bị và cỡ chữ', () => {
  for (const [name, width, height, insets] of devices) for (const scale of [1, 1.3, 1.5, 2, 3]) {
    const layout = layoutMetrics(width, height, insets, scale);
    const left = insets.left + layout.dockSide;
    const right = left + layout.dockWidth;
    assert.ok(left >= insets.left + 16, name);
    assert.ok(right <= width - insets.right - 16, name);
    assert.ok(layout.dockBottom >= insets.bottom, name);
    assert.ok(layout.dockHeight >= 56, name);
    assert.ok(layout.dockClearance > layout.dockBottom + layout.dockHeight, name);
    assert.ok(layout.contentWidth > 0 && layout.contentWidth <= 960, name);
    const cardWidth = (layout.contentWidth - (layout.columns - 1) * 12) / layout.columns;
    assert.ok(cardWidth >= 140, name);
  }
});

test('Chữ lớn giảm số cột, cửa sổ thấp thu thanh điều hướng', () => {
  const safe = { top: 59, bottom: 34, left: 0, right: 0 };
  assert.equal(layoutMetrics(390, 844, safe).columns, 2);
  assert.equal(layoutMetrics(390, 844, safe, 2).columns, 1);
  assert.equal(layoutMetrics(390, 844, safe, 2).showTabLabels, false);
  assert.equal(layoutMetrics(844, 390, safe).dockHeight, 56);
  assert.equal(layoutMetrics(1366, 1024, safe).columns, 3);
});
