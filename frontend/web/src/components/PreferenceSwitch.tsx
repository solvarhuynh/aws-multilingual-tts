import { useRef, useState, type CSSProperties } from "react";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export default function PreferenceSwitch({ checked, onChange, label, descriptionId }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  descriptionId: string;
}) {
  const [position, setPosition] = useState<number | null>(null);
  const gesture = useRef<{ id: number; x: number; from: number; travel: number; moved: boolean } | null>(null);
  const ignoreClick = useRef(false);
  function cancel() {
    if (!gesture.current) return;
    gesture.current = null;
    ignoreClick.current = true;
    setPosition(null);
  }
  return <button type="button" role="switch" className="preference-switch"
    aria-checked={checked} aria-label={label} aria-describedby={descriptionId}
    data-dragging={position !== null ? "" : undefined}
    style={{ "--switch-position": position ?? Number(checked) } as CSSProperties}
    onPointerDown={(event) => {
      if (gesture.current || !event.isPrimary || event.button !== 0) return;
      ignoreClick.current = false;
      gesture.current = { id: event.pointerId, x: event.clientX, from: Number(checked),
        travel: Math.max(1, event.currentTarget.clientWidth - event.currentTarget.clientHeight), moved: false };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }}
    onPointerMove={(event) => {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId) return;
      const delta = event.clientX - start.x;
      if (!start.moved && Math.abs(delta) < 4) return;
      start.moved = true;
      setPosition(clamp(start.from + delta / start.travel));
    }}
    onPointerUp={(event) => {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId) return;
      gesture.current = null;
      ignoreClick.current = start.moved;
      setPosition(null);
      if (start.moved) {
        const next = clamp(start.from + (event.clientX - start.x) / start.travel) > .5;
        if (next !== checked) onChange(next);
      }
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}
    onClick={(event) => {
      // Sau khi kéo, trình duyệt có thể phát thêm click: không đổi trạng thái lần hai.
      if (ignoreClick.current && event.detail > 0) { ignoreClick.current = false; return; }
      ignoreClick.current = false;
      onChange(!checked);
    }}
    onKeyDown={(event) => {
      if (event.key === " " || event.key === "Enter") ignoreClick.current = false;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const next = event.key === "ArrowRight";
      if (next !== checked) onChange(next);
    }}
  ><span className="preference-switch-thumb" aria-hidden="true" /></button>;
}
