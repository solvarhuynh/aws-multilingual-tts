import {
  Button as LiquidButton,
  Glass as LiquidGlass,
  Slider as LiquidSlider,
  Switch,
  type ButtonProps,
  type SliderProps,
} from "glisse";
import {
  isValidElement,
  memo,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AudioLines,
  ArrowLeftRight,
  BookOpen,
  LayoutDashboard,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  FileText,
  Headphones,
  Layers3,
  LoaderCircle,
  Menu,
  Mic2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  Repeat2,
  ListMusic,
  Search,
  Settings2,
  Trash2,
  TriangleAlert,
  Upload,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  translate: ArrowLeftRight,
  book: BookOpen,
  wave: AudioLines,
  arrow: ArrowRight,
  check: Check,
  chevron: ChevronDown,
  help: CircleHelp,
  clock: Clock3,
  download: Download,
  file: FileText,
  headphones: Headphones,
  layers: Layers3,
  menu: Menu,
  mic: Mic2,
  pause: Pause,
  play: Play,
  plus: Plus,
  reset: RotateCcw,
  previous: SkipBack,
  next: SkipForward,
  repeat: Repeat2,
  queue: ListMusic,
  search: Search,
  settings: Settings2,
  trash: Trash2,
  alert: TriangleAlert,
  upload: Upload,
  volume: Volume2,
  muted: VolumeX,
  close: X,
};
const StableLiquidButton = memo(LiquidButton);
export const Glass = memo(LiquidGlass);

function sameContent(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true;
  if (Array.isArray(first) && Array.isArray(second))
    return first.length === second.length && first.every((value, i) => sameContent(value, second[i]));
  if (!isValidElement<Record<string, unknown>>(first) || !isValidElement<Record<string, unknown>>(second))
    return false;
  if (first.type !== second.type || first.key !== second.key) return false;
  const keys = Object.keys(first.props);
  return (
    keys.length === Object.keys(second.props).length &&
    keys.every((key) =>
      key === "children"
        ? sameContent(first.props[key], second.props[key])
        : Object.is(first.props[key], second.props[key]),
    )
  );
}

// Chỉ nút trong suốt cần khúc xạ; nút màu đặc dùng CSS để tránh chồng viền.
export function Button({
  className = "",
  variant,
  children,
  icon,
  onClick,
  type = "button",
  destructive,
  tint,
  ...props
}: ButtonProps) {
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const handleClick = useCallback<NonNullable<ButtonProps["onClick"]>>(
    (event) => clickRef.current?.(event),
    [],
  );
  const content = useRef(children);
  if (!sameContent(content.current, children)) content.current = children;
  const glass = /(?:^|\s)(secondary-button|speaker-chip|header-search)(?:\s|$)/.test(className);
  if (!glass)
    return (
      <button {...props} type={type} className={className} onClick={onClick}>
        {icon}
        {children}
      </button>
    );
  return (
    <StableLiquidButton
      {...props}
      type={type}
      className={className}
      variant={variant || "glass"}
      destructive={destructive || className.includes("destructive")}
      tint={tint}
      icon={icon}
      onClick={onClick ? handleClick : undefined}
    >
      {content.current}
    </StableLiquidButton>
  );
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
  const Component = icons[name] || AudioLines;
  return (
    <Component
      size={size}
      strokeWidth={1.7}
      style={{ width: size, height: size }}
      className={className}
      aria-hidden="true"
    />
  );
}
export function Spinner() {
  return <LoaderCircle size={17} className="spinner" aria-hidden="true" />;
}
export function Brand() {
  return (
    <div className="brand-lockup" aria-label="HCMUTE | AWS">
      <img className="hcmute-logo" src="/brand/hcmute.png" alt="HCMUTE" />
      <span aria-hidden="true">|</span>
      <img className="aws-logo" src="/brand/aws.webp" alt="AWS" />
    </div>
  );
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
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
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
      onCancel={onClose}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <Button className="icon-button" aria-label="Đóng cửa sổ" onClick={onClose}>
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
  return (
    <div className="preference-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
