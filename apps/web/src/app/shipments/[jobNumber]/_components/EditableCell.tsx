"use client";

import { useState, useRef } from "react";
import { Input, Select } from "antd";
import type { InputRef } from "antd";
import { COLUMN_MAP } from "@/lib/columnConfig";

// Dates are stored as ISO "YYYY-MM-DD" (matches the native date input).
// Still tolerate legacy "MM/DD/YY" values for display prefill.
function toInputISO(s: string): string {
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = s.split("/");
  if (parts.length !== 3) return "";
  const mm = parts[0]!, dd = parts[1]!, yy = parts[2]!;
  if (!/^\d{1,2}$/.test(mm) || !/^\d{1,2}$/.test(dd) || !/^\d{1,4}$/.test(yy)) return "";
  const year = yy.length <= 2 ? `20${yy.padStart(2, "0")}` : yy;
  return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

interface EditableCellProps {
  /** columnConfig key (e.g. "shippingLine") — decides text vs dropdown. */
  fieldKey: string;
  value?: string | null;
  onCommit: (fieldKey: string, value: string) => void;
  /** Render a multi-line textarea (used by address blocks). */
  multiline?: boolean;
  /** Text shown when the value is empty. */
  placeholder?: string;
  /** Class for the value text in display mode. */
  displayClassName?: string;
  /** Class for the placeholder text in display mode (falls back to displayClassName). */
  emptyClassName?: string;
  /** Class for the outer wrapper. */
  className?: string;
}

export function EditableCell({
  fieldKey,
  value,
  onCommit,
  multiline = false,
  placeholder = "—",
  displayClassName = "text-slate-700 font-medium",
  emptyClassName,
  className,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const cancelledRef = useRef(false);
  const inputRef = useRef<InputRef>(null);

  const col = COLUMN_MAP.get(fieldKey);
  const isDropdown = col?.type === "dropdown";
  const isDate = col?.type === "date";
  const options = col?.options ?? [];
  const original = value ?? "";

  const startEditing = () => {
    cancelledRef.current = false;
    setDraft(original);
    setEditing(true);
  };

  const commit = (next: string) => {
    setEditing(false);
    if (next !== original) onCommit(fieldKey, next);
  };

  const cancel = () => {
    cancelledRef.current = true;
    setEditing(false);
  };

  if (!editing) {
    const hasValue = original.length > 0;
    return (
      <span
        className={`${className ?? ""} cursor-pointer rounded px-1 -mx-1 hover:bg-slate-100 transition-colors block`}
        title="Double-click to edit"
        onDoubleClick={startEditing}
      >
        <span className={hasValue ? displayClassName : (emptyClassName ?? displayClassName)}>
          {hasValue ? original : placeholder}
        </span>
      </span>
    );
  }

  if (isDate) {
    return (
      <div className={className}>
        <input
          type="date"
          autoFocus
          className="w-full text-xs border border-slate-300 rounded px-2 py-1 outline-none focus:border-indigo-400"
          defaultValue={toInputISO(original)}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
        />
      </div>
    );
  }

  if (isDropdown) {
    return (
      <div className={className}>
        <Select
          size="small"
          autoFocus
          defaultOpen
          className="w-full min-w-[140px]"
          defaultValue={original || undefined}
          options={options.map((o) => ({ value: o, label: o }))}
          onChange={(v) => commit(v)}
          onBlur={() => setEditing(false)}
        />
      </div>
    );
  }

  if (multiline) {
    return (
      <div className={className}>
        <Input.TextArea
          autoFocus
          autoSize={{ minRows: 2, maxRows: 6 }}
          defaultValue={original}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (cancelledRef.current) return;
            commit(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <Input
        ref={inputRef}
        size="small"
        autoFocus
        defaultValue={original}
        onChange={(e) => setDraft(e.target.value)}
        onPressEnter={() => commit(draft)}
        onBlur={() => {
          if (cancelledRef.current) return;
          commit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
        }}
      />
    </div>
  );
}
