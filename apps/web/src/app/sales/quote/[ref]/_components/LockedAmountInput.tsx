"use client";

import { useEffect, useRef, useState } from "react";
import { InputNumber } from "antd";
import { ConfirmModal } from "@/components/ConfirmModal";
import { fmtMoney, moneyInputParser } from "@/lib/money";

interface LockedAmountInputProps {
  value: number;
  onChange: (value: number) => void;
  "aria-label": string;
  // The line's currency, for the question before an amount is changed.
  currency?: string;
}

// An amount that a stray click and typing cannot change. Locked, it is shown, not an input; a
// double-click (or Enter) puts a fresh input there, focused with the amount selected, which goes
// back to the locked view once it is left or Enter pressed; Esc puts the old amount back. An
// amount already there is changed only after the user confirms it.
// The locked view is no read-only input on purpose: switching an input that has the caret between
// read-only and editable was unreliable (antd sometimes rebuilt it, which reads as leaving it).
export function LockedAmountInput({ value, onChange, "aria-label": label, currency }: LockedAmountInputProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // The amount when editing began, which Esc puts back.
  const before = useRef(value);
  // Set when the input is left by Enter / Esc, so the locked view takes the keyboard focus back.
  const refocus = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    box.current?.focus();
  }, [editing]);

  const startEditing = () => {
    before.current = value;
    setEditing(true);
  };

  const requestEdit = () => {
    if (editing || confirming) return;
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
        onChange={(v) => onChange(v ?? 0)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== "Escape") return;
          // Esc gives the amount back as it was; Enter keeps what was typed.
          if (e.key === "Escape") onChange(before.current);
          refocus.current = true;
          e.currentTarget.blur();
        }}
        onBlur={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      <div
        ref={box}
        role="button"
        tabIndex={0}
        aria-label={`${label}: ${value.toFixed(2)}, double-click to change`}
        title="Double-click to change"
        // Looks like the small input it stands for; no text selection on the double-click.
        className="flex items-center h-6 w-full px-[7px] rounded-md border border-slate-200 bg-white text-sm tabular-nums cursor-default select-none hover:border-slate-300"
        onDoubleClick={requestEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") requestEdit();
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
