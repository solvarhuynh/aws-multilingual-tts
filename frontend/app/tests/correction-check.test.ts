import assert from 'node:assert/strict';
import test from 'node:test';
import { skippableCorrection } from '../../shared/correction-check';

test('Bỏ kiểm tra đang chờ hủy request và bỏ phản hồi đến muộn', async () => {
  let release!: (value: string) => void;
  let signal!: AbortSignal;
  const waiting = skippableCorrection<string>(current => {
    signal = current;
    return new Promise(resolve => { release = resolve; });
  });
  waiting.skip();
  assert.equal(await waiting.result, null);
  assert.equal(signal.aborted, true);
  release('đề xuất đến muộn');
  assert.equal(await waiting.result, null);
});
