"use client";

import Link from "next/link";
import type { GateMovement } from "@/hooks/useGateLog";
import { Badge } from "../../gate-log/_lib/gate";
import { ExceptionList } from "../../gate-log/_components/job/ExceptionsPanel";
import { Card } from "../tabs/shared";

// Block E — damage / short / over found on this cargo (read-only here; recorded and resolved on
// the gate job), with links to their photos.
export function ExceptionsBlock({ m }: { m: GateMovement | undefined }) {
  const open = m?.openExceptions ?? 0;
  return (
    <Card
      title="Exceptions"
      extra={
        m && (
          <>
            {open > 0 ? <Badge tone={m.impRelease ? "a" : "r"}>{m.impRelease ? `${open} open (already released)` : `On hold — ${open} open`}</Badge> : null}
            <Link href={`/warehouse/gate-log/${m.id}?tab=survey`} className="text-indigo-500 hover:underline">
              Record or resolve on the gate job
            </Link>
          </>
        )
      }
    >
      {m ? <ExceptionList m={m} /> : <div className="text-xs text-slate-400">No gate record for this position yet.</div>}
    </Card>
  );
}
