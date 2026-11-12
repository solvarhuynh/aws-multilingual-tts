import { useEffect, useState } from 'react';
import { Button, Modal } from './ui';
import { checkedDocument, MAX_DOCUMENT_CHARS } from '../../../shared/documents';

export default function DocumentReview({ text, file, warning, onAccept, onClose }: {
  text: string; file: File; warning: string; onAccept(text: string): void; onClose(): void;
}) {
  const [content, setContent] = useState(text);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) return;
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <Modal title="Kiểm tra tài liệu" onClose={onClose} className="document-review-modal">
    <p className="modal-description">{file.name} · Đối chiếu tên riêng, số và dấu trước khi dùng.</p>
    {warning && <p role="status" className="document-warning">{warning}</p>}
    <div className={`document-review-grid ${preview ? 'with-preview' : ''}`}>
      {preview && <img src={preview} alt="Ảnh tài liệu gốc để đối chiếu" />}
      <textarea aria-label="Nội dung tài liệu đã nhận dạng" value={content} onChange={event => setContent(event.target.value)} maxLength={MAX_DOCUMENT_CHARS} />
    </div>
    {error && <p role="alert" className="document-warning">{error}</p>}
    <div className="modal-actions"><Button className="secondary-button" onClick={onClose}>Hủy</Button>
      <Button className="primary-button" disabled={!content.trim()} onClick={() => {
        try { onAccept(checkedDocument(content)); } catch (reason) { setError((reason as Error).message); }
      }}>Dùng nội dung</Button></div>
  </Modal>;
}
