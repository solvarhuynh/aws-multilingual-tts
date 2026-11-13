import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO, getDemoToken, saveDemoToken } from "./lib/api";
import AudioPlayer from "./components/AudioPlayer";
import Sidebar from "./components/Sidebar";
import PageHeader from "./components/PageHeader";
import HeaderSearch from "./components/HeaderSearch";
import Select from "./components/Select";
import CorrectionReview from "./components/CorrectionReview";
import DocumentReview from './components/DocumentReview';
import { DOCUMENT_MODES, type DocumentMode } from '../../shared/vision';
import {
  Button,
  EmptyState,
  Icon,
  Modal,
  Spinner,
  Slider,
  Toggle,
  VoiceAvatar,
} from "./components/ui";
import {
  estimateDuration,
  formatNumber,
  formatTime,
  historyCsv,
  languageNames,
  MAX_CHARS,
  MAX_SPEED,
  MIN_SPEED,
  providerLabel,
  voiceLabel,
  navigation,
  readStored,
  shortDate,
  storeValue,
  starterPresets,
  samples,
} from "./lib/data";
import { DRAFT_KEYS, useEditor, useSession } from "./hooks/useStudio";
import { useSidebarMotion } from "./hooks/useSidebarMotion";
import { useTheme } from "./hooks/useTheme";
import Dashboard from "./views/Dashboard";
import type { HistoryItem, Page, Preferences } from "./lib/types";
import { MAX_DOCUMENT_CHARS, OCR_LANGUAGES, wordCount } from '../../shared/documents';
import { expressionHint } from '../../shared/expression';

