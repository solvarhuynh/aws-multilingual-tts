import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { base64Bytes, checkedText, extractDocument, MAX_FILE_BYTES } from '../src/lib/document';

test('Đọc TXT tiếng Việt có BOM và xuống dòng', () => {
  const text = '\uFEFFXin chào HCMUTE.\nMột ngày mới.';
  assert.equal(extractDocument(strToU8(text), 'bai-hoc.TXT'), text.slice(1));
  assert.equal(new TextDecoder().decode(base64Bytes(Buffer.from('Xin chào 🌍').toString('base64'))), 'Xin chào 🌍');
});
test('Đọc DOCX với đoạn, tab và các ký tự XML', () => {
  const bytes = zipSync({ 'word/document.xml': strToU8('<w:document><w:p><w:r><w:t>Xin chào &amp; AWS</w:t></w:r></w:p><w:p><w:r><w:t>Bài</w:t><w:tab/><w:t>học</w:t></w:r></w:p></w:document>') });
  assert.equal(extractDocument(bytes, 'sample.docx'), 'Xin chào & AWS\nBài\thọc');
});
test('Từ chối tài liệu hỏng, trống, sai loại và vượt giới hạn', () => {
  assert.throws(() => extractDocument(strToU8('not a zip'), 'broken.docx'), /bị lỗi/);
  assert.throws(() => extractDocument(zipSync({ 'nothing.xml': strToU8('test') }), 'empty.docx'), /Không tìm/);
  assert.throws(() => extractDocument(strToU8('abc'), 'old.doc'), /PDF, DOCX/);
  assert.throws(() => extractDocument(new Uint8Array(MAX_FILE_BYTES + 1), 'large.txt'), /10 MB/);
  assert.throws(() => checkedText('  '), /không có văn bản/);
  assert.throws(() => checkedText('x'.repeat(20001)), /20.000/);
});
