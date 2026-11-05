import { Button, Icon } from "./ui";

export default function PageHeader({ onMenu, onSearch, onExport }: {
  onMenu: () => void;
  onSearch: () => void;
  onExport: () => void;
}) {
  return <header className="page-header">
    <div className="page-heading">
      <Button className="icon-button mobile-menu" aria-label="Mở menu điều hướng" onClick={onMenu}>
        <Icon name="menu" />
      </Button>
      <img className="header-logo" src="/brand/hcmute.png" alt="HCMUTE" />
      <div className="header-copy">
        <p className="header-greeting"><span>Hey,</span> <strong>ShipCODE</strong></p>
        <p className="header-subtitle">Quản lý nội dung và bản thu của bạn.</p>
      </div>
    </div>
    <div className="header-actions">
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