type Dialog = "voices" | "menu" | null;
const pages = [
  ...navigation,
  { id: "settings" as Page, title: "Cài đặt", icon: "settings" },
  { id: "help" as Page, title: "Hướng dẫn sử dụng", icon: "help" },
];
const validPages = pages.map((item) => item.id);
// "Đọc tài liệu" đã gộp vào hai trang soạn thảo; link cũ mở Tạo giọng đọc.
const legacyPages: Record<string, Page> = { documents: "studio" };
const currentPage = (): Page => {
  const hash = location.hash.slice(1);
  return validPages.includes(hash as Page) ? (hash as Page) : legacyPages[hash] ?? "studio";
};
function getPreferences(): Preferences {
  const value = readStored<Partial<Preferences> | null>("voxa.preferences.v1", null);
  return {
    theme: value?.theme === "light" || value?.theme === "dark" ? value.theme : "system",
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
  const [systemReducedMotion, setSystemReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [demoToken, setDemoToken] = useState(getDemoToken);
  useTheme(preferences.theme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStored<boolean>("tts.sidebar.collapsed", false) === true);
  const sidebarMotion = useSidebarMotion(() => setSidebarCollapsed((value) => !value), preferences.reducedMotion);
  const [playbackRequest, setPlaybackRequest] = useState<{ jobId: string; serial: number } | null>(null);
  const [playingJobId, setPlayingJobId] = useState<string | null>(null);
  const playbackSerial = useRef(0);
  const [deleteItem, setDeleteItem] = useState<HistoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteLock = useRef(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const notify = useCallback((text: string, error = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), 5500);
  }, []);
  const [target, setTarget] = useState("en-US");
  const isStudio = page === "studio" || page === "translation";
  // Hai trang soạn thảo độc lập (nội dung, tài liệu, giọng, bản nháp); lịch sử và trình phát dùng chung.
  const session = useSession(notify);
  const speechEditor = useEditor(session, notify, { draftKey: DRAFT_KEYS.speech });
  const translationEditor = useEditor(session, notify, { draftKey: DRAFT_KEYS.translation, translateTo: target });
  const studio = { ...session, ...(page === "translation" ? translationEditor : speechEditor) };
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
    window.addEventListener("hashchange", change);
    return () => {
      window.removeEventListener("hashchange", change);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    document.title = `${navigation.find((n) => n.id === page)?.title || (page === "settings" ? "Cài đặt" : "Hướng dẫn")} · TTS Studio`;
  }, [page]);
  useEffect(() => {
    storeValue("voxa.preferences.v1", preferences);
    document.documentElement.dataset.motion = preferences.reducedMotion ? "reduced" : "auto";
    document.documentElement.dataset.contrast = preferences.highContrast ? "high" : "normal";
  }, [preferences]);
  useEffect(() => { storeValue("tts.sidebar.collapsed", sidebarCollapsed); }, [sidebarCollapsed]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (dialog !== "menu") return;
    const desktop = window.matchMedia("(min-width: 801px)");
    const close = () => { if (desktop.matches) setDialog(null); };
    desktop.addEventListener("change", close);
    close();
    return () => desktop.removeEventListener("change", close);
  }, [dialog]);

  async function playRecording(item: HistoryItem) {
    const selected = studio.currentAudio?.jobId === item.jobId ? item : await studio.openRecording(item);
    if (selected?.status === "DONE") setPlaybackRequest({ jobId: selected.jobId, serial: ++playbackSerial.current });
  }

  const visibleVoices = studio.languages
    .filter(l => studio.provider !== 'gemini' || l.lang === (languageFilter === 'all' ? studio.language?.lang ?? studio.lang : languageFilter))
    .flatMap((l) => l.voices.map((v) => ({ ...v, lang: l.lang, provider: l.provider })))
    .filter(
      (v) =>
        (languageFilter === "all" || v.lang === languageFilter) &&
        `${v.name ?? v.id} ${languageNames[v.lang] || v.lang}`
          .toLocaleLowerCase("vi")
          .includes(query.toLocaleLowerCase("vi")),
    );
  const visibleHistory = studio.history.filter(
    (item) =>
      (languageFilter === "all" || item.lang === languageFilter) &&
      `${item.text} ${voiceLabel(studio.languages, item.voice)}`.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")),
  );
  const selectedVoice = studio.language?.voices.find((v) => v.id === studio.voice);
  const progress =
    studio.job?.progress && studio.job.progress.total > 0 && studio.job.progress.done > 0
      ? Math.min(100, Math.round((studio.job.progress.done / studio.job.progress.total) * 100))
      : undefined;
  const title =
    navigation.find((n) => n.id === page)?.title || (page === "settings" ? "Cài đặt" : "Hướng dẫn sử dụng");

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

  function exportReport() {
    if (studio.loadingHistory && !studio.history.length) {
      notify("Đang tải lịch sử để xuất báo cáo. Vui lòng thử lại sau.");
      return;
    }
    if (!studio.history.length) {
      navigate("library");
      notify(studio.historyError || "Báo cáo sẽ sẵn sàng khi bạn có bản thu đầu tiên.", !!studio.historyError);
      return;
    }
    const url = URL.createObjectURL(new Blob([historyCsv(studio.history)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `tts-studio-report-${new Date().toLocaleDateString("sv-SE")}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Đã xuất ${formatNumber(studio.history.length)} bản thu.${studio.nextCursor ? " Tải thêm lịch sử để xuất các bản thu còn lại." : ""}`);
  }

  function renderPreferences() {
    return (
      <div className="preferences-content">
        <fieldset className="theme-preference">
          <legend>Giao diện</legend>
          <div className="theme-options">
            {([{ value: "system", label: "Hệ thống" }, { value: "light", label: "Sáng" }, { value: "dark", label: "Tối" }] as const).map(option =>
              <label key={option.value}>
                <input className="sr-only" type="radio" name="theme" value={option.value} checked={preferences.theme === option.value}
                  onChange={() => setPreferences(p => ({ ...p, theme: option.value }))} />
                <span>{option.label}</span>
              </label>)}
          </div>
        </fieldset>
        <Toggle
          label="Giảm chuyển động"
          description="Ngừng chuyển động của nền và sóng âm."
          checked={preferences.reducedMotion}
          onChange={(value) => setPreferences((p) => ({ ...p, reducedMotion: value }))}
        />
        <Toggle
          label="Tăng độ tương phản"
          description="Làm chữ và đường viền rõ hơn."
          checked={preferences.highContrast}
          onChange={(value) => setPreferences((p) => ({ ...p, highContrast: value }))}
        />
        {systemReducedMotion && !preferences.reducedMotion && <p className="settings-note">Chuyển động đang được giảm theo cài đặt của thiết bị.</p>}
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
        <p>Tệp tối đa 50 MB, 200.000 ký tự và 50.000 từ. Mỗi bản thu tối đa {formatNumber(MAX_CHARS)} ký tự; tạo từng phần theo hạn mức máy chủ.</p>
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
          {!DEMO && studio.providers.length > 1 && <Select label="Nguồn giọng đọc" value={studio.provider} onValueChange={studio.setProvider}
            options={studio.providers} disabled={studio.busy} />}
          <Select label="Lọc ngôn ngữ giọng đọc" value={languageFilter} onValueChange={setLanguageFilter}
            options={[{ value: "all", label: "Tất cả ngôn ngữ" }, ...studio.languages.map((l) => ({ value: l.lang, label: languageNames[l.lang] || l.lang }))]} />
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
                  <VoiceAvatar id={v.name ?? v.id} large />
                  {studio.lang === v.lang && studio.voice === v.id && (
                    <span className="selected-label">
                      <Icon name="check" size={12} />
                      Đang chọn
                    </span>
                  )}
                </div>
                <h2>{voiceLabel(studio.languages, v.id)}</h2>
                <p>
                  {languageNames[v.lang] || v.lang}
                  <span>·</span>
                  {v.gender === "F" ? "Nữ" : v.gender === "M" ? "Nam" : "Giọng đọc"}
                  {!!v.styles?.length && <><span>·</span>Có sắc thái</>}
                </p>
                <div className="voice-card-bottom">
                  <small>
                    {DEMO ? "Giọng minh họa" : providerLabel(v.provider)}
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
      <div ref={sidebarMotion.ref} className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <div className="glass-backdrop" aria-hidden="true" />
        <Sidebar page={page} collapsed={sidebarCollapsed} count={studio.history.length}
          onToggle={sidebarMotion.toggleWithMotion}
          onNavigate={navigate} />
        <div className="workspace">
          <PageHeader onMenu={() => openDialog("menu")} onExport={exportReport}>
            <HeaderSearch pages={pages} history={studio.history} languages={studio.languages} onNavigate={navigate}
              onRecording={(item) => { navigate("library"); void playRecording(item); }} />
          </PageHeader>
          <h1 className="page-title">{title}</h1>
          <main id="main-content" key={page} className={`route-view ${isStudio ? "studio-route" : ""}`}>
            {page === "dashboard" && (
              <Dashboard
                history={studio.history}
                languages={studio.languages}
                navigate={navigate}
                openRecording={playRecording}
                playingJobId={playingJobId}
                loadingHistory={studio.loadingHistory}
                historyError={studio.historyError}
                reloadHistory={studio.loadHistory}
                hasMoreHistory={!!studio.nextCursor}
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
                  {!DEMO && (
                    <form
                      className="token-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveDemoToken(demoToken);
                        window.location.reload();
                      }}
                    >
                      <label htmlFor="demo-token">Mã truy cập</label>
                      <input
                        id="demo-token"
                        type="password"
                        autoComplete="off"
                        value={demoToken}
                        onChange={(event) => setDemoToken(event.target.value)}
                      />
                      <button type="submit">Lưu mã</button>
                    </form>

                  )}
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
                      a: `PDF, Word DOCX, TXT, Markdown và ảnh JPG/PNG/WebP; tối đa 50 MB, 200.000 ký tự và 50.000 từ. PDF scan được nhận dạng chữ tại thiết bị, tối đa 30 trang scan/lần. Kiểm tra lại chữ trước khi tạo các bản thu, mỗi phần tối đa ${formatNumber(MAX_CHARS)} ký tự.`,
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
              <div className="studio-layout">
                <section className="editor-panel" aria-label="Soạn thảo văn bản">
                  <form
                    className="composer surface"
                    onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
                    onDrop={event => {
                      const file = event.dataTransfer.files[0];
                      if (!file) return;
                      event.preventDefault();
                      if (!studio.busy && !studio.readingFile) void studio.importFile(file);
                    }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void studio.generate();
                    }}
                    noValidate
                  >
                    <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={event => { void studio.importFile(event.target.files?.[0], true); event.target.value = ""; }} />
                    <div className="editor-toolbar">
                      <Button
                        type="button"
                        className="speaker-chip"
                        disabled={studio.busy || studio.readingFile || studio.loadingVoices || !!studio.voiceError}
                        onClick={() => openDialog("voices")}
                      >
                        <VoiceAvatar id={voiceLabel(studio.languages, studio.voice)} />
                        <strong>{selectedVoice ? voiceLabel(studio.languages, selectedVoice.id) : "Chọn giọng đọc"}</strong>
                        <Icon name="chevron" size={13} />
                      </Button>
                      <div className="editor-import-actions">
                        <Select label="Cách đọc tài liệu" value={studio.documentMode} onValueChange={value => studio.setDocumentMode(value as DocumentMode)}
                          disabled={studio.busy || studio.readingFile} options={DOCUMENT_MODES} />
                        {studio.documentMode === 'device' && <Select label="Ngôn ngữ tài liệu" value={studio.documentLang} onValueChange={studio.setDocumentLang}
                          disabled={studio.busy || studio.readingFile} options={OCR_LANGUAGES} />}
                        <Button
                          className="text-button"
                          type="button"
                          title="PDF, DOCX, TXT, Markdown, ảnh scan · Tối đa 50 MB. Có thể kéo thả vào ô soạn thảo."
                          disabled={studio.busy || studio.readingFile}
                          onClick={() => fileRef.current?.click()}
                        >
                          <Icon name="upload" size={15} />
                          {studio.readingFile ? "Đang nhập…" : "Nhập tệp"}
                        </Button>
                        <Button type="button" className="icon-button" aria-label="Chụp tài liệu" title="Chụp hoặc chọn ảnh để nhận dạng chữ"
                          disabled={studio.busy || studio.readingFile} onClick={() => cameraRef.current?.click()}>
                          <Icon name="camera" size={18} />
                        </Button>
                      </div>
                    </div>
                    {studio.fileName && <div className="imported-file" title={studio.fileName}><Icon name="file" size={14} /><span>{studio.fileName}</span></div>}
                    {studio.documentMode === 'gemini' && <div className="document-privacy-note">Ảnh và trang scan được gửi tới Gemini để đọc chữ.</div>}
                    {!!studio.importWarning && <div className="imported-file" role="status">{studio.importWarning}</div>}
                    {studio.readingFile && <div className="document-tools" role="status">
                      <span>{studio.importProgress}</span>
                      <Button type="button" onClick={studio.cancelImport}>Hủy nhập</Button>
                    </div>}
                    {studio.parts.length > 1 && <div className="document-tools">
                      <label>Phần đọc <select aria-label="Chọn phần tài liệu" value={studio.partIndex} disabled={studio.busy}
                        onChange={event => studio.setPartIndex(Number(event.target.value))}>
                        {studio.parts.map((part, index) => <option value={index} key={index}>Phần {index + 1}/{studio.parts.length} · {formatNumber(part.length)} ký tự</option>)}
                      </select></label>
                      <Button type="button" disabled={studio.busy || studio.readingFile} onClick={() => void studio.generateAll()}>Tạo các phần còn lại</Button>
                      {studio.batch && <><span role="status">Đã xong {studio.batch.done}/{studio.batch.total} phần</span>
                        <Button type="button" onClick={studio.stopBatch}>Dừng sau phần hiện tại</Button></>}
                      <details><summary>Xem phần {studio.partIndex + 1} sẽ được đọc</summary><p className="part-preview">{studio.parts[studio.partIndex]}</p></details>
                      <p>Mỗi phần có bản thu riêng trong Lịch sử. Phần đã xong được giữ lại khi dừng hoặc gặp lỗi.</p>
                    </div>}
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
                      maxLength={MAX_DOCUMENT_CHARS + 1}
                      spellCheck={false}
                      aria-invalid={!!studio.error}
                      aria-describedby={studio.error ? "text-count form-error" : "text-count"}
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
                    {(page !== "studio" || studio.error || studio.busy) && (
                      <div className="editor-footer">
                        {page !== "studio" && (
                          <Button className="secondary-button" disabled={studio.busy} onClick={studio.useSample}>
                            <Icon name="file" size={15} />
                            Văn bản mẫu
                          </Button>
                        )}
                        {studio.error && (
                          <div id="form-error" role="alert" className="form-error">
                            <Icon name="alert" size={16} />
                            <span>{studio.error}</span>
                          </div>
                        )}
                        {studio.busy && (
                          <div className="job-progress" role="status">
                            <div>
                              <Spinner />
                              <span>
                                {studio.checking ? "Đang kiểm tra lỗi đánh máy…" : studio.job?.status === "PENDING" ? "Đang chuẩn bị…" : "Đang tạo giọng nói…"}
                              </span>
                              {progress !== undefined && <strong>{progress}%</strong>}
                            </div>
                            <progress aria-label="Tiến độ tạo giọng nói" value={progress} max={100} />
                          </div>
                        )}
                      </div>
                    )}
                    <div className="editor-status">
                      <span id="text-count" className={studio.text.length > MAX_DOCUMENT_CHARS ? "over-limit" : ""}>
                        {formatNumber(studio.text.length)}
                        <span> / {formatNumber(MAX_DOCUMENT_CHARS)} ký tự · {formatNumber(wordCount(studio.text))} từ</span>
                        {studio.text && studio.draftSaved && (
                          <span className="draft-state"><Icon name="check" size={12} />Đã lưu nháp</span>
                        )}
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
                          disabled={!studio.text || studio.busy || studio.readingFile}
                          onClick={() => {
                            studio.updateText("");
                            studio.editorRef.current?.focus();
                          }}
                        >
                          <Icon name="trash" size={15} />
                        </Button>
                        <Button
                          type="submit"
                          className="primary-button"
                          disabled={
                            studio.busy ||
                            studio.readingFile ||
                            studio.loadingVoices || !!studio.voiceError || !studio.voice ||
                            (page === "translation" && !studio.text.trim())
                          }
                        >
                          {studio.busy ? <Spinner /> : <Icon name="wave" size={17} />}
                          {studio.busy
                            ? "Đang tạo âm thanh…"
                            : page === "translation" ? "Dịch và tạo giọng đọc"
                            : studio.parts.length > 1 ? `Tạo phần ${studio.partIndex + 1}` : "Tạo giọng đọc"}
                        </Button>
                      </div>
                    </div>
                  </form>
                  {page === "translation" && studio.currentAudio?.translated && <section className="surface translation-result" aria-label="Bản dịch">
                    <h2>Bản dịch · {languageNames[studio.currentAudio.lang] || studio.currentAudio.lang}</h2>
                    <p>{studio.currentAudio.text}</p>
                    <Button type="button" onClick={() => { void navigator.clipboard.writeText(studio.currentAudio!.text).then(() => notify("Đã sao chép bản dịch.")).catch(() => notify("Không sao chép được. Hãy chọn và sao chép văn bản.", true)); }}>Sao chép bản dịch</Button>
                  </section>}
                </section>
                <aside className="voice-settings surface" aria-label="Cài đặt giọng đọc">
                  <div className="settings-heading">
                    <h2>Cài đặt giọng</h2>
                  </div>
                  <div className="setting-field">
                    <label htmlFor="tts-provider">Nguồn giọng đọc</label>
                    {!DEMO && studio.providers.length > 1 ? <Select id="tts-provider" label="Nguồn giọng đọc" value={studio.provider}
                      onValueChange={studio.setProvider} options={studio.providers} disabled={studio.busy || studio.readingFile} /> :
                      <div className="engine-label"><Icon name="layers" size={17} /><span>{DEMO ? 'Giọng trên máy' : providerLabel(studio.language?.provider)}</span></div>}
                    {studio.provider === 'gemini' && <small>{studio.language?.available === false ? 'Chưa bật Gemini TTS ở máy chủ.' : 'Gemini 3.8 Flash TTS'}</small>}
                  </div>
                  <div className="setting-field">
                    <label htmlFor="language">{page === "translation" ? "Ngôn ngữ gốc" : "Ngôn ngữ"}</label>
                    <Select id="language" label={page === "translation" ? "Ngôn ngữ gốc" : "Ngôn ngữ"}
                      value={studio.lang} onValueChange={studio.setLang} disabled={studio.busy || studio.readingFile || studio.loadingVoices}
                      options={studio.languages.map((l) => ({ value: l.lang, label: languageNames[l.lang] || l.lang }))} />
                  </div>
                  {page === "translation" && (
                    <div className="setting-field">
                      <label htmlFor="target-language">Dịch sang</label>
                      <Select id="target-language" label="Dịch sang" value={target} onValueChange={setTarget}
                        disabled={studio.busy || studio.readingFile || studio.loadingVoices}
                        options={studio.languages.filter((l) => l.voices.length).map((l) => ({ value: l.lang, label: languageNames[l.lang] || l.lang }))} />
                    </div>
                  )}
                  <div className="setting-field">
                    <label id="selected-voice-label">Giọng đọc</label>
                    <Button
                      className="voice-select"
                      aria-labelledby="selected-voice-label selected-voice-value"
                      aria-haspopup="dialog"
                      disabled={studio.busy || studio.readingFile || studio.loadingVoices || !!studio.voiceError}
                      onClick={() => openDialog("voices")}
                    >
                      <VoiceAvatar id={voiceLabel(studio.languages, studio.voice)} />
                      <span id="selected-voice-value">
                        <strong>
                          {studio.loadingVoices
                            ? "Đang tải…"
                            : selectedVoice ? voiceLabel(studio.languages, selectedVoice.id) : "Chưa có giọng"}
                        </strong>
                        <small>
                          {selectedVoice?.gender === "F" ? "Nữ" : selectedVoice?.gender === "M" ? "Nam" : selectedVoice?.description || (selectedVoice ? "Giọng đọc" : "")}
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
                    <label htmlFor="speaking-style">Sắc thái</label>
                    <Select id="speaking-style" label="Sắc thái" value={studio.style} onValueChange={studio.setStyle}
                      options={studio.styles} disabled={studio.busy || studio.styles.length < 2} />
                    {studio.styles.length < 2 && selectedVoice && <small>{expressionHint(studio.language?.provider, selectedVoice.styles)}</small>}
                    {studio.style === 'auto' && <small>{studio.provider === 'gemini' ? 'Gemini tự điều chỉnh cảm xúc khi đọc theo nội dung.' : 'Gửi đoạn đọc cho Gemini để chọn sắc thái.'}</small>}
                  </div>
                  {studio.style !== 'neutral' && selectedVoice?.styleIntensityRange && <div className="setting-field speed-field">
                    <div className="field-heading"><label htmlFor="style-intensity">Cường độ sắc thái</label>
                      <output htmlFor="style-intensity">{studio.styleIntensity.toFixed(1)}×</output></div>
                    <Slider id="style-intensity" min={0.1} max={2} step={0.1} value={studio.styleIntensity}
                      disabled={studio.busy} onValueChange={studio.setStyleIntensity} />
                    <div className="range-labels"><span>Nhẹ · 0,1</span><span>Mạnh · 2,0</span></div>
                    {studio.provider === 'gemini' && <small>Mức tương đối; âm thanh có thể khác Azure.</small>}
                  </div>}
                  <div className="setting-field speed-field">
                    <div className="field-heading">
                      <label htmlFor="speed">Tốc độ</label>
                      <output htmlFor="speed">{studio.speed.toFixed(1)}×</output>
                    </div>
                    <Slider
                      id="speed"
                      min={MIN_SPEED}
                      max={MAX_SPEED}
                      step={0.1}
                      disabled={studio.busy}
                      value={studio.speed}
                      onValueChange={studio.setSpeed}
                    />
                    <div className="range-labels">
                      <span>{MIN_SPEED.toFixed(1)}×</span>
                      <span>{MAX_SPEED.toFixed(1)}×</span>
                    </div>
                  </div>
                  <Button
                    className="reset-button"
                    disabled={studio.busy}
                    onClick={() => {
                      studio.setSpeed(1);
                      studio.setStyle('neutral');
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
                  <Select label="Lọc ngôn ngữ bản thu" value={languageFilter} onValueChange={setLanguageFilter}
                    options={[{ value: "all", label: "Tất cả ngôn ngữ" }, ...Array.from(new Set(studio.history.map((i) => i.lang))).map((code) => ({ value: code, label: languageNames[code] || code }))]} />
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
                          aria-label={`${playingJobId === item.jobId ? "Tạm dừng" : item.status === "DONE" ? "Phát" : "Xem trạng thái"}: ${item.text.slice(0, 30)}`}
                          aria-pressed={item.status === "DONE" ? playingJobId === item.jobId : undefined}
                          onClick={() => void playRecording(item)}
                        >
                          <Icon name={playingJobId === item.jobId ? "pause" : item.status === "DONE" ? "play" : item.status === "FAILED" ? "alert" : "clock"} size={17} />
                        </Button>
                        <div className="record-info">
                          <h2>
                            {item.text.slice(0, 85)}
                            {item.text.length > 85 ? "…" : ""}
                          </h2>
                          <p>
                            {voiceLabel(studio.languages, item.voice)}
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
                languages={studio.languages}
                onSelect={studio.openRecording}
                onLibrary={() => navigate("library")}
                volume={preferences.volume}
                onVolume={(volume) => setPreferences((p) => ({ ...p, volume }))}
                notify={notify}
                playbackRequest={playbackRequest}
                onPlayingChange={setPlayingJobId}
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
        accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/jpeg,image/png,image/webp"
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
      {studio.documentReview && <DocumentReview {...studio.documentReview} onClose={studio.closeDocumentReview} onAccept={studio.acceptDocument} />}

      {dialog === "menu" && (
        <Modal title="TTS Studio" onClose={closeDialog} className="mobile-nav-modal">
          <Sidebar drawer page={page} collapsed={false} count={studio.history.length}
            onToggle={closeDialog} onNavigate={navigate} />
        </Modal>
      )}
      {deleteItem && (
        <Modal
          title="Xóa bản thu?"
          dismissible={!deleting}
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
      {studio.review && <CorrectionReview correction={studio.review.correction}
        onChoose={(corrected) => void studio.resolveReview(corrected)} onClose={studio.cancelReview} />}
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
