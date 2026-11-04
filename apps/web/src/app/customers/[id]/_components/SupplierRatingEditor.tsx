"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Button, Input } from "antd";
import { RATING_MEANINGS, reasonRequired } from "../../_lib/supplierRatingScale";

interface SupplierRatingEditorProps {
  rating: number | null;
  reason: string;
  saving: boolean;
  onSave: (rating: number, reason: string) => void;
  onClear: () => void;
  onCancel: () => void;
}

const MAX_REASON = 300;

// Picking a rating: six choices, 0 ("the worst") and 1–5 stars. The arrow keys move the choice and
// nothing is saved until Save, so one Save is one recorded change. What the choice means shows under it.
export function SupplierRatingEditor({ rating, reason: savedReason, saving, onSave, onClear, onCancel }: SupplierRatingEditorProps) {
  const [picked, setPicked] = useState<number | null>(rating);
  const [reason, setReason] = useState(savedReason);
  const meaning = picked === null ? null : RATING_MEANINGS[picked];
  const needsReason = reasonRequired(picked);
  const canSave = picked !== null && (!needsReason || !!reason.trim()) && !saving;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.min(5, Math.max(0, (picked ?? (step > 0 ? -1 : 6)) + step));
    setPicked(next);
    (e.currentTarget.querySelector(`[data-stars="${next}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div className="flex w-[340px] max-w-full flex-col gap-3">
      <div role="radiogroup" aria-label="Rating" className="flex flex-wrap gap-1.5" onKeyDown={handleKeyDown}>
        {RATING_MEANINGS.map(({ stars }) => {
          const on = picked === stars;
          return (
            <button
              key={stars}
              type="button"
              role="radio"
              aria-checked={on}
              data-stars={stars}
              // One stop in the tab order: the picked choice, or the first one.
              tabIndex={on || (picked === null && stars === 0) ? 0 : -1}
              onClick={() => setPicked(stars)}
              className={[
                "h-8 cursor-pointer rounded-lg border px-2.5 text-[13px] tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500",
                on ? "border-amber-400 bg-amber-50 font-semibold text-slate-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              ].join(" ")}
            >
              {stars === 0 ? "0 · worst" : <><span className="text-amber-500" aria-hidden>★</span> {stars}</>}
            </button>
          );
        })}
      </div>
      <p className="m-0 min-h-[36px] text-[12px] leading-snug text-slate-500" aria-live="polite">
        {meaning ? (
          <>
            <span className="font-semibold text-slate-700">
              {meaning.stars} · {meaning.title}:
            </span>{" "}
            {meaning.text}
          </>
        ) : (
          "Pick how good this supplier is, from 0 (the worst) to 5 stars."
        )}
      </p>
      <Input.TextArea
        aria-label="Reason"
        rows={3}
        maxLength={MAX_REASON}
        showCount
        placeholder={needsReason ? "Why? Needed for 0–2 stars: it warns whoever picks this supplier next" : "Why? (optional)"}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        status={needsReason && !reason.trim() ? "warning" : undefined}
      />
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="primary" size="small" disabled={!canSave} loading={saving} onClick={() => picked !== null && onSave(picked, reason.trim())}>
          Save
        </Button>
        <Button size="small" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        {rating !== null && (
          <button type="button" disabled={saving} onClick={onClear} className="ml-auto cursor-pointer border-0 bg-transparent p-0 text-[12px] text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50">
            Clear rating
          </button>
        )}
      </div>
    </div>
  );
}
