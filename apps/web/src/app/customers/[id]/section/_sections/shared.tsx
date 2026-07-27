"use client";

import type { ReactNode } from "react";

export const SECTION_DEFS: { key: string; label: string }[] = [
  { key: "financial", label: "Financial" },
  { key: "credit", label: "Credit" },
  { key: "shipments", label: "Shipments" },
  { key: "quotes", label: "Quotes" },
  { key: "contacts", label: "Contacts" },
  { key: "documents", label: "Documents" },
  { key: "communication", label: "Communication" },
  { key: "payment", label: "Payment Terms" },
];

// Shared chart palette (recharts) used across section pages.
export const CHART_COLORS = {
  revenue: "#6366f1",
  cost: "#f97316",
  profit: "#16a34a",
  neutral: "#94a3b8",
  blue: "#3b82f6",
  amber: "#d97706",
  red: "#dc2626",
  green: "#16a34a",
  slate: "#64748b",
};

export function KpiCard({ label, value, tone }: { label: string; value: ReactNode; tone?: "red" | "green" | "amber" }) {
  const toneClass = tone === "red" ? "text-red-600" : tone === "green" ? "text-green-600" : tone === "amber" ? "text-amber-600" : "text-slate-800";
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
      <div className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold mt-0.5 ${toneClass}`}>{value}</div>
    </div>
  );
}

export function SectionCard({ title, extra, children }: { title?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      {(title || extra) && (
        <div className="flex items-center justify-between mb-3">
          {title && <span className="text-sm font-semibold text-slate-800">{title}</span>}
          {extra}
        </div>
      )}
      {children}
    </div>
  );
}
