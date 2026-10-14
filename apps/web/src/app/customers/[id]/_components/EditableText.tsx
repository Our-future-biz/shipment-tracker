"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Input } from "antd";

const TRIGGER_CLASS = [
  "inline-block max-w-full bg-transparent border-0 px-1 -mx-1 rounded text-left [overflow-wrap:anywhere]",
  "cursor-pointer transition-colors hover:bg-slate-100",
].join(" ");

interface EditableTextProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  // What is being edited (e.g. "Sales owner"), announced by screen readers.
  label?: string;
}

// Click-to-edit text: a button showing the value that turns into an input. Enter or leaving the field saves,
// Escape cancels.
export function EditableText({ value, onCommit, placeholder = "—", label }: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Enter and Escape take the input away, which can still fire a blur afterwards; only the first outcome counts.
  const settledRef = useRef(true);
  // After Enter or Escape the keyboard focus returns to the trigger instead of being lost with the input.
  const refocusRef = useRef(false);

  useEffect(() => {
    if (editing || !refocusRef.current) return;
    refocusRef.current = false;
    triggerRef.current?.focus();
  }, [editing]);

  const finish = (save: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    setEditing(false);
    const next = draft.trim();
    if (save && next !== value) onCommit(next);
  };

  const handleStartEdit = () => {
    settledRef.current = false;
    setDraft(value);
    setEditing(true);
  };

  const handlePressEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    // The trigger gets the focus while this key press is still being handled; without this the browser would
    // pass the same Enter on to it as a click and open the editor again.
    e.preventDefault();
    refocusRef.current = true;
    finish(true);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Escape") return;
    refocusRef.current = true;
    finish(false);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        size="small"
        value={draft}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onPressEnter={handlePressEnter}
        onKeyDown={handleKeyDown}
        className="max-w-[180px]"
      />
    );
  }

  const shown = value || placeholder;

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={handleStartEdit}
      title="Click to edit"
      aria-label={label ? `Edit ${label}${value ? ` (${shown})` : ""}` : undefined}
      className={value ? TRIGGER_CLASS : `${TRIGGER_CLASS} text-slate-400`}
    >
      {shown}
    </button>
  );
}
