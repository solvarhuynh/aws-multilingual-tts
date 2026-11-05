import { Button, Modal } from "./ui";
import type { TextCorrection } from "../lib/types";

export default function CorrectionReview({ correction, onChoose, onClose }: {
  correction: TextCorrection;
  onChoose: (corrected: boolean) => void;
  onClose: () => void;
}) {
  let end = 0;
  const pieces = [...correction.changes].sort((a, b) => a.start - b.start).flatMap((change, index) => {
    if (change.start < end || change.end > correction.correctedText.length) return [];
    const before = correction.correctedText.slice(end, change.start);
    end = change.end;
    return [before, <mark key={index}>{correction.correctedText.slice(change.start, change.end)}</mark>];
  });
  return <Modal title="Kiểm tra nội dung" onClose={onClose} className="correction-modal">
    <p className="modal-description">Có gợi ý sửa lỗi đánh máy. Chọn nội dung bạn muốn đọc.</p>
    <div className="correction-grid">
      <section><h3>Bản gốc</h3><div className="correction-text">{correction.originalText}</div></section>
      <section><h3>Bản đề xuất</h3><div className="correction-text">{pieces}{correction.correctedText.slice(end)}</div></section>
    </div>
    <div className="modal-actions">
      <Button className="secondary-button" onClick={() => onChoose(false)}>Giữ bản gốc</Button>
      <Button className="primary-button" onClick={() => onChoose(true)}>Dùng bản sửa</Button>
    </div>
  </Modal>;
}
