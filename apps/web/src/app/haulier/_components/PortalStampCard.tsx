"use client";

import { useState } from "react";
import { apiErrorMessage } from "@/lib/api";
import { businessDateTime } from "@/lib/date";
import { STAMP_LABEL, stampAt, stampKinds, stampProblem, type PortalOrder, type PortalStampKind } from "../_lib/portal";
import { PORTAL_PRIMARY, PORTAL_SECONDARY } from "../_lib/portalStyles";
import { Bi } from "./Bi";
import { PortalCard } from "./PortalCard";

interface PortalStampCardProps {
  order: PortalOrder;
  /** When the order was last read: a server refusal holds until the order is read again. */
  loadedAt: number;
  stampingKind: PortalStampKind | null | undefined;
  onStamp: (kind: PortalStampKind) => Promise<unknown>;
}

// Picked up / Departed / Arrived, each once and now. A button that cannot be pressed says why: from
// the order itself, or the server's own sentence after it refused (e.g. the goods are not gated in yet).
export const PortalStampCard = ({ order, loadedAt, stampingKind, onStamp }: PortalStampCardProps) => {
  const [refusals, setRefusals] = useState<Partial<Record<PortalStampKind, { text: string; loadedAt: number }>>>({});
  const kinds = stampKinds(order.kind);
  if (kinds.length === 0) return null;

  const handleStamp = async (kind: PortalStampKind) => {
    try {
      await onStamp(kind);
    } catch (e) {
      setRefusals((r) => ({ ...r, [kind]: { text: apiErrorMessage(e), loadedAt } }));
    }
  };

  return (
    <PortalCard title={<Bi text={{ cs: "Průběh jízdy", en: "Trip progress" }} />}>
      <div className="flex flex-col gap-2">
        {kinds.map((kind) => {
          const problem = stampProblem(order, kind, businessDateTime);
          const refusal = refusals[kind]?.loadedAt === loadedAt ? refusals[kind]?.text : null;
          const done = !!stampAt(order.stamps, kind);
          return (
            <div key={kind}>
              <button
                type="button"
                disabled={!!problem || !!refusal || !!stampingKind}
                onClick={() => handleStamp(kind)}
                className={done ? PORTAL_SECONDARY : PORTAL_PRIMARY}
              >
                {done && "✓ "}
                <Bi text={STAMP_LABEL[kind]} />
                {stampingKind === kind && " …"}
              </button>
              {(problem || refusal) && (
                <p className={`mb-0 mt-1 text-[13px] ${done ? "text-slate-500" : "text-amber-700"}`}>{problem ? <Bi text={problem} /> : refusal}</p>
              )}
            </div>
          );
        })}
      </div>
    </PortalCard>
  );
};
