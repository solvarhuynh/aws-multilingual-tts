import { useEffect, useId, useRef, useState } from "react";
import { languageNames } from "../lib/data";
import type { HistoryItem, Page } from "../lib/types";
import { Button, Icon } from "./ui";

const searchKey = (text: string) => text.toLocaleLowerCase("vi").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

export default function HeaderSearch({ pages, history, onNavigate, onRecording }: {
  pages: { id: Page; title: string; icon: string }[];
  history: HistoryItem[];
  onNavigate: (page: Page) => void;
  onRecording: (item: HistoryItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const term = searchKey(query.trim());
  const results = term ? [
    ...pages.filter((page) => searchKey(page.title).includes(term)).slice(0, 4).map((page) => ({
      id: page.id, label: page.title, detail: "Công cụ", icon: page.icon, choose: () => onNavigate(page.id),
    })),
    ...history.filter((item) => searchKey(`${item.text} ${item.voice} ${languageNames[item.lang] || item.lang}`)
      .includes(term)).slice(0, 3).map((item) => ({
      id: item.jobId, label: item.text.slice(0, 60), detail: `${item.voice} · ${languageNames[item.lang] || item.lang}`,
      icon: "headphones", choose: () => onRecording(item),
    })),
  ].slice(0, 6) : [];
  const visible = open && !!term;
  const selected = Math.min(active, results.length - 1);

  useEffect(() => {
    if (visible) ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [visible, selected, term]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  function choose(index: number) {
    const result = results[index];
    if (!result) return;
    setQuery("");
    setOpen(false);
    result.choose();
  }

  return <div className="header-search" ref={ref}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <div className="header-search-field">
      <Icon name="search" size={18} />
      <input ref={inputRef} role="combobox" aria-label="Tìm công cụ hoặc bản thu"
        aria-autocomplete="list" aria-expanded={visible} aria-controls={visible ? listId : undefined}
        aria-activedescendant={visible && selected >= 0 ? `${listId}-${selected}` : undefined}
        placeholder="Tìm công cụ hoặc bản thu…" autoComplete="off" spellCheck={false} value={query}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setOpen(false); event.stopPropagation(); }
          if (["ArrowDown", "ArrowUp"].includes(event.key) && results.length) {
            event.preventDefault(); setOpen(true);
            setActive(visible ? (selected + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length
              : event.key === "ArrowDown" ? 0 : results.length - 1);
          }
          if (event.key === "Enter" && visible && selected >= 0) { event.preventDefault(); choose(selected); }
        }} />
      {query && <Button className="icon-button" aria-label="Xóa tìm kiếm"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { setQuery(""); setOpen(false); inputRef.current?.focus(); }}><Icon name="close" size={14} /></Button>}
    </div>
    {visible && <div id={listId} className="header-search-menu" role="listbox" aria-label="Gợi ý tìm kiếm">
      {results.map((result, index) => <Button key={`${result.icon}-${result.id}`} id={`${listId}-${index}`}
        role="option" aria-selected={selected === index} tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}>
        <Icon name={result.icon} size={18} />
        <span><strong>{result.label}</strong><small>{result.detail}</small></span>
        <Icon name="arrow" size={14} />
      </Button>)}
      {!results.length && <p className="header-search-empty" role="status">Không tìm thấy kết quả.</p>}
    </div>}
  </div>;
}
