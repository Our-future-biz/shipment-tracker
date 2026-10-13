"use client";

import type { ReactNode } from "react";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";

export type SectionStatus = "empty" | "in-progress" | "completed";

const STATUS_LABEL: Record<SectionStatus, string> = { completed: "Completed", "in-progress": "In progress", empty: "Not completed" };

// How far a step is, at a glance: a green tick once it is complete, a red cross until then.
function StepMark({ status }: { status: SectionStatus }) {
  const done = status === "completed";
  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[status]}
      title={STATUS_LABEL[status]}
      className={`shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-full text-white ${done ? "bg-green-500" : "bg-red-500"}`}
    >
      {done ? <CheckOutlined className="text-[10px]" /> : <CloseOutlined className="text-[10px]" />}
    </span>
  );
}

export interface QuoteStep {
  key: string;
  title: string;
  status: SectionStatus;
}

// The steps of the quote form as one row of tiles above it: each shows with a tick or a cross whether its step is complete, and a
// click shows that step under the row. One step is on screen at a time.
export function QuoteStepTiles({ steps, active, onSelect }: { steps: QuoteStep[]; active: string; onSelect: (key: string) => void }) {
  return (
    <div role="tablist" aria-label="Steps of the quote" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {steps.map((step) => {
        const selected = step.key === active;
        return (
          <button
            key={step.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(step.key)}
            className={`flex items-center gap-2 min-w-0 rounded-xl border px-3.5 py-3 text-left cursor-pointer transition-colors ${
              selected ? "border-indigo-500 bg-indigo-50 shadow-sm" : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40"
            }`}
          >
            <StepMark status={step.status} />
            <span className="min-w-0 truncate text-[12px] font-bold uppercase tracking-wide text-slate-800" title={step.title}>
              {step.title}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// The step that is on screen: the app's section card with the step's title and what it holds.
export function QuoteSection({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <SectionCard title={title} extra={<span className="text-xs text-slate-500">{subtitle}</span>}>
      {children}
    </SectionCard>
  );
}
