import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO } from "./lib/api";
import AudioPlayer from "./components/AudioPlayer";
import {
  Button,
  Brand,
  EmptyState,
  Icon,
  Modal,
  Spinner,
  Slider,
  Toggle,
  VoiceAvatar,
  ToolArt,
} from "./components/ui";
import {
  estimateDuration,
  formatNumber,
  formatTime,
  languageNames,
  MAX_CHARS,
  navigation,
  readStored,
  shortDate,
  storeValue,
  starterPresets,
  samples,
} from "./lib/data";
import { useStudio } from "./hooks/useStudio";
import Dashboard from "./views/Dashboard";
import type { HistoryItem, Page, Preferences } from "./lib/types";

type Dialog = "voices" | "search" | "menu" | null;
const pages = [
  ...navigation,
  { id: "settings" as Page, title: "Cài đặt", icon: "settings" },
  { id: "help" as Page, title: "Hướng dẫn sử dụng", icon: "help" },
];
const validPages = pages.map((item) => item.id);
const currentPage = (): Page =>
  validPages.includes(location.hash.slice(1) as Page) ? (location.hash.slice(1) as Page) : "studio";
function getPreferences(): Preferences {
  const value = readStored<Partial<Preferences> | null>("voxa.preferences.v1", null);
  return {
    reducedMotion: value?.reducedMotion === true,
    highContrast: value?.highContrast === true,
    volume:
      typeof value?.volume === "number" && Number.isFinite(value.volume)
        ? Math.max(0, Math.min(1, value.volume))
        : 0.8,
  };
}

