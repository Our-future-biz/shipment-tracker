"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import type { GateMovement } from "@/hooks/useGateLog";
import { TERMS, directionOf } from "@/app/warehouse/_lib/glossary";
import { expectedBecause, expectedSortKey, isExpectedToday, pragueToday } from "@/app/warehouse/_lib/worklist";
import { Badge, VISIT_TONE, nf } from "../_lib/gate";

// Gate Log: positions expected at the gate today (Prague date) by ETA, dock slot or ETA warehouse,
// not arrived yet, earliest dock slot first. Click one to open its job.
export function ExpectedTodayPanel({ movements }: { movements: GateMovement[] }) {
  const today = pragueToday();
  const list = useMemo(
    () => movements
        .filter((m) => isExpectedToday(m, today))
        .sort((a, b) => expectedSortKey(a, today).localeCompare(expectedSortKey(b, today)) || (a.positionRef || a.gateRef).localeCompare(b.positionRef || b.gateRef)),
    [movements, today],
  );
  const [open, setOpen] = useState(true);

  return (
    <section className="mt-4 bg-white border border-slate-200 rounded-xl shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-transparent border-none cursor-pointer text-left"
      >
        {open ? <DownOutlined className="text-[10px] text-slate-400" /> : <RightOutlined className="text-[10px] text-slate-400" />}
        <span className="text-[13px] font-bold uppercase tracking-wider text-slate-800">Expected today</span>
        <span className="text-[13px] font-bold tabular-nums text-indigo-600">{list.length}</span>
        <span className="ml-auto text-[11px] text-slate-400">by ETA, dock slot or ETA warehouse · not arrived yet</span>
      </button>
      {open && (
        <div className="border-t border-slate-100">
          {list.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-400">Nothing expected today.</div>
          ) : (
            <ul className="list-none m-0 p-0 max-h-[260px] overflow-y-auto">
              {list.map((m) => (
                <li key={m.id} className="border-b border-slate-100 last:border-b-0">
                  <Link href={`/warehouse/gate-log/${m.id}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-4 py-2 text-xs hover:bg-slate-50">
                    <span className="font-mono font-bold text-indigo-500 w-[130px]">{m.positionRef || m.gateRef}</span>
                    <span className="text-slate-800 font-medium min-w-[160px]">{m.customer || "—"}</span>
                    <Badge tone={VISIT_TONE[m.visit] ?? ""}>{directionOf(m)}</Badge>
                    <span className="text-slate-500">{expectedBecause(m, today)}</span>
                    <span className="ml-auto text-slate-500 tabular-nums">
                      {m.colli ? `${nf(m.colli)} ${TERMS.pieces.toLowerCase()}` : ""}
                      {m.plate ? <span className="ml-3 font-mono">{m.plate}</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
