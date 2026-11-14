import { useState } from "react";
import { Button, Modal } from "./ui";
import { MAX_CHARS } from "../lib/data";
import type { TextCorrection } from "../lib/types";

export default function CorrectionReview({ correction, onChoose, onClose, translation = false }: {
  correction: TextCorrection;
  onChoose: (text: string) => void;
  onClose: () => void;
  translation?: boolean;
}) {
  const [edited, setEdited] = useState(correction.correctedText);
  let end = 0;
  const pieces = [...correction.changes].sort((a, b) => a.start - b.start).flatMap((change, index) => {
    if (change.start < end || change.end > correction.correctedText.length) return [];
    const before = correction.correctedText.slice(end, change.start);
    end = change.end;
    return [before, <mark key={index}>{correction.correctedText.slice(change.start, change.end)}</mark>];
  });
  return <Modal title={translation ? "Duyệt bản dịch" : "Kiểm tra nội dung"} onClose={onClose} className="correction-modal">
    {translation && <p className="modal-description">Đọc và chỉnh bản dịch trước khi tạo giọng.</p>}
    <div className="correction-grid">
      <section><h3>Bản gốc</h3><div className="correction-text">{correction.originalText}</div></section>
      <section><h3>{translation ? "Bản dịch Azure" : "Bản đề xuất"}</h3><div className="correction-text">{pieces}{correction.correctedText.slice(end)}</div></section>
    </div>
    <label htmlFor="review-edit">Chỉnh nội dung sẽ đọc</label>
    <textarea id="review-edit" value={edited} onChange={(event) => setEdited(event.target.value)} maxLength={MAX_CHARS} rows={5} />
    <div className="modal-actions">
      {!translation && <Button className="secondary-button" onClick={() => onChoose(correction.originalText)}>Giữ bản gốc</Button>}
      <Button className={translation ? "secondary-button" : "primary-button"} onClick={() => onChoose(correction.correctedText)}>{translation ? "Dùng bản dịch" : "Dùng bản sửa"}</Button>
      <Button className={translation ? "primary-button" : "secondary-button"} disabled={!edited.trim()} onClick={() => onChoose(edited)}>{translation ? "Xác nhận nội dung" : "Dùng bản tự chỉnh"}</Button>
    </div>
  </Modal>;
}
