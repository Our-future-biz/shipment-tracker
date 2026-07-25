"use client";

import { useEffect, useState } from "react";
import { Input } from "antd";

interface EditableTextProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number";
  suffix?: string;
}

// Click-to-edit text field used in the customer profile panel.
export function EditableText({ value, onCommit, placeholder = "—", type = "text", suffix }: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        size="small"
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onPressEnter={commit}
        className="max-w-[180px]"
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`cursor-pointer hover:bg-slate-100 rounded px-1 -mx-1 ${value ? "text-slate-700" : "text-slate-300"}`}
    >
      {value ? `${value}${suffix ? ` ${suffix}` : ""}` : placeholder}
    </span>
  );
}
