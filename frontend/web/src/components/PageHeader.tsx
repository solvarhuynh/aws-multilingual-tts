import { useEffect, useState } from "react";
import { Button, Icon } from "./ui";

export default function PageHeader({ title, onMenu, onSearch, onExport }: {
  title: string;
  onMenu: () => void;
  onSearch: () => void;
  onExport: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return <header className="page-header">
    <div className="page-heading">
      <Button className="icon-button mobile-menu" aria-label="Mở menu điều hướng" onClick={onMenu}>
        <Icon name="menu" />
      </Button>
      <img className="header-logo" src="/brand/hcmute.png" alt="HCMUTE" />
      <div className="header-copy">
        <p className="header-greeting"><span>Hey,</span> <strong>ShipCODE</strong></p>
        <h1>{title}</h1>
      </div>
    </div>
    <div className="header-actions">
      <time className="header-date" dateTime={now.toISOString()}>
        <small>Hôm nay</small>
        {now.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
      </time>
      <Button className="header-search" aria-label="Tìm kiếm" aria-keyshortcuts="Control+K Meta+K" onClick={onSearch}>
        <span>Tìm công cụ hoặc bản thu…</span>
        <kbd>{/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘ K" : "Ctrl K"}</kbd>
        <Icon name="search" size={28} />
      </Button>
      <Button className="secondary-button header-utility" aria-label="Xuất báo cáo" onClick={onExport} title="Xuất các bản thu đã tải ra CSV">
        <Icon name="download" size={17} /><span>Xuất báo cáo</span>
      </Button>
      <span className="header-avatar" aria-hidden="true">SC</span>
    </div>
  </header>;
}
