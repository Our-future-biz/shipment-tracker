"use client";

import { useEffect, useRef, useState } from "react";
import { ConfigProvider, InputNumber } from "antd";
import { ConfirmModal } from "@/components/ConfirmModal";
import { fmtMoney, moneyInputParser } from "@/lib/money";

interface LockedAmountInputProps {
  value: number;
  onChange: (value: number) => void;
  "aria-label": string;
  // The line's currency, for the question before an amount is changed.
  currency?: string;
  // Once an edit is done (left or Enter; not Esc): the amount it ended with and the one before it.
  onCommit?: (value: number, before: number) => void;
}

// An amount that a stray click and typing cannot change. Locked, it is shown, not an input; a
// double-click (or Enter, Tab to a 0.00, or a figure typed after Tab) puts a fresh input there,
// focused with the amount selected, which goes back to the locked view once it is left or Enter
// pressed; Esc puts the old amount back. An amount already there is changed only after the user
// confirms it.
// The locked view is no read-only input on purpose: switching an input that has the caret between
// read-only and editable was unreliable (antd sometimes rebuilt it, which reads as leaving it).
export function LockedAmountInput({ value, onChange, "aria-label": label, currency, onCommit }: LockedAmountInputProps) {
  // Disabled with the form around it (a quote whose prices are closed): shown, never opened.
  const { componentDisabled: disabled } = ConfigProvider.useConfig();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // The amount when editing began, which Esc puts back.
  const before = useRef(value);
  // Set when the input is left by Enter / Esc, so the locked view takes the keyboard focus back.
  const refocus = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  // Set by Esc: that edit is given back, not done.
  const cancelled = useRef(false);
  // The amount last typed, read when the edit is done (the prop may not have caught up yet).
  const typed = useRef(value);
  // Set while the locked view takes the focus back after Enter / Esc, which must not open it again.
  const returning = useRef(false);
  // Set while the locked view has the focus from a click: a stray click and typing must not open it.
  const clicked = useRef(false);

  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    // Only where nothing else took it meanwhile (e.g. a dialog the edit opened).
    if (!document.activeElement || document.activeElement === document.body) {
      returning.current = true;
      box.current?.focus();
      returning.current = false;
    }
  }, [editing]);

  const startEditing = () => {
    before.current = value;
    typed.current = value;
    cancelled.current = false;
    setEditing(true);
  };

  const requestEdit = () => {
    if (disabled || editing || confirming) return;
    if (value) setConfirming(true);
    else startEditing();
  };

  if (editing) {
    return (
      // Width needs "!": antd's own input-number width is unlayered CSS and would win over a plain utility.
      <InputNumber
        size="small"
        className="!w-full"
        aria-label={label}
        autoFocus
        controls={false}
        min={0}
        precision={2}
        parser={moneyInputParser}
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(v) => {
          typed.current = v ?? 0;
          onChange(v ?? 0);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== "Escape") return;
          // Esc gives the amount back as it was; Enter keeps what was typed.
          if (e.key === "Escape") {
            cancelled.current = true;
            onChange(before.current);
          }
          refocus.current = true;
          e.currentTarget.blur();
        }}
        onBlur={() => {
          setEditing(false);
          if (!cancelled.current) onCommit?.(typed.current, before.current);
        }}
      />
    );
  }

  return (
    <>
      <div
        ref={box}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-label={disabled ? `${label}: ${value.toFixed(2)}` : `${label}: ${value.toFixed(2)}, double-click to change`}
        title={disabled ? undefined : "Double-click to change"}
        // Looks like the small input it stands for; no text selection on the double-click.
        className={`flex items-center h-6 w-full px-[7px] rounded-md border border-slate-200 text-sm tabular-nums cursor-default select-none ${
          disabled ? "bg-slate-50 text-slate-400" : "bg-white hover:border-slate-300"
        }`}
        onDoubleClick={requestEdit}
        // Tabbed to (a keyboard focus, not a click), a 0.00 opens at once with the amount selected,
        // so it is typed over like the fields beside it.
        onPointerDown={() => {
          clicked.current = true;
        }}
        onFocus={() => {
          if (!value && !returning.current && !clicked.current) requestEdit();
        }}
        onBlur={() => {
          clicked.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") return requestEdit();
          // An amount already there: typing a figure over it asks first, as a double-click does.
          if (!clicked.current && /^[0-9.,]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) requestEdit();
        }}
      >
        {value.toFixed(2)}
      </div>
      <ConfirmModal
        open={confirming}
        title="Change this amount?"
        description={`The line already has ${currency ? fmtMoney(value, currency) : value.toFixed(2)}. Do you really want to change it?`}
        confirmLabel="Change"
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          startEditing();
        }}
      />
    </>
  );
}
