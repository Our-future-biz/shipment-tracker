"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { GateMovement } from "@/hooks/useGateLog";
import { TERMS, directionOf } from "@/app/warehouse-concept/_lib/glossary";
import { expectedBecause, expectedSortKey, isExpectedToday, pragueToday } from "@/app/warehouse-concept/_lib/worklist";
import { Badge, VISIT_TONE, nf } from "../_lib/gate";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { HINT, REF } from "@/styles/ui";

// Gate Log: positions expected at the gate today (Prague date) by ETA, dock slot or ETA warehouse,
// not arrived yet, earliest dock slot first. Click one to open its job. A folding card of the app
// (SectionCard), open at first.
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
    <div className="mt-4">
      <SectionCard
        title="Expected today"
        extra={<CountChip count={list.length} />}
        bodyClassName=""
        fold={{ open, onToggle: () => setOpen(!open), subtitle: "by ETA, dock slot or ETA warehouse · not arrived yet" }}
      >
        {list.length === 0 ? (
          <div className={`px-4 py-3 ${HINT}`}>Nothing expected today.</div>
        ) : (
          <ul className="list-none m-0 p-0 max-h-[260px] overflow-y-auto">
            {list.map((m) => (
              <li key={m.id} className="border-b border-slate-100 last:border-b-0">
                <Link href={`/warehouse-concept/gate-log/${m.id}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-4 py-2 text-[13px] hover:bg-slate-50">
                  <span className={`${REF} font-bold text-indigo-600 w-[130px]`}>{m.positionRef || m.gateRef}</span>
                  <span className="text-slate-900 font-medium min-w-[160px]">{m.customer || "—"}</span>
                  <Badge tone={VISIT_TONE[m.visit] ?? ""}>{directionOf(m)}</Badge>
                  <span className="text-slate-500">{expectedBecause(m, today)}</span>
                  <span className="ml-auto text-slate-500 tabular-nums">
                    {m.colli ? `${nf(m.colli)} ${TERMS.pieces.toLowerCase()}` : ""}
                    {m.plate ? <span className="ml-3 tabular-nums">{m.plate}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
