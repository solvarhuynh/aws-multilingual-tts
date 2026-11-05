import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scrubIndex } from '../src/lib/geometry';

test('Tâm từng ô luôn đúng dù màn hình đổi kích thước', () => {
  for (const width of [208, 248, 278, 318, 620]) {
    const cell = (width - 10) / 4;
    for (let index = 0; index < 4; index++) assert.equal(scrubIndex(5 + cell * (index + 0.5), width), index);
  }
});
test('Ô chọn đi liên tục theo tay và bị giới hạn trong thanh', () => {
  assert.equal(scrubIndex(-100, 278), 0);
  assert.equal(scrubIndex(10000, 278), 3);
  assert.equal(scrubIndex(139, 278), 1.5);
  assert.equal(scrubIndex(10, 0), 0);
  assert.equal(scrubIndex(NaN, 278), 0);
});
