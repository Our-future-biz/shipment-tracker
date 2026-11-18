"use client";

import { Fragment } from "react";

// The counted tab strip in a Finance page's bar (Accounts Payable, Accounts Receivable): each tab with its count in a
// pill (none while the counts load), an optional thin divider before a tab.

export interface CountedTab<K extends string> {
  key: K;
  label: string;
  /** Shown in a pill beside the label; undefined shows none (counts not loaded yet) */
  count?: number;
  /** A thin divider before this tab */
  dividerBefore?: boolean;
}

export function CountedTabs<K extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: readonly CountedTab<K>[];
  active: K;
  onChange: (key: K) => void;
  /** The tablist's accessible name, e.g. the page's title */
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap items-center gap-1 self-stretch">
      {tabs.map((t) => {
        const on = active === t.key;
        const n = t.count;
        return (
          <Fragment key={t.key}>
            {t.dividerBefore && <span aria-hidden className="w-px h-5 bg-slate-200 mx-2" />}
            <button
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(t.key)}
              className={`flex items-center gap-2 h-full px-2 -mb-px bg-transparent border-0 border-b-2 cursor-pointer text-[13px] whitespace-nowrap transition-colors ${
                on ? "border-indigo-600 text-indigo-600 font-semibold" : "border-transparent text-slate-500 font-medium hover:text-slate-900"
              }`}
            >
              {t.label}
              {n !== undefined && (
                <span className={`rounded-full px-2 text-[11px] font-semibold leading-5 tabular-nums ${on ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>{n}</span>
              )}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
