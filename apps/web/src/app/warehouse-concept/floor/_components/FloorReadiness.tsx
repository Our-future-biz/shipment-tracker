"use client";

import { CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled } from "@ant-design/icons";
import type { GateMovement } from "@/hooks/useGateLog";
import { TERMS } from "@/app/warehouse-concept/_lib/glossary";
import { Badge } from "@/app/warehouse-concept/gate-log/_lib/gate";
import { waitingGates } from "@/app/warehouse-concept/gate-log/_lib/steps";
import { releaseState } from "@/app/warehouse-concept/gate-log/_components/job/ReleaseGatesPanel";
import { useFloorQueue } from "../_lib/useFloorQueue";
import { FloorCard, NeedsConnection } from "./floorUi";
import { FloorBack } from "./FloorBack";

const ICON = {
  OK: <CheckCircleFilled className="text-[18px] text-emerald-500" />,
  Pending: <ClockCircleOutlined className="text-[18px] text-amber-500" />,
  Blocked: <CloseCircleFilled className="text-[18px] text-red-500" />,
};

// Release readiness, read only: the release gates as the gate job shows them (released, refused,
// on hold, clear, blocked and what it waits for). Ticking lines, Refuse and the supervisor
// override stay on the gate job; the WH release itself needs a connection.
export function FloorReadiness({ m, onBack }: { m: GateMovement; onBack: () => void }) {
  const q = useFloorQueue();
  const state = releaseState(m);
  const waiting = waitingGates(m);
  return (
    <div className="flex flex-col gap-4">
      <FloorBack onBack={onBack} title="Release readiness" />
      <FloorCard title={TERMS.releaseGates}>
        <Badge tone={state.tone} className="!text-[14px]">
          {state.label}
        </Badge>
        {state.detail && <div className="mt-1 text-[14px] text-slate-600 break-words">{state.detail}</div>}
        {!m.impRelease && waiting.length > 0 && <div className="mt-2 text-[14px] text-slate-700">Waiting for: {waiting.join(", ")}</div>}
        <ul className="m-0 mt-3 list-none border-t border-slate-100 p-0">
          {m.releaseGates.map((g) => (
            <li key={g.g} className="flex min-h-[44px] items-center gap-3 border-b border-slate-100 py-1 last:border-b-0">
              {ICON[g.s]}
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">{g.g}</div>
                {g.note && g.note !== "—" && <div className="text-[13px] text-slate-500 break-words">{g.note}</div>}
              </div>
              <span className="text-[13px] text-slate-500">{g.s}</span>
            </li>
          ))}
          {m.releaseGates.length === 0 && <li className="py-2 text-[14px] text-slate-400">No release gates on this movement.</li>}
        </ul>
      </FloorCard>
      {!m.impRelease && !q.online && <NeedsConnection what={TERMS.whRelease} />}
      <p className="m-0 text-[13px] text-slate-500">Ticking release gates, Refuse and the supervisor override are on the full gate job.</p>
    </div>
  );
}
