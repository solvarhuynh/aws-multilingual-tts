import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SubmissionLedger } from '../../shared/submissions';

test('Ledger giữ key qua reload, không lưu text/token và xóa sau terminal', async () => {
  let stored: unknown;
  const save = async (value: unknown) => { stored = JSON.parse(JSON.stringify(value)); };
  const ledger = new SubmissionLedger(); ledger.configure({}, save);
  const digest = 'a'.repeat(64), key = await ledger.reserve(digest);
  await ledger.accepted(digest, 'job-1');
  assert.deepEqual(stored, { [digest]: { key, jobId: 'job-1' } });
  const reloaded = new SubmissionLedger(); reloaded.configure(stored, save);
  assert.equal(await reloaded.reserve(digest), key);
  await reloaded.finish('job-1'); assert.deepEqual(stored, {});
  assert.notEqual(await reloaded.reserve(digest), key);
});

test('Ledger không mất reserve đồng thời khi finish đang ghi storage', async () => {
  const ledger = new SubmissionLedger(); let stored: unknown, release!: () => void, block = false;
  ledger.configure({}, async value => { if (block) { block = false; await new Promise<void>(done => { release = done; }); } stored = JSON.parse(JSON.stringify(value)); });
  await ledger.reserve('a'.repeat(64)); await ledger.accepted('a'.repeat(64), 'done');
  block = true;
  const finish = ledger.finish('done'); await Promise.resolve();
  const reserve = ledger.reserve('b'.repeat(64)); release();
  const [, key] = await Promise.all([finish, reserve]);
  assert.deepEqual(stored, { ['b'.repeat(64)]: { key } });
});

test('Ledger lỗi lưu trước submit phải báo lỗi; retry giữ key; terminal lỗi vẫn an toàn', async () => {
  const ledger = new SubmissionLedger(); let fail = true, stored: Record<string, { key: string; jobId?: string }> = {};
  ledger.configure({}, async value => { if (fail) throw new Error('storage'); stored = value; });
  await assert.rejects(ledger.reserve('a'.repeat(64)), /storage/);
  fail = false; const key = await ledger.reserve('a'.repeat(64));
  await ledger.accepted('a'.repeat(64), 'one');
  fail = true; await ledger.finish('one'); fail = false;
  assert.equal(await ledger.reserve('a'.repeat(64)), key);
  await ledger.reject('a'.repeat(64)); assert.deepEqual(stored, {});
});

test('Ledger làm sạch dữ liệu nạp và giới hạn số submit chưa rõ kết quả', async () => {
  const ledger = new SubmissionLedger(); let stored: unknown;
  ledger.configure({ bad: { key: 'invalid' }, ['a'.repeat(64)]: { key: 'opaque-key', text: 'PRIVATE', token: 'PRIVATE' } }, async value => { stored = value; });
  await ledger.reserve('a'.repeat(64));
  assert.deepEqual(stored, { ['a'.repeat(64)]: { key: 'opaque-key' } });
  ledger.configure(Object.fromEntries(Array.from({ length: 200 }, (_, index) => [index.toString(16).padStart(64, '0'), { key: `opaque-key-${index}` }])), async () => {});
  await assert.rejects(ledger.reserve('f'.repeat(64)), /quá nhiều yêu cầu/);
});
