import {
  Slider as LiquidSlider,
  type SliderProps,
} from "glisse";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useId,
  type CSSProperties,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import PreferenceSwitch from "./PreferenceSwitch";
import Arrow2Circlepath from "framework7-icons/react/esm/Arrow2Circlepath.js";
import ArrowCounterclockwise from "framework7-icons/react/esm/ArrowCounterclockwise.js";
import ArrowDownToLine from "framework7-icons/react/esm/ArrowDownToLine.js";
import ArrowRight from "framework7-icons/react/esm/ArrowRight.js";
import BackwardEndFill from "framework7-icons/react/esm/BackwardEndFill.js";
import BookFill from "framework7-icons/react/esm/BookFill.js";
import Checkmark from "framework7-icons/react/esm/Checkmark.js";
import ChevronDown from "framework7-icons/react/esm/ChevronDown.js";
import Clock from "framework7-icons/react/esm/Clock.js";
import DocText from "framework7-icons/react/esm/DocText.js";
import ExclamationmarkTriangleFill from "framework7-icons/react/esm/ExclamationmarkTriangleFill.js";
import ForwardEndFill from "framework7-icons/react/esm/ForwardEndFill.js";
import GearAltFill from "framework7-icons/react/esm/GearAltFill.js";
import Headphones from "framework7-icons/react/esm/Headphones.js";
import LayersAltFill from "framework7-icons/react/esm/LayersAltFill.js";
import LineHorizontal3 from "framework7-icons/react/esm/LineHorizontal3.js";
import MicFill from "framework7-icons/react/esm/MicFill.js";
import MusicNoteList from "framework7-icons/react/esm/MusicNoteList.js";
import PauseFill from "framework7-icons/react/esm/PauseFill.js";
import PlayFill from "framework7-icons/react/esm/PlayFill.js";
import Plus from "framework7-icons/react/esm/Plus.js";
import QuestionCircle from "framework7-icons/react/esm/QuestionCircle.js";
import Repeat from "framework7-icons/react/esm/Repeat.js";
import Search from "framework7-icons/react/esm/Search.js";
import Speaker2Fill from "framework7-icons/react/esm/Speaker2Fill.js";
import SpeakerSlashFill from "framework7-icons/react/esm/SpeakerSlashFill.js";
import SquareArrowUp from "framework7-icons/react/esm/SquareArrowUp.js";
import SquareGrid2x2Fill from "framework7-icons/react/esm/SquareGrid2x2Fill.js";
import TextBubbleFill from "framework7-icons/react/esm/TextBubbleFill.js";
import Trash from "framework7-icons/react/esm/Trash.js";
import Waveform from "framework7-icons/react/esm/Waveform.js";
import Xmark from "framework7-icons/react/esm/Xmark.js";
import CloudFill from "framework7-icons/react/esm/CloudFill.js";

const icons: Record<string, typeof Waveform> = {
  dashboard: SquareGrid2x2Fill,
  translate: TextBubbleFill,
  book: BookFill,
  wave: Waveform,
  arrow: ArrowRight,
  check: Checkmark,
  chevron: ChevronDown,
  help: QuestionCircle,
  clock: Clock,
  download: ArrowDownToLine,
  file: DocText,
  headphones: Headphones,
  layers: LayersAltFill,
  menu: LineHorizontal3,
  mic: MicFill,
  pause: PauseFill,
  play: PlayFill,
  plus: Plus,
  reset: ArrowCounterclockwise,
  previous: BackwardEndFill,
  next: ForwardEndFill,
  repeat: Repeat,
  queue: MusicNoteList,
  search: Search,
  settings: GearAltFill,
  trash: Trash,
  alert: ExclamationmarkTriangleFill,
  upload: SquareArrowUp,
  volume: Speaker2Fill,
  muted: SpeakerSlashFill,
  close: Xmark,
  loading: Arrow2Circlepath,
  cloud: CloudFill,
};

// Mặc định không gửi form; hình thức nút được quản lý bằng CSS.
export function Button({ type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} {...props} />;
}

const StableSlider = memo(LiquidSlider);
export function Slider({ onValueChange, ...props }: SliderProps) {
  const handler = useRef(onValueChange);
  handler.current = onValueChange;
  const update = useCallback((value: number) => handler.current?.(value), []);
  return <StableSlider {...props} onValueChange={update} />;
}

export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Component = icons[name] || Waveform;
  return (
    <Component
      width={size}
      height={size}
      focusable="false"
      style={{ width: size, height: size }}
      className={className}
      aria-hidden="true"
    />
  );
}
export function Spinner() {
  return <Icon name="loading" size={17} className="spinner" />;
}
export function Brand() {
  return <span className="brand-logo"><img src="/brand/aws.webp" alt="AWS" />
    <span className="brand-word" aria-hidden="true"><img src="/brand/aws.webp" alt="" /></span></span>;
}
export function ToolArt() {
  const artRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const art = artRef.current;
    if (!art) return;
    let visible = false;
    const update = () => {
      art.dataset.moving = String(visible && !document.hidden);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.15;
        update();
      },
      { threshold: 0.15 },
    );
    observer.observe(art);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <div ref={artRef} className="tool-art art-studio" data-moving="false" aria-hidden="true">
      <div className="art-object">
        <div className="glass-wave">
          {[28, 49, 73, 94, 77, 53, 32].map((height, index) => (
            <i key={index} style={{ "--bar-height": `${height}%`, "--bar-index": index } as CSSProperties} />
          ))}
        </div>
      </div>
    </div>
  );
}
export function VoiceAvatar({ id, large = false }: { id: string; large?: boolean }) {
  return (
    <span className={`voice-avatar ${large ? "large" : ""}`} aria-hidden="true">
      {id.trim().charAt(0).toLocaleUpperCase() || "V"}
    </span>
  );
}
export function EmptyState({
  icon = "headphones",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={25} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  className = "",
  dismissible = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const modal = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal?.showModal();
    return () => {
      modal?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={title}
      onCancel={(event) => { event.preventDefault(); if (dismissible) onClose(); }}
      onClick={(e) => {
        if (!dismissible || e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <Button className="icon-button" aria-label="Đóng cửa sổ" disabled={!dismissible} onClick={onClose}>
          <Icon name="close" size={19} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const descriptionId = useId();
  return (
    <div className="preference-row">
      <span>
        <strong>{label}</strong>
        <small id={descriptionId}>{description}</small>
      </span>
      <PreferenceSwitch label={label} descriptionId={descriptionId} checked={checked} onChange={onChange} />
    </div>
  );
}
