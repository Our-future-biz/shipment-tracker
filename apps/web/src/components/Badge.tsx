import type { ReactNode } from "react";

// Badge tones: g green · a amber · r red · b blue · i indigo · "" grey.
export type Tone = "g" | "a" | "r" | "b" | "i" | "";

const TONE_CLASS: Record<Tone, string> = {
  g: "bg-emerald-50 text-green-700",
  a: "bg-orange-50 text-orange-700",
  r: "bg-red-50 text-red-700",
  b: "bg-blue-50 text-blue-700",
  i: "bg-indigo-50 text-indigo-600",
  "": "bg-gray-100 text-gray-600",
};

// A small square-cornered status mark of the Warehouse and Trucking screens ("Released", "Internal").
export function Badge({ tone = "", children, className = "", onClick, title }: { tone?: Tone; children: ReactNode; className?: string; onClick?: () => void; title?: string }) {
  return (
    <span
      title={title}
      onClick={onClick}
      className={`inline-block whitespace-nowrap rounded-[5px] px-2 py-[2.5px] text-[10.5px] font-semibold tracking-[.1px] ${TONE_CLASS[tone]} ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </span>
  );
}