export default function App() {
  const [page, setPage] = useState<Page>(currentPage);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [query, setQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [preferences, setPreferences] = useState(getPreferences);
  const [deleteItem, setDeleteItem] = useState<HistoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteLock = useRef(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const notify = useCallback((text: string, error = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), 5500);
  }, []);
  const [target, setTarget] = useState("en-US");
  const isStudio = ["studio", "translation", "documents"].includes(page);
  const studio = useStudio(notify, page === "translation" ? target : null);
  useEffect(() => {
    if (studio.languages.length)
      setTarget((previous) =>
        studio.languages.some((l) => l.lang === previous && l.voices.length)
          ? previous
          : studio.languages.find((l) => l.voices.length)?.lang || previous,
      );
  }, [studio.languages]);
  const closeDialog = () => {
    setDialog(null);
    setQuery("");
    setLanguageFilter("all");
  };
  const openDialog = (value: Dialog) => {
    setDialog(value);
    setQuery("");
    setLanguageFilter("all");
  };
  const navigate = useCallback((destination: Page) => {
    location.hash = destination;
    setPage(destination);
    setDialog(null);
    setQuery("");
    setLanguageFilter("all");
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  useEffect(() => {
    const change = () => {
      setPage(currentPage());
      setDialog(null);
      setQuery("");
      setLanguageFilter("all");
    };
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDialog((value) => (value === "search" ? null : "search"));
        setQuery("");
      }
    };
    window.addEventListener("hashchange", change);
    window.addEventListener("keydown", shortcut);
    return () => {
      window.removeEventListener("hashchange", change);
      window.removeEventListener("keydown", shortcut);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    document.title = `${navigation.find((n) => n.id === page)?.title || (page === "settings" ? "Cài đặt" : "Hướng dẫn")} · HCMUTE | AWS`;
  }, [page]);
  useEffect(() => {
    storeValue("voxa.preferences.v1", preferences);
    document.documentElement.dataset.motion = preferences.reducedMotion ? "reduced" : "auto";
    document.documentElement.dataset.contrast = preferences.highContrast ? "high" : "normal";
  }, [preferences]);

  const visibleVoices = studio.languages
    .flatMap((l) => l.voices.map((v) => ({ ...v, lang: l.lang, provider: l.provider })))
    .filter(
      (v) =>
        (languageFilter === "all" || v.lang === languageFilter) &&
        `${v.id} ${languageNames[v.lang] || v.lang}`
          .toLocaleLowerCase("vi")
          .includes(query.toLocaleLowerCase("vi")),
    );
  const visibleHistory = studio.history.filter(
    (item) =>
      (languageFilter === "all" || item.lang === languageFilter) &&
      `${item.text} ${item.voice}`.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")),
  );
  const selectedVoice = studio.language?.voices.find((v) => v.id === studio.voice);
  const progress =
    studio.job?.progress && studio.job.progress.total > 0
      ? Math.min(100, Math.round((studio.job.progress.done / studio.job.progress.total) * 100))
      : 0;
  const title =
    navigation.find((n) => n.id === page)?.title || (page === "settings" ? "Cài đặt" : "Hướng dẫn sử dụng");
  const matchingNavigation = pages.filter((n) =>
    n.title.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")),
  );
  const matchingRecords = query
    ? studio.history
        .filter((i) => i.text.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")))
        .slice(0, 5)
    : [];

  function selectVoice(lang: string, id: string) {
    if (page === "translation") {
      setTarget(lang);
      studio.setVoice(id);
      closeDialog();
    } else {
      studio.chooseVoice(lang, id);
      navigate("studio");
    }
  }
  async function confirmDelete() {
    if (!deleteItem || deleteLock.current) return;
    deleteLock.current = true;
    setDeleting(true);
    try {
      await studio.deleteRecording(deleteItem);
      setDeleteItem(null);
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      deleteLock.current = false;
      setDeleting(false);
    }
  }

  function renderPreferences() {
    return (
      <div className="preferences-content">
        <Toggle
          label="Giảm chuyển động"
          description="Tắt hiệu ứng chuyển động."
          checked={preferences.reducedMotion}
          onChange={(value) => setPreferences((p) => ({ ...p, reducedMotion: value }))}
        />
        <Toggle
          label="Tăng độ tương phản"
          description="Làm chữ và đường viền rõ hơn."
          checked={preferences.highContrast}
          onChange={(value) => setPreferences((p) => ({ ...p, highContrast: value }))}
        />
        <label className="volume-setting">
          <span>Âm lượng</span>
          <Slider
            aria-label="Âm lượng mặc định"
            min={0}
            max={1}
            step={0.05}
            value={preferences.volume}
            onValueChange={(volume) => setPreferences((p) => ({ ...p, volume }))}
          />
          <output>{Math.round(preferences.volume * 100)}%</output>
        </label>
      </div>
    );
  }
  function renderHelp() {
    return (
      <div className="help-content">
        <ol>
          <li>Nhập văn bản hoặc chọn tệp PDF, DOCX, TXT, Markdown.</li>
          <li>Chọn ngôn ngữ, giọng đọc và tốc độ.</li>
          <li>
            Nhấn <strong>Tạo giọng đọc</strong>, sau đó phát để nghe.
          </li>
        </ol>
        <p>Tối đa 20.000 ký tự; tệp tối đa 10 MB.</p>
        <div className="help-note">
          {DEMO
            ? "Bản nghe thử dùng giọng có trên máy. Lịch sử được lưu trong trình duyệt; chưa có tệp MP3."
            : "Giọng đọc và bản thu được lưu trên máy chủ."}
        </div>
      </div>
    );
  }

  function renderVoiceBrowser(inDialog = false) {
    return (
      <div className={inDialog ? "voice-browser in-dialog" : "voice-browser"}>
        <div className="browser-toolbar">
          <label className="search-field">
            <Icon name="search" size={17} />
            <input
              autoFocus={inDialog}
              aria-label="Tìm giọng đọc"
              placeholder="Tìm giọng đọc…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Lọc ngôn ngữ giọng đọc"
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
          >
            <option value="all">Tất cả ngôn ngữ</option>
            {studio.languages.map((l) => (
              <option key={l.lang} value={l.lang}>
                {languageNames[l.lang] || l.lang}
              </option>
            ))}
          </select>
        </div>
        {studio.voiceError ? (
          <div className="inline-error" role="alert">
            <p>{studio.voiceError}</p>
            <Button className="text-button" onClick={() => void studio.loadVoices()}>
              Thử lại
            </Button>
          </div>
        ) : studio.loadingVoices ? (
          <div className="loading-state">
            <Spinner />
            Đang tải giọng đọc…
          </div>
        ) : visibleVoices.length ? (
          <div className="voice-grid">
            {visibleVoices.map((v) => (
              <article
                className={`voice-card ${studio.lang === v.lang && studio.voice === v.id ? "selected" : ""}`}
                key={`${v.lang}-${v.id}`}
              >
                <div className="voice-card-top">
                  <VoiceAvatar id={v.id} large />
                  {studio.lang === v.lang && studio.voice === v.id && (
                    <span className="selected-label">
                      <Icon name="check" size={12} />
                      Đang chọn
                    </span>
                  )}
                </div>
                <h2>{v.id.replace(" (demo)", "")}</h2>
                <p>
                  {languageNames[v.lang] || v.lang}
                  <span>·</span>
                  {v.gender === "F" ? "Nữ" : v.gender === "M" ? "Nam" : "Giọng đọc"}
                </p>
                <div className="voice-card-bottom">
                  <small>
                    {DEMO ? "Giọng minh họa" : v.provider === "polly" ? "Amazon Polly" : "Tiếng Việt"}
                  </small>
                  <Button
                    className="secondary-button"
                    disabled={studio.busy}
                    onClick={() => selectVoice(v.lang, v.id)}
                  >
                    Sử dụng
                    <Icon name="arrow" size={14} />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="search"
            title="Không tìm thấy giọng đọc"
            description="Thử tên khác hoặc đổi ngôn ngữ."
          />
        )}
      </div>
    );
  }

  return (
    <>
      <a
        className="skip-link"
        href="#editor"
        onClick={(e) => {
          e.preventDefault();
          if (page !== "studio") navigate("studio");
          window.setTimeout(() => studio.editorRef.current?.focus(), 0);
        }}
      >
        Chuyển đến ô nhập văn bản
      </a>
      <div className="app-shell">
        <aside className="sidebar" aria-label="Điều hướng chính">
          <div className="sidebar-brand">
            <Brand />
            <span className="product-name">Chuyển văn bản thành giọng nói</span>
          </div>

          <nav
            aria-label="Công cụ"
            style={
              {
                "--nav-index": Math.max(
                  0,
                  navigation.findIndex((n) => n.id === page),
                ),
              } as React.CSSProperties
            }
          >
            <span
              className={`nav-selection ${navigation.some((n) => n.id === page) ? "" : "hidden"}`}
              aria-hidden="true"
            />
            {navigation.map((n) => (
              <a
                key={n.id}
                className={`nav-item ${page === n.id ? "active" : ""}`}
                href={`#${n.id}`}
                aria-current={page === n.id ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(n.id);
                }}
              >
                <Icon name={n.icon} size={19} />
                <span>{n.title}</span>
                {n.id === "library" && studio.history.length > 0 && (
                  <span className="nav-count">{studio.history.length}</span>
                )}
              </a>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <Button
              className={`nav-item ${page === "help" ? "active" : ""}`}
              onClick={() => navigate("help")}
            >
              <Icon name="help" size={19} />
              Hướng dẫn
            </Button>
            <Button
              className={`nav-item ${page === "settings" ? "active" : ""}`}
              onClick={() => navigate("settings")}
            >
              <Icon name="settings" size={19} />
              Cài đặt
            </Button>
          </div>
        </aside>
        <div className="workspace">
          <header className="page-header">
            <div className="page-heading">
              <Button
                className="icon-button mobile-menu"
                aria-label="Mở menu điều hướng"
                onClick={() => openDialog("menu")}
              >
                <Icon name="menu" />
              </Button>
              <h1>{title}</h1>
            </div>
            <Button className="header-search" aria-label="Tìm kiếm" onClick={() => openDialog("search")}>
              <Icon name="search" size={17} />
              <span>Tìm kiếm mọi thứ…</span>
            </Button>
          </header>
          <main id="main-content" key={page} className={`route-view ${isStudio ? "studio-route" : ""}`}>
            {page === "dashboard" && (
              <Dashboard
                history={studio.history}
                languages={studio.languages}
                navigate={navigate}
                openRecording={studio.openRecording}
              />
            )}
            {page === "settings" && (
              <div className="page-content settings-page">
                <section className="settings-card surface">
                  <h2>Giao diện & âm thanh</h2>
                  {renderPreferences()}
                </section>
                <section className="connection-card surface">
                  <h2>{DEMO ? "Nghe thử trên máy" : "Kết nối máy chủ"}</h2>
                  <p>
                    {DEMO
                      ? "Giọng đọc và lịch sử chạy trên thiết bị. Kết nối máy chủ để tạo MP3 và dịch tự động."
                      : "Giọng đọc, âm thanh và lịch sử được lấy từ dịch vụ của nhóm."}
                  </p>
                  <div>
                    <span>Lịch sử</span>
                    <strong>{DEMO ? "Trình duyệt này" : "Máy chủ"}</strong>
                  </div>
                  <div>
                    <span>Âm thanh</span>
                    <strong>{DEMO ? "Giọng thiết bị" : "File MP3"}</strong>
                  </div>
                </section>
              </div>
            )}
            {page === "help" && (
              <div className="page-content help-page">
                <section className="guide-card surface">
                  <h2>Cách sử dụng</h2>
                  {renderHelp()}
                </section>
                <section className="faq-card surface">
                  <h2>Câu hỏi thường gặp</h2>
                  {[
                    {
                      q: "Có thể đọc những loại tài liệu nào?",
                      a: "PDF có văn bản, Word DOCX, TXT và Markdown. Tối đa 10 MB và 20.000 ký tự. PDF scan cần nhận dạng chữ trước.",
                    },
                    {
                      q: "Làm sao để dịch và đọc?",
                      a: "Vào Dịch và đọc, nhập nội dung và chọn ngôn ngữ cần đọc. Tính năng này cần kết nối máy chủ.",
                    },
                    {
                      q: "Có đọc được văn bản dài không?",
                      a: "Nội dung dài được chia thành nhiều phần. Bạn có thể theo dõi tiến độ ngay trên trang.",
                    },
                    {
                      q: "Tại sao máy chưa đọc được tiếng Việt?",
                      a: "Máy cần có giọng tiếng Việt để nghe thử. Bạn có thể cài thêm giọng trong phần cài đặt của máy hoặc chọn tiếng Anh.",
                    },
                  ].map((item) => (
                    <details key={item.q}>
                      <summary>
                        {item.q}
                        <Icon name="plus" size={16} />
                      </summary>
                      <p>{item.a}</p>
                    </details>
                  ))}
                </section>
              </div>
            )}
            {isStudio && (
              <div className={`studio-layout mode-${page}`}>
                <section className="editor-panel" aria-label="Soạn thảo văn bản">
                  {page === "documents" && (
                    <Button
                      className="document-drop surface"
                      disabled={studio.busy || studio.readingFile}
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        void studio.importFile(event.dataTransfer.files[0]);
                      }}
                    >
                      <span className="document-drop-icon">
                        {studio.readingFile ? <Spinner /> : <Icon name="upload" size={25} />}
                      </span>
                      <span>
                        <strong>
                          {studio.readingFile
                            ? "Đang đọc tài liệu…"
                            : studio.fileName || "Thả tài liệu hoặc chọn tệp"}
                        </strong>
                        <small>PDF, DOCX, TXT, Markdown · Tối đa 10 MB</small>
                      </span>
                      <Icon name="plus" size={19} />
                    </Button>
                  )}
                  <form
                    className="composer surface"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void studio.generate();
                    }}
                    noValidate
                  >
                    <div className="editor-toolbar">
                      <Button
                        type="button"
                        className="speaker-chip"
                        disabled={studio.busy || studio.loadingVoices || !!studio.voiceError}
                        onClick={() => openDialog("voices")}
                      >
                        <VoiceAvatar id={studio.voice} />
                        <strong>{selectedVoice?.id.replace(" (demo)", "") || "Chọn giọng đọc"}</strong>
                        <Icon name="chevron" size={13} />
                      </Button>
                      <Button
                        className="text-button"
                        type="button"
                        disabled={studio.busy || studio.readingFile}
                        onClick={() => fileRef.current?.click()}
                      >
                        <Icon name="upload" size={15} />
                        {studio.readingFile ? "Đang nhập…" : "Nhập tệp"}
                      </Button>
                    </div>
                    {!studio.text && page === "studio" && (
                      <div className="editor-emblem">
                        <ToolArt />
                      </div>
                    )}
                    <label className="sr-only" htmlFor="editor">
                      Văn bản cần chuyển thành giọng nói
                    </label>
                    <textarea
                      ref={studio.editorRef}
                      id="editor"
                      placeholder="Nhập hoặc dán văn bản bạn muốn chuyển thành giọng nói…"
                      value={studio.text}
                      onChange={(e) => studio.updateText(e.target.value)}
                      readOnly={studio.busy || studio.readingFile}
                      maxLength={MAX_CHARS + 1}
                      spellCheck={false}
                      aria-invalid={!!studio.error}
                      aria-describedby="text-count form-error"
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                          e.preventDefault();
                          void studio.generate();
                        }
                      }}
                    />
                    {!studio.text && page === "studio" && (
                      <div className="starter-presets">
                        <span>Bắt đầu với</span>
                        <div>
                          {starterPresets.map((preset) => (
                            <Button
                              type="button"
                              key={preset.id}
                              disabled={studio.busy}
                              onClick={() => {
                                studio.updateText(
                                  preset.text[studio.lang as "vi-VN" | "en-US"] ||
                                    samples[studio.lang] ||
                                    samples["en-US"],
                                );
                                studio.editorRef.current?.focus();
                              }}
                            >
                              <Icon name={preset.icon} size={16} />
                              {preset.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="editor-status">
                      <span id="text-count" className={studio.text.length > MAX_CHARS ? "over-limit" : ""}>
                        {formatNumber(studio.text.length)}
                        <span> / {formatNumber(MAX_CHARS)} ký tự</span>
                      </span>
                      <div>
                        <span className="duration-estimate">
                          <Icon name="clock" size={14} />
                          {studio.text.trim()
                            ? `~${formatTime(estimateDuration(studio.text, studio.speed))}`
                            : "0:00"}
                        </span>
                        <Button
                          type="button"
                          className="icon-button"
                          aria-label="Xóa nội dung văn bản"
                          disabled={!studio.text || studio.busy}
                          onClick={() => {
                            studio.updateText("");
                            studio.editorRef.current?.focus();
                          }}
                        >
                          <Icon name="trash" size={15} />
                        </Button>
                      </div>
                    </div>
                  </form>
                  <div className="editor-footer">
                    <div className="editor-footer-tools">
                      {page !== "studio" && (
                        <Button
                          className="secondary-button sample-button"
                          disabled={studio.busy}
                          onClick={studio.useSample}
                        >
                          <Icon name="file" size={15} />
                          Văn bản mẫu
                        </Button>
                      )}
                      {studio.text && studio.draftSaved && (
                        <span className="draft-state">
                          <Icon name="check" size={12} />
                          Đã lưu nháp
                        </span>
                      )}
                    </div>
                    <div
                      id="form-error"
                      role={studio.error ? "alert" : undefined}
                      className={studio.error ? "form-error" : ""}
                    >
                      {studio.error && (
                        <>
                          <Icon name="alert" size={16} />
                          <span>{studio.error}</span>
                        </>
                      )}
                    </div>
                    {studio.busy && (
                      <div className="job-progress" role="status">
                        <div>
                          <Spinner />
                          <span>
                            {studio.job?.status === "PENDING" ? "Đang chuẩn bị…" : "Đang tạo giọng nói…"}
                          </span>
                          <strong>{progress}%</strong>
                        </div>
                        <progress aria-label="Tiến độ tạo giọng nói" value={progress} max={100} />
                      </div>
                    )}
                    <div className="generate-row">
                      <Button
                        className="primary-button generate-button"
                        disabled={
                          studio.busy ||
                          studio.readingFile ||
                          studio.loadingVoices ||
                          !!studio.voiceError ||
                          !studio.voice
                        }
                        onClick={() => void studio.generate()}
                      >
                        {studio.busy ? <Spinner /> : <Icon name="wave" size={17} />}
                        {studio.busy
                          ? "Đang tạo âm thanh…"
                          : page === "translation"
                            ? "Dịch và tạo giọng đọc"
                            : "Tạo giọng đọc"}
                      </Button>
                    </div>
                  </div>
                </section>
                <aside className="voice-settings surface" aria-label="Cài đặt giọng đọc">
                  <div className="settings-heading">
                    <h2>Cài đặt giọng</h2>
                  </div>
                  <div className="setting-field">
                    <label htmlFor="language">{page === "translation" ? "Ngôn ngữ gốc" : "Ngôn ngữ"}</label>
                    <div className="select-wrap">
                      <select
                        id="language"
                        value={studio.lang}
                        disabled={studio.busy || studio.loadingVoices}
                        onChange={(e) => studio.setLang(e.target.value)}
                      >
                        {studio.languages.map((l) => (
                          <option key={l.lang} value={l.lang}>
                            {languageNames[l.lang] || l.lang}
                          </option>
                        ))}
                      </select>
                      <Icon name="chevron" size={15} />
                    </div>
                  </div>
                  {page === "translation" && (
                    <div className="setting-field">
                      <label htmlFor="target-language">Dịch sang</label>
                      <div className="select-wrap">
                        <select
                          id="target-language"
                          value={target}
                          disabled={studio.busy || studio.loadingVoices}
                          onChange={(e) => setTarget(e.target.value)}
                        >
                          {studio.languages
                            .filter((l) => l.voices.length)
                            .map((l) => (
                              <option key={l.lang} value={l.lang}>
                                {languageNames[l.lang] || l.lang}
                              </option>
                            ))}
                        </select>
                        <Icon name="chevron" size={15} />
                      </div>
                    </div>
                  )}
                  <div className="setting-field">
                    <label id="selected-voice-label">Giọng đọc</label>
                    <Button
                      className="voice-select"
                      aria-labelledby="selected-voice-label selected-voice-value"
                      aria-haspopup="dialog"
                      disabled={studio.busy || studio.loadingVoices || !!studio.voiceError}
                      onClick={() => openDialog("voices")}
                    >
                      <VoiceAvatar id={studio.voice} />
                      <span id="selected-voice-value">
                        <strong>
                          {studio.loadingVoices
                            ? "Đang tải…"
                            : selectedVoice?.id.replace(" (demo)", "") || "Chưa có giọng"}
                        </strong>
                        <small>
                          {selectedVoice?.gender === "F" ? "Nữ" : selectedVoice?.gender === "M" ? "Nam" : ""}
                          {selectedVoice
                            ? ` · ${languageNames[studio.language?.lang || studio.lang] || studio.lang}`
                            : ""}
                        </small>
                      </span>
                      <Icon name="chevron" size={15} />
                    </Button>
                  </div>
                  {studio.voiceError && (
                    <div className="inline-error" role="alert">
                      <p>{studio.voiceError}</p>
                      <Button className="text-button" onClick={() => void studio.loadVoices()}>
                        Thử lại
                      </Button>
                    </div>
                  )}
                  <div className="setting-field">
                    <span className="field-label">Nguồn giọng đọc</span>
                    <div className="engine-label">
                      <Icon name="layers" size={17} />
                      <span>
                        {DEMO
                          ? "Giọng trên máy"
                          : studio.language?.provider === "polly"
                            ? "Amazon Polly"
                            : "Giọng tiếng Việt"}
                      </span>
                    </div>
                  </div>
                  <div className="setting-field speed-field">
                    <div className="field-heading">
                      <label htmlFor="speed">Tốc độ</label>
                      <output htmlFor="speed">{studio.speed.toFixed(1)}×</output>
                    </div>
                    <Slider
                      id="speed"
                      min={0.5}
                      max={2}
                      step={0.1}
                      disabled={studio.busy}
                      value={studio.speed}
                      onValueChange={studio.setSpeed}
                    />
                    <div className="range-labels">
                      <span>0.5×</span>
                      <span>2.0×</span>
                    </div>
                  </div>
                  <Button
                    className="reset-button"
                    disabled={studio.busy}
                    onClick={() => {
                      studio.setSpeed(1);
                      const initial =
                        studio.languages.find((l) => l.lang === "vi-VN" && l.voices.length) ||
                        studio.languages.find((l) => l.voices.length);
                      if (initial) studio.chooseVoice(initial.lang, initial.voices[0].id);
                    }}
                  >
                    <Icon name="reset" size={14} />
                    Đặt lại
                  </Button>
                  {DEMO && (
                    <p className="demo-note">
                      Nghe thử bằng giọng có sẵn trên máy. Tải MP3 cần kết nối máy chủ.
                    </p>
                  )}
                </aside>
              </div>
            )}
            {page === "voices" && renderVoiceBrowser()}
            {page === "library" && (
              <section className="history-panel" aria-label="Thư viện âm thanh">
                <div className="browser-toolbar">
                  <label className="search-field">
                    <Icon name="search" size={17} />
                    <input
                      aria-label="Tìm kiếm bản thu"
                      placeholder="Tìm bản thu…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Lọc ngôn ngữ bản thu"
                    value={languageFilter}
                    onChange={(e) => setLanguageFilter(e.target.value)}
                  >
                    <option value="all">Tất cả ngôn ngữ</option>
                    {Array.from(new Set(studio.history.map((i) => i.lang))).map((code) => (
                      <option key={code} value={code}>
                        {languageNames[code] || code}
                      </option>
                    ))}
                  </select>
                  <Button
                    className="icon-button"
                    aria-label="Làm mới lịch sử"
                    disabled={studio.loadingHistory}
                    onClick={() => void studio.loadHistory()}
                  >
                    {studio.loadingHistory ? <Spinner /> : <Icon name="reset" size={17} />}
                  </Button>
                </div>
                {studio.historyError && (
                  <div className="inline-error" role="alert">
                    <p>{studio.historyError}</p>
                    <Button className="text-button" onClick={() => void studio.loadHistory()}>
                      Thử lại
                    </Button>
                  </div>
                )}
                {studio.loadingHistory && !studio.history.length ? (
                  <div className="loading-state">
                    <Spinner />
                    Đang tải lịch sử…
                  </div>
                ) : visibleHistory.length ? (
                  <div className="record-list">
                    {visibleHistory.map((item) => (
                      <article className="record-row" key={item.jobId}>
                        <Button
                          className="record-play"
                          aria-label={`Mở bản thu: ${item.text.slice(0, 30)}`}
                          onClick={() => void studio.openRecording(item)}
                        >
                          <Icon name={item.status === "DONE" ? "play" : "clock"} size={17} />
                        </Button>
                        <div className="record-info">
                          <h2>
                            {item.text.slice(0, 85)}
                            {item.text.length > 85 ? "…" : ""}
                          </h2>
                          <p>
                            {item.voice.replace(" (demo)", "")}
                            <span>·</span>
                            {languageNames[item.lang] || item.lang}
                            <span>·</span>
                            {formatNumber(item.charCount)} ký tự
                          </p>
                        </div>
                        <span className={`record-status status-${item.status.toLowerCase()}`}>
                          {
                            {
                              DONE: "Hoàn tất",
                              PENDING: "Đang chờ",
                              PROCESSING: "Đang xử lý",
                              FAILED: "Thất bại",
                            }[item.status]
                          }
                        </span>
                        <time dateTime={item.createdAt}>{shortDate(item.createdAt)}</time>
                        <Button
                          className="icon-button delete-record"
                          aria-label={`Xóa bản thu: ${item.text.slice(0, 30)}`}
                          onClick={() => setDeleteItem(item)}
                        >
                          <Icon name="trash" size={16} />
                        </Button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={query || languageFilter !== "all" ? "search" : "headphones"}
                    title={query || languageFilter !== "all" ? "Không tìm thấy bản thu" : "Chưa có bản thu"}
                    description={
                      query || languageFilter !== "all"
                        ? "Thử từ khóa khác hoặc bỏ bộ lọc."
                        : "Các bản thu đã tạo sẽ xuất hiện tại đây."
                    }
                    action={
                      query || languageFilter !== "all" ? (
                        <Button
                          className="secondary-button"
                          onClick={() => {
                            setQuery("");
                            setLanguageFilter("all");
                          }}
                        >
                          Xóa bộ lọc
                        </Button>
                      ) : (
                        <Button className="primary-button" onClick={() => navigate("studio")}>
                          <Icon name="plus" size={15} />
                          Tạo bản thu
                        </Button>
                      )
                    }
                  />
                )}
                {studio.nextCursor && (
                  <Button
                    className="load-more secondary-button"
                    disabled={studio.loadingHistory}
                    onClick={() => void studio.loadHistory(studio.nextCursor!)}
                  >
                    Xem thêm
                  </Button>
                )}
              </section>
            )}
          </main>
          {(isStudio || page === "library" || studio.currentAudio) && (
            <div className="player-dock">
              <AudioPlayer
                item={studio.currentAudio}
                queue={studio.history}
                onSelect={studio.openRecording}
                onLibrary={() => navigate("library")}
                volume={preferences.volume}
                onVolume={(volume) => setPreferences((p) => ({ ...p, volume }))}
                notify={notify}
              />
            </div>
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-label="Chọn tài liệu văn bản"
        accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
        onChange={(e) => {
          void studio.importFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {dialog === "voices" && (
        <Modal title="Chọn giọng đọc" onClose={closeDialog} className="voice-modal">
          {renderVoiceBrowser(true)}
        </Modal>
      )}

      {dialog === "menu" && (
        <Modal title="Chuyển văn bản thành giọng nói" onClose={closeDialog} className="mobile-nav-modal">
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="mobile-nav">
            {pages.map((n) => (
              <Button className={page === n.id ? "active" : ""} key={n.id} onClick={() => navigate(n.id)}>
                <Icon name={n.icon} size={19} />
                {n.title}
                <Icon name="arrow" size={15} />
              </Button>
            ))}
          </div>
        </Modal>
      )}
      {dialog === "search" && (
        <Modal title="Tìm kiếm" onClose={closeDialog} className="search-modal">
          <label className="command-search">
            <Icon name="search" size={18} />
            <input
              autoFocus
              aria-label="Tìm màn hình hoặc bản thu"
              placeholder="Tìm màn hình hoặc bản thu…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="command-results">
            {matchingNavigation.map((n) => (
              <Button key={n.id} onClick={() => navigate(n.id)}>
                <Icon name={n.icon} size={18} />
                <span>{n.title}</span>
                <Icon name="arrow" size={14} />
              </Button>
            ))}
            {matchingRecords.map((item) => (
              <Button
                key={item.jobId}
                onClick={() => {
                  navigate("library");
                  void studio.openRecording(item);
                }}
              >
                <Icon name="wave" size={18} />
                <span>{item.text.slice(0, 60)}</span>
                <Icon name="play" size={14} />
              </Button>
            ))}
            {!matchingNavigation.length && !matchingRecords.length && (
              <p className="no-results">Không tìm thấy kết quả.</p>
            )}
          </div>
        </Modal>
      )}
      {deleteItem && (
        <Modal
          title="Xóa bản thu?"
          onClose={() => {
            if (!deleting) setDeleteItem(null);
          }}
        >
          <p className="modal-description">
            Bản thu sẽ bị xóa khỏi lịch sử. Thao tác này không thể hoàn tác.
          </p>
          <div className="delete-preview">
            <Icon name="wave" size={19} />
            <span>{deleteItem.text.slice(0, 100)}</span>
          </div>
          <div className="modal-actions">
            <Button className="secondary-button" disabled={deleting} onClick={() => setDeleteItem(null)}>
              Giữ lại
            </Button>
            <Button
              className="primary-button destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? <Spinner /> : <Icon name="trash" size={15} />}
              {deleting ? "Đang xóa…" : "Xóa bản thu"}
            </Button>
          </div>
        </Modal>
      )}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toast && (
          <div className={`toast ${toast.error ? "toast-error" : ""}`}>
            <Icon name={toast.error ? "alert" : "check"} size={17} />
            <p>{toast.text}</p>
            <Button className="icon-button" aria-label="Đóng thông báo" onClick={() => setToast(null)}>
              <Icon name="close" size={15} />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
