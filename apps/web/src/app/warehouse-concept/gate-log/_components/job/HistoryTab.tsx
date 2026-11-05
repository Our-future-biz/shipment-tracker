"use client";

import { useMemo, useState } from "react";
import { Tooltip } from "antd";
import { HistoryOutlined } from "@ant-design/icons";
import type { GateMovement } from "@/hooks/useGateLog";
import { formatDate } from "@/lib/date";
import { Badge, hhmm, type Tone } from "../../_lib/gate";
import { HISTORY_CATEGORIES, categoryCounts, historyDays, isCurrentStamp, type HistoryCategory } from "../../_lib/history";
import { gateSteps, voidBlocked, type GateStep } from "../../_lib/steps";
import { btnInline, Section } from "./fields";
import { GateSendAgain } from "./GateSendAgain";
import { HINT, LABEL_TEXT } from "@/styles/ui";

// A filter chip, in the shape and colours of the app's pill sub-tabs (PillTabs); several can be on.
const chip = (on: boolean) =>
  `flex items-center gap-1 h-8 px-3 rounded-lg border text-[13px] font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
    on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
  }`;

// History of the gate job: every logged event, newest first, by Prague day — stamps, voids with
// their reasons, release-gate ticks, PIN checks, overrides, refusals, exceptions, archive /
// restore, labels, shipment updates and Shipment Details saves. Filter by kind of event. A
// manager can void a stamp that is still current from here (the same manager-only void, with a
// reason, as on the step bar).

const CATEGORY_TONE: Record<HistoryCategory, Tone> = {
  stamps: "b",
  voids: "r",
  release: "i",
  exceptions: "a",
  cargo: "g",
  shipment: "",
  records: "",
};
const CATEGORY_LABEL = Object.fromEntries(HISTORY_CATEGORIES.map((c) => [c.id, c.label])) as Record<HistoryCategory, string>;

export function HistoryTab({ m, onVoid, manager = false }: { m: GateMovement; onVoid?: (step: GateStep) => void; manager?: boolean }) {
  const [only, setOnly] = useState<HistoryCategory[]>([]);
  const counts = useMemo(() => categoryCounts(m.events), [m.events]);
  const days = useMemo(() => historyDays(m.events, only), [m.events, only]);
  const steps = gateSteps(m);
  const toggle = (c: HistoryCategory) => setOnly((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  const upd = m.shipmentUpdate;

  return (
    <Section title="History" icon={<HistoryOutlined />} extra={`${m.events.length} event${m.events.length === 1 ? "" : "s"}`}>
      <div role="group" aria-label="Filter by kind of event" className="flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          aria-pressed={!only.length}
          onClick={() => setOnly([])}
          className={chip(!only.length)}
        >
          All <span className="tabular-nums text-slate-500">{m.events.length}</span>
        </button>
        {HISTORY_CATEGORIES.map((c) => {
          const on = only.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              disabled={!counts[c.id]}
              onClick={() => toggle(c.id)}
              className={chip(on)}
            >
              {c.label} <span className="tabular-nums text-slate-500">{counts[c.id]}</span>
            </button>
          );
        })}
      </div>

      {/* What failed for good (shipment updates, events for Trucking): managers send it again. */}
      {(!only.length || only.includes("shipment")) && <GateSendAgain movementId={m.id} manager={manager} />}

      {/* The shipment update the gate still owes, live (not an event yet). */}
      {upd && (!only.length || only.includes("shipment")) && (
        <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${upd.state === "failed" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
          <span className="font-semibold">Now: shipment update {upd.state === "failed" ? "failed" : "retrying"}</span> — {upd.what.join(", ") || "warehouse dates"}
          {upd.attempts ? ` · ${upd.attempts} ${upd.attempts === 1 ? "try" : "tries"}` : ""}
          {upd.lastError ? ` · ${upd.lastError}` : ""}
        </div>
      )}

      {days.length === 0 ? (
        <div className={HINT}>{m.events.length ? "No events of this kind." : "Nothing logged yet."}</div>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map((d) => (
            <div key={d.day}>
              <div className={`${LABEL_TEXT} mb-1`}>{/^\d{4}-/.test(d.day) ? formatDate(d.day) : d.day}</div>
              <ul className="list-none m-0 p-0 border-l-2 border-slate-100 pl-3">
                {d.events.map((e) => {
                  const step = onVoid && isCurrentStamp(m, e) ? steps.find((x) => x.kind === e.kind && x.state === "done") : undefined;
                  const blocked = step ? voidBlocked(m, step.kind) : null;
                  return (
                    <li key={`${e.index}`} className="py-1.5 text-[13px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="tabular-nums text-slate-400 w-[42px] shrink-0">{hhmm(e.at)}</span>
                      <Badge tone={CATEGORY_TONE[e.category]}>{CATEGORY_LABEL[e.category]}</Badge>
                      <span className="font-semibold text-slate-900">{e.label}</span>
                      {e.by && <span className="text-slate-500">· {e.by}</span>}
                      {step && (
                        <Tooltip title={blocked ?? undefined}>
                          <span className="inline-flex ml-auto">
                            <button type="button" className={btnInline} disabled={!!blocked} onClick={() => onVoid!(step)}>
                              Void this stamp…
                            </button>
                          </span>
                        </Tooltip>
                      )}
                      {e.detail && <div className={`basis-full pl-[50px] ${HINT} whitespace-pre-wrap break-words`}>{e.detail}</div>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
