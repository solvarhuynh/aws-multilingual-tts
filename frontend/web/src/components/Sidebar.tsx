import { useState, type CSSProperties, type SyntheticEvent } from "react";
import { navigation } from "../lib/data";
import type { Page } from "../lib/types";
import { Brand, Button, Icon } from "./ui";

const footer: typeof navigation = [
  { id: "help", title: "Hướng dẫn", icon: "help" },
  { id: "settings", title: "Cài đặt", icon: "settings" },
];

export default function Sidebar({ page, collapsed, count, onToggle, onNavigate, drawer = false }: {
  page: Page;
  collapsed: boolean;
  count: number;
  onToggle: () => void;
  onNavigate: (page: Page) => void;
  drawer?: boolean;
}) {
  const [hint, setHint] = useState<{ text: string; top: number } | null>(null);
  const index = navigation.findIndex((item) => item.id === page);

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

  const sidebarId = drawer ? "drawer-sidebar" : "main-sidebar";
  return <aside id={sidebarId} className={`sidebar ${drawer ? "drawer-sidebar" : ""}`} aria-label="Điều hướng chính"
    onPointerOver={showHint} onFocusCapture={showHint}
    onPointerLeave={() => setHint(null)} onBlurCapture={() => setHint(null)}>
    <div className="sidebar-glass" aria-hidden="true" />
    <Button className={drawer ? "icon-button drawer-close" : "sidebar-toggle"} aria-label={drawer ? "Đóng menu điều hướng" : collapsed ? "Hiện thanh bên" : "Thu gọn thanh bên"}
      aria-expanded={drawer ? undefined : !collapsed} aria-controls={sidebarId}
      onClick={() => { setHint(null); onToggle(); }}>
      <Icon name={drawer ? "close" : "chevron"} size={drawer ? 19 : 13} />
    </Button>
    <div className="sidebar-content">
      <div className="sidebar-brand">
        <Brand />
        <span className="product-name">TTS Studio</span>
      </div>
      <nav aria-label="Công cụ" style={{ "--nav-index": Math.max(0, index) } as CSSProperties}>
        <div className={`nav-selection ${index < 0 ? "hidden" : ""}`} aria-hidden="true" />
        {navigation.map(link)}
      </nav>
      <nav className="sidebar-bottom" aria-label="Trợ giúp và tùy chọn"
        style={{ "--nav-index": Math.max(0, footer.findIndex((item) => item.id === page)) } as CSSProperties}>
        <div className={`nav-selection ${footer.some((item) => item.id === page) ? "" : "hidden"}`} aria-hidden="true" />
        {footer.map(link)}
      </nav>
    </div>
    {collapsed && hint && <span className="sidebar-tooltip" role="tooltip" style={{ top: hint.top }}>{hint.text}</span>}
  </aside>;
}
