"use client";

import { CheckCircleFilled } from "@ant-design/icons";
import type { interfaces } from "@/lib/api/client";
import { formatDate, formatDateTime } from "@/lib/date";
import { isDayOnly, lifecycleText, stageLabel, stageTone } from "../_lib/lifecycle";
import { Badge } from "../gate-log/_lib/gate";

// The position's in-and-out lifecycle (derived by the server from its stamps, the stripping tally
// and the stuffing): a chip for grids and headers, and a strip of every step with its time.

type Lifecycle = interfaces.GatePositionLifecycle;

const when = (at: string | null) => (!at ? "" : isDayOnly(at) ? formatDate(at) : formatDateTime(at));

export function LifecycleChip({ l, className = "" }: { l: Lifecycle | null | undefined; className?: string }) {
  if (!l) return <span className="text-slate-300">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title={l.at ? `Since ${when(l.at)}` : undefined}>
      <Badge tone={stageTone(l.stage)}>{stageLabel(l.stage, l.label)}</Badge>
      {l.refused && <Badge tone="r">Refused</Badge>}
    </span>
  );
}

export function LifecycleStrip({ l, large }: { l: Lifecycle | null | undefined; large?: boolean }) {
  // A record from an API without the lifecycle yet (before its restart) shows no strip.
  if (!l?.steps) return null;
  return (
    <ol className="m-0 flex list-none flex-wrap items-stretch gap-1.5 p-0" aria-label={`Lifecycle: ${lifecycleText(l)}`}>
      {l.steps.map((s) => {
        const current = s.stage === l.stage;
        return (
          <li
            key={s.stage}
            aria-current={current ? "step" : undefined}
            className={[
              "flex min-w-[96px] flex-col rounded-lg border px-2.5 py-1.5",
              current ? "border-indigo-400 bg-indigo-50" : s.done ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white",
            ].join(" ")}
          >
            <span className={`flex items-center gap-1 font-semibold ${large ? "text-[14px]" : "text-[11.5px]"} ${s.done ? "text-slate-900" : "text-slate-400"}`}>
              {s.done && <CheckCircleFilled className="text-emerald-500 text-[11px]" />}
              {s.label}
            </span>
            <span className={`font-mono ${large ? "text-[12px]" : "text-[10.5px]"} ${s.done ? "text-slate-500" : "text-slate-300"}`}>{s.done ? when(s.at) || "✓" : "—"}</span>
          </li>
        );
      })}
      {l.refused && (
        <li className="flex items-center">
          <Badge tone="r">Refused</Badge>
        </li>
      )}
    </ol>
  );
}
