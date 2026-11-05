"use client";

import type { ReactNode } from "react";
import { CARD, CARD_BAR, CARD_TITLE } from "@/styles/ui";

// Building blocks of floor mode: made for a phone held in one hand — touch targets at least
// 48 px, large text, one thing per row. The buttons are the app's (styles/ui.ts) in colour,
// corners and states, only taller and in a larger type for a thumb; cards are the app's CARD.

export const bigPrimary =
  "w-full min-h-[56px] rounded-xl border-none bg-indigo-600 px-4 text-[16px] font-semibold text-white hover:bg-indigo-700 active:bg-indigo-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";
export const bigDanger =
  "w-full min-h-[56px] rounded-xl border-none bg-red-600 px-4 text-[16px] font-semibold text-white hover:bg-red-700 active:bg-red-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";
export const bigDefault =
  "w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 text-[14px] font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";
// The same buttons on a link: "!" keeps their text colour, which antd's <App> otherwise paints
// indigo on every <a> in unlayered CSS.
export const bigPrimaryLink = `${bigPrimary} flex items-center justify-center !text-white hover:!text-white`;
export const bigDefaultLink = `${bigDefault} flex items-center justify-center !text-slate-700 hover:!text-slate-700`;

export function FloorCard({ title, extra, children }: { title?: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className={CARD}>
      {title && (
        <div className={`${CARD_BAR} rounded-t-xl`}>
          <h2 className={CARD_TITLE}>{title}</h2>
          {extra && <div className="ml-auto">{extra}</div>}
        </div>
      )}
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** A toggle chip (packing, condition flags, photo tag). */
export function Chip({ on, onClick, children, tone = "indigo" }: { on: boolean; onClick: () => void; children: ReactNode; tone?: "indigo" | "red" }) {
  const onClass = tone === "red" ? "border-red-500 bg-red-50 text-red-700" : "border-indigo-500 bg-indigo-50 text-indigo-700";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-[44px] rounded-full border px-4 text-[14px] font-semibold cursor-pointer ${on ? onClass : "border-slate-300 bg-white text-slate-700"}`}
    >
      {children}
    </button>
  );
}

/** − value + with 48 px buttons; the value can also be typed. */
export function Stepper({ label, value, onChange, min = 0, max }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const clamp = (v: number) => Math.max(min, max != null && max > 0 ? Math.min(max, v) : v);
  const btn = "w-12 h-12 shrink-0 rounded-xl border border-slate-300 bg-white text-[22px] font-bold text-slate-700 active:bg-slate-100 cursor-pointer disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-[14px] font-semibold text-slate-900">{label}</span>
      <button type="button" className={btn} aria-label={`${label}: one less`} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        className="w-16 h-12 rounded-xl border border-slate-300 text-center text-[20px] font-bold text-slate-900 tabular-nums"
        value={String(value)}
        onChange={(e) => onChange(clamp(Number(e.target.value.replace(/\D/g, "")) || 0))}
      />
      <button type="button" className={btn} aria-label={`${label}: one more`} disabled={max != null && max > 0 && value >= max} onClick={() => onChange(clamp(value + 1))}>
        +
      </button>
    </div>
  );
}

/** Says an action needs the server's answer and the phone is offline. */
export function NeedsConnection({ what }: { what: string }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[14px] font-semibold text-amber-700">{what} needs a connection — try again when the phone is back online.</div>;
}
