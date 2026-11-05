import { useState, type CSSProperties, type SyntheticEvent } from "react";
import { navigation } from "../lib/data";
import type { Page } from "../lib/types";
import { Brand, Button, Glass, Icon } from "./ui";

const footer: typeof navigation = [
  { id: "help", title: "Hướng dẫn", icon: "help" },
  { id: "settings", title: "Cài đặt", icon: "settings" },
];

export default function Sidebar({ page, collapsed, count, onToggle, onNavigate, onSearch }: {
  page: Page;
  collapsed: boolean;
  count: number;
  onToggle: () => void;
  onNavigate: (page: Page) => void;
  onSearch: () => void;
}) {
  const [hint, setHint] = useState<{ text: string; top: number } | null>(null);
  const index = navigation.findIndex((item) => item.id === page);

  // Tooltip nằm ngoài phần cắt nội dung để không bị mép kính che mất.
  function showHint(event: SyntheticEvent<HTMLElement>) {
    if (!collapsed) return;
    const item = (event.target as Element).closest<HTMLElement>("[data-tooltip]");
    if (!item) { setHint(null); return; }
    const rect = item.getBoundingClientRect();
    const top = rect.top + rect.height / 2 - event.currentTarget.getBoundingClientRect().top;
    const text = item.dataset.tooltip!;
    setHint((old) => old?.text === text && old.top === top ? old : { text, top });
  }

  function link(item: (typeof navigation)[number]) {
    return <a key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`}
      href={`#${item.id}`} aria-label={item.title} data-tooltip={item.title}
      aria-current={page === item.id ? "page" : undefined}
      onClick={(event) => { event.preventDefault(); setHint(null); onNavigate(item.id); }}>
      <Icon name={item.icon} size={20} />
      <span className="nav-label">{item.title}</span>
      {item.id === "library" && count > 0 && <span className="nav-count">{count}</span>}
    </a>;
  }

  return <aside id="main-sidebar" className="sidebar" aria-label="Điều hướng chính"
    onPointerOver={showHint} onFocusCapture={showHint}
    onPointerLeave={() => setHint(null)} onBlurCapture={() => setHint(null)}>
    <Button className="sidebar-toggle" aria-label={collapsed ? "Hiện thanh bên" : "Thu gọn thanh bên"}
      aria-expanded={!collapsed} aria-controls="main-sidebar"
      onClick={() => { setHint(null); onToggle(); }}>
      <Icon name="chevron" size={13} />
    </Button>
    <div className="sidebar-content">
      <div className="sidebar-brand">
        <Brand />
        <span className="product-name">TTS Studio</span>
      </div>
      <Button className="sidebar-search" aria-label="Tìm kiếm" data-tooltip="Tìm kiếm"
        aria-keyshortcuts="Control+K Meta+K" onClick={() => { setHint(null); onSearch(); }}>
        <Icon name="search" size={20} />
        <span className="nav-label">Tìm kiếm…</span>
        <kbd className="nav-label">{/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘ K" : "Ctrl K"}</kbd>
      </Button>
      <nav aria-label="Công cụ" style={{ "--nav-index": Math.max(0, index) } as CSSProperties}>
        <Glass className={`nav-selection ${index < 0 ? "hidden" : ""}`} aria-hidden="true" />
        {navigation.map(link)}
      </nav>
      <nav className="sidebar-bottom" aria-label="Trợ giúp và tùy chọn">{footer.map(link)}</nav>
    </div>
    {collapsed && hint && <span className="sidebar-tooltip" role="tooltip" style={{ top: hint.top }}>{hint.text}</span>}
  </aside>;
}
