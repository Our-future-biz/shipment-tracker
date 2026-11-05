"use client";

import { useState } from "react";
import { Checkbox, Input } from "antd";
import { HINT } from "@/styles/ui";

interface ColumnChecklistProps {
  columns: { key: string; title: string }[];
  /** The keys shown, in order. */
  visible: string[];
  onChange: (next: string[]) => void;
  /** Columns that are always shown and can't be unticked. */
  fixedKeys?: string[];
  /** "Select all" result; defaults to every column, in the order shown plus the rest. */
  allKeys?: string[];
  disabled?: boolean;
}

// The column list of a grid's "Columns" panel: find a column, tick it on or off, select all /
// clear. Shared by AppGrid and the Customer Database list.
export function ColumnChecklist({ columns, visible, onChange, fixedKeys = [], allKeys, disabled }: ColumnChecklistProps) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = q ? columns.filter((c) => c.title.toLowerCase().includes(q)) : columns;
  const fixed = new Set(fixedKeys);
  const visibleSet = new Set(visible);

  const toggle = (key: string, checked: boolean) => {
    if (fixed.has(key)) return;
    onChange(checked ? [...visible, key] : visible.filter((k) => k !== key));
  };
  const selectAll = () => onChange(allKeys ?? [...visible, ...columns.map((c) => c.key).filter((k) => !visibleSet.has(k))]);
  const clear = () => onChange(visible.filter((k) => fixed.has(k)));

  return (
    <>
      <Input size="small" placeholder="Find a column…" value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="mb-2" />
      <div className="max-h-[320px] overflow-y-auto pr-1 flex flex-col gap-1">
        {shown.length === 0 && <div className={`${HINT} py-2`}>No columns found.</div>}
        {shown.map((c) => {
          const isFixed = fixed.has(c.key);
          return (
            <label
              key={c.key}
              className={`flex items-center gap-2 text-xs py-0.5 ${isFixed ? "text-slate-500 cursor-default" : "text-slate-700 cursor-pointer"}`}
            >
              <Checkbox checked={isFixed || visibleSet.has(c.key)} disabled={isFixed || disabled} onChange={(e) => toggle(c.key, e.target.checked)} />
              {c.title}
              {isFixed && <span className="text-[10px] text-slate-400">· always shown</span>}
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
        <button
          type="button"
          disabled={disabled}
          onClick={selectAll}
          className="text-[12px] text-indigo-600 hover:text-indigo-700 hover:underline disabled:text-slate-300 disabled:no-underline bg-transparent border-none p-0 cursor-pointer"
        >
          Select all
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={clear}
          className="text-[12px] text-slate-500 hover:text-slate-900 hover:underline disabled:text-slate-300 disabled:no-underline bg-transparent border-none p-0 cursor-pointer"
        >
          Clear
        </button>
        <span className={`ml-auto ${HINT}`}>{visible.length} shown</span>
      </div>
    </>
  );
}
