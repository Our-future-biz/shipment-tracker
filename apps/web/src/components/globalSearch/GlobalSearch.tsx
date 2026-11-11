"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Input, type InputRef, Spin } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useDebounced } from "@/hooks/useDebounced";
import { HINT } from "@/styles/ui";
import { SearchHitRow } from "./SearchHitRow";
import { MIN_QUERY, searchHref, useGlobalSearch } from "./useGlobalSearch";

// Results per group in the dropdown; the results page shows more.
const DROPDOWN_LIMIT = 5;

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * The main search in the top bar. It looks in everything at once - the app's pages, shipments,
 * master jobs, the Customer Database, quotes and invoices - and lists what it finds under the box
 * as you type, by kind. Arrows pick, Enter opens the picked one or, with none picked, the page of
 * all results; Esc closes. Ctrl+K (⌘K on a Mac) jumps into the box from anywhere.
 */
export function GlobalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<InputRef>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const query = useDebounced(text.trim(), 200);
  const groups = useGlobalSearch(query, DROPDOWN_LIMIT);
  const shown = groups.filter((g) => g.hits.length > 0);
  const hits = useMemo(() => shown.flatMap((g) => g.hits), [shown]);
  const loading = groups.some((g) => g.isLoading);
  const failed = groups.some((g) => g.isError);
  const ready = query.length >= MIN_QUERY && text.trim() === query;
  // The last row of the list, after the hits: all results on their own page.
  const allIndex = hits.length;

  // A new text starts with nothing picked.
  const [pickedFor, setPickedFor] = useState(query);
  if (pickedFor !== query) {
    setPickedFor(query);
    setActive(-1);
  }

  // Another page reached closes the list.
  const [shownAt, setShownAt] = useState(pathname);
  if (shownAt !== pathname) {
    setShownAt(pathname);
    setOpen(false);
  }

  // Ctrl+K / ⌘K from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus({ cursor: "all" });
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A click outside closes the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const goAll = () => {
    const q = text.trim();
    if (q.length < MIN_QUERY) return;
    setOpen(false);
    inputRef.current?.blur();
    router.push(searchHref(q));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (!ready) return;
      const count = hits.length + 1;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % count : i <= 0 ? count - 1 : i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = active >= 0 && active < hits.length ? hits[active] : null;
      if (hit) {
        setOpen(false);
        inputRef.current?.blur();
        router.push(hit.href);
      } else goAll();
    }
  };

  const shortcut = isMac() ? "⌘K" : "Ctrl K";
  const showPanel = open && text.trim().length > 0;
  let index = 0;

  return (
    <div ref={boxRef} className="relative">
      <Input
        ref={inputRef}
        prefix={<SearchOutlined className="text-slate-400" />}
        suffix={!text && <kbd className="text-[11px] font-sans text-slate-400 border border-slate-200 rounded px-1.5 leading-5">{shortcut}</kbd>}
        placeholder="Search everything…"
        size="large"
        allowClear
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        aria-activedescendant={showPanel && active >= 0 ? `global-search-${active}` : undefined}
        aria-label="Search everything"
      />

      {showPanel && (
        <div
          id="global-search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 top-[calc(100%+6px)] w-[min(640px,calc(100vw-2rem))] max-h-[min(70vh,620px)] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-[200]"
        >
          {text.trim().length < MIN_QUERY ? (
            <div className={`${HINT} px-3 py-3`}>Type at least {MIN_QUERY} characters.</div>
          ) : (
            <>
              {shown.map((g) => (
                <div key={g.kind} className="mb-1.5 last:mb-0">
                  <div className="flex items-center justify-between px-3 pt-1.5 pb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{g.label}</span>
                    {g.total > g.hits.length && <span className={`${HINT} tabular-nums`}>{g.total}</span>}
                  </div>
                  {g.hits.map((hit) => {
                    const i = index++;
                    return (
                      <SearchHitRow
                        key={hit.key}
                        id={`global-search-${i}`}
                        hit={hit}
                        active={i === active}
                        onHover={() => setActive(i)}
                        onPick={() => setOpen(false)}
                      />
                    );
                  })}
                </div>
              ))}

              {ready && !loading && shown.length === 0 && (
                <div className={`${HINT} px-3 py-3`}>
                  {failed ? "The search could not be finished — try again." : `Nothing found for “${query}”.`}
                </div>
              )}
              {(loading || !ready) && (
                <div className={`${HINT} flex items-center gap-2 px-3 py-2`}>
                  <Spin size="small" /> Searching…
                </div>
              )}

              <div className="border-t border-slate-100 mt-1.5 pt-1.5">
                <button
                  type="button"
                  id={`global-search-${allIndex}`}
                  role="option"
                  aria-selected={active === allIndex}
                  onMouseEnter={() => setActive(allIndex)}
                  onClick={goAll}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left text-[13px] font-medium border-0 cursor-pointer transition-colors ${
                    active === allIndex ? "bg-indigo-50 text-indigo-700" : "bg-transparent text-indigo-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="truncate">See all results for “{text.trim()}”</span>
                  <kbd className="text-[11px] font-sans text-slate-400 border border-slate-200 rounded px-1.5 leading-5">Enter</kbd>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
