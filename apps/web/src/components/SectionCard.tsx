"use client";

import type { ReactNode } from "react";

// White card with the app's indigo section header, as used on the shipment detail tabs.
export function SectionCard({
  title,
  extra,
  children,
  bodyClassName = "p-4",
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm min-w-0">
      <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
        <h3 className="min-w-0 truncate text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0" title={title}>
          {title}
        </h3>
        {extra && <div className="ml-auto shrink-0 flex items-center gap-2">{extra}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

// Row of pill-shaped sub-tabs.
export function PillTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(t.key)}
            className={[
              "flex items-center h-8 px-3 rounded-lg border text-[13px] font-medium transition-colors cursor-pointer",
              on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
