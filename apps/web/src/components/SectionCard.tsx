"use client";

import { useId, type ReactNode } from "react";
import { DownOutlined, UpOutlined } from "@ant-design/icons";

// What a card that folds and one that does not have in common: the frame, the indigo header bar
// and the type of the title.
const CARD_CLASS = "bg-white border border-slate-200 rounded-xl shadow-sm min-w-0";
const HEADER_CLASS = "px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50";
const TITLE_CLASS = "text-[13px] font-bold text-slate-800 uppercase tracking-wider";

interface SectionCardProps {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  // Makes the card fold. Its header is then one button, so the card opens and closes with one
  // click or one key - and `extra`, which stands inside that button, holds no control of its own.
  fold?: {
    open: boolean;
    onToggle: () => void;
    // Before the title: the number of a step, a tick.
    leading?: ReactNode;
    // One grey line beside the title, which gives way where the header is narrow.
    subtitle?: string;
  };
}

// White card with the app's indigo section header, as used on the shipment detail tabs.
export function SectionCard({ title, extra, children, bodyClassName = "p-4", fold }: SectionCardProps) {
  const bodyId = useId();

  if (!fold) {
    return (
      <section className={CARD_CLASS}>
        <div className={`${HEADER_CLASS} border-b border-indigo-100 rounded-t-xl`}>
          <h3 className={`min-w-0 truncate ${TITLE_CLASS} m-0`} title={title}>
            {title}
          </h3>
          {extra && <div className="ml-auto shrink-0 flex items-center gap-2">{extra}</div>}
        </div>
        <div className={bodyClassName}>{children}</div>
      </section>
    );
  }

  return (
    <section className={CARD_CLASS}>
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={fold.open}
          aria-controls={bodyId}
          onClick={fold.onToggle}
          className={`w-full ${HEADER_CLASS} text-left cursor-pointer transition-colors hover:bg-indigo-100/70 ${
            fold.open ? "rounded-t-xl border-b border-indigo-100" : "rounded-xl"
          }`}
        >
          {fold.leading}
          <span className={`shrink-0 ${TITLE_CLASS}`}>{title}</span>
          <span className="flex-1 min-w-0 truncate text-xs font-normal text-slate-600">{fold.subtitle}</span>
          {extra && <span className="shrink-0 flex items-center gap-2">{extra}</span>}
          {/* The icon's own colour needs "!": antd gives icons `color: inherit` in unlayered CSS, which wins over a plain utility. */}
          {fold.open ? <UpOutlined className="shrink-0 text-[10px] !text-slate-500" /> : <DownOutlined className="shrink-0 text-[10px] !text-slate-500" />}
        </button>
      </h3>
      {/* A folded card keeps its content in the page but out of reach (inert): the Tab key goes
          through what is on screen only. */}
      <div id={bodyId} inert={!fold.open} className={`grid transition-[grid-template-rows] duration-300 ease-out ${fold.open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className={bodyClassName}>{children}</div>
        </div>
      </div>
    </section>
  );
}

interface CountChipProps {
  count: ReactNode;
}

// The count beside a card title, in the card's `extra`: how many rows the card holds ("12", "6 open").
export function CountChip({ count }: CountChipProps) {
  return (
    <span className="rounded-full bg-white border border-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-600 tabular-nums">
      {count}
    </span>
  );
}

interface PillTabsProps<K extends string> {
  tabs: readonly { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
}

// Row of pill-shaped sub-tabs. The key type follows the tabs, so a handler gets the exact key.
export function PillTabs<K extends string>({ tabs, active, onChange }: PillTabsProps<K>) {
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
