"use client";

import { useState } from "react";
import { Input, Select } from "antd";
import { QUOTE_DROPDOWNS, quoteColType } from "../_lib/quoteColumns";

interface QuoteEditableCellProps {
  column: string;
  value: string;
  onCommit: (value: string) => void;
}

export function QuoteEditableCell({ column, value, onCommit }: QuoteEditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const type = quoteColType(column);

  const start = () => {
    setDraft(value);
    setEditing(true);
  };
  const commit = (next: string) => {
    setEditing(false);
    if (next !== value) onCommit(next);
  };

  if (!editing) {
    return (
      <span
        className="cursor-pointer rounded px-1 -mx-1 hover:bg-slate-100 transition-colors block min-h-[20px] text-xs text-slate-700"
        title="Double-click to edit"
        onDoubleClick={start}
      >
        {value || <span className="text-slate-300">—</span>}
      </span>
    );
  }

  if (type === "dropdown") {
    return (
      <Select
        size="small"
        autoFocus
        defaultOpen
        className="w-full min-w-[120px]"
        defaultValue={value || undefined}
        options={QUOTE_DROPDOWNS[column]!.map((o) => ({ value: o, label: o }))}
        onChange={commit}
        onBlur={() => setEditing(false)}
        allowClear
      />
    );
  }

  return (
    <Input
      size="small"
      autoFocus
      type={type === "number" ? "number" : "text"}
      defaultValue={value}
      onChange={(e) => setDraft(e.target.value)}
      onPressEnter={() => commit(draft)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
