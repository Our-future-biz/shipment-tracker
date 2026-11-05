import type { ReactNode } from "react";
import { PILL_CLASS } from "./Pill";

// Badge tones: g green · a amber · r red · b blue · i indigo · "" grey.
export type Tone = "g" | "a" | "r" | "b" | "i" | "";

// The tones of Pill, so a badge and a pill side by side are one kind of mark.
const TONE_CLASS: Record<Tone, string> = {
  g: "bg-emerald-100 text-emerald-700",
  a: "bg-amber-100 text-amber-700",
  r: "bg-red-100 text-red-700",
  b: "bg-sky-100 text-sky-700",
  i: "bg-indigo-100 text-indigo-700",
  "": "bg-slate-100 text-slate-600",
};

// A status mark of the Warehouse and Trucking screens ("Released", "Internal"), in the shape of every pill (PILL_CLASS).
export function Badge({ tone = "", children, className = "", onClick, title }: { tone?: Tone; children: ReactNode; className?: string; onClick?: () => void; title?: string }) {
  return (
    <span
      title={title}
      onClick={onClick}
      className={`${PILL_CLASS} ${TONE_CLASS[tone]} ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </span>
  );
}
