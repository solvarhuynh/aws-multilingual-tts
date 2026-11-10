import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeHistoryPage } from '../../shared/history';

const item = (jobId: string, status = 'DONE') => ({ jobId, status });

test('Làm mới nền thấy bản thu mới và trạng thái mới, bỏ bản đã xóa trong trang đầu', () => {
  const previous = { items: [item('9'), item('8', 'PROCESSING'), item('7'), item('6'), item('5')], nextCursor: '5' };
  const next = mergeHistoryPage(previous, { items: [item('a'), item('8')], nextCursor: '7' }, false, true);
  assert.deepEqual(next, { items: [item('a'), item('8'), item('6'), item('5')], nextCursor: '5' });
});

test('Trang đầy đủ hoặc rỗng xóa dữ liệu cũ; không hiện bản thu từ snapshot cũ', () => {
  const previous = { items: [item('9'), item('8')], nextCursor: null };
  assert.deepEqual(mergeHistoryPage(previous, { items: [], nextCursor: null }, false, true), { items: [], nextCursor: null });
  assert.deepEqual(mergeHistoryPage(previous, { items: [item('9')], nextCursor: null }, false, true).items, [item('9')]);
});

test('Tải thêm không trùng ID và giữ cursor tiếp theo; làm mới chủ động quay về trang đầu', () => {
  const previous = { items: [item('9'), item('8')], nextCursor: '8' };
  const incoming = { items: [item('8'), item('7')], nextCursor: '7' };
  assert.deepEqual(mergeHistoryPage(previous, incoming, true), { items: [item('9'), item('8'), item('7')], nextCursor: '7' });
  assert.deepEqual(mergeHistoryPage(previous, incoming), incoming);
});

test('Giữ trang đã tải hết dù trang đầu có thêm bản thu mới', () => {
  const previous = { items: [item('9'), item('8'), item('7')], nextCursor: null };
  assert.deepEqual(mergeHistoryPage(previous, { items: [item('a'), item('9')], nextCursor: '9' }, false, true),
    { items: [item('a'), item('9'), item('8'), item('7')], nextCursor: null });
});
