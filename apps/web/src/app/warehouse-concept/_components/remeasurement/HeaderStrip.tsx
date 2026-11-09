"use client";

import Link from "next/link";
import type { GateMovement } from "@/hooks/useGateLog";
import type { interfaces } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import { TERMS, directionOf } from "../../_lib/glossary";
import { Badge, CUSTOMS_STATUS_TONE, STATUS_TONE, nf } from "../../gate-log/_lib/gate";
import { wm, type CargoTotals } from "../../_lib/cargoCompare";
import { StorageLine } from "../../_lib/storageText";
import { CARD, EMPTY, LABEL_TEXT, LINK, MODAL_TITLE, REF } from "@/styles/ui";
import { BackButton } from "@/components/BackLink";

// Block A — who and where: the WCZ ref (opens the gate job), job no., customer, warehouse status,
// customs, days in the warehouse with the free time left, and the chargeable W/M.
export function HeaderStrip({
  task,
  m,
  shipment,
  remeasured,
  onBack,
}: {
  task: interfaces.WarehouseConceptTaskItem;
  m: GateMovement | undefined;
  shipment: interfaces.ShipmentItem | null;
  /** Saved remeasured totals, when there are any. */
  remeasured: CargoTotals | null;
  onBack: () => void;
}) {
  const ref = m?.positionRef || task.taskId;
  const jobNo = m?.jobNumber || shipment?.jobNumber || "";
  const customer = m?.customer || shipment?.customer || "";
  const gateWm = m ? wm({ kg: m.weightKg, cbm: m.measureCbm }) : 0;
  const remWm = remeasured ? wm(remeasured) : 0;
  const item = (label: string, value: React.ReactNode) => (
    <div className="min-w-0">
      <div className={LABEL_TEXT}>{label}</div>
      <div className="text-[13px] font-semibold text-slate-900 mt-0.5 break-words">{value}</div>
    </div>
  );

  return (
    <div className={`${CARD} px-4 py-3`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <BackButton onClick={onBack}>Worklist</BackButton>
          {m ? (
            <Link href={`/warehouse-concept/gate-log/${m.id}`} className={`${MODAL_TITLE} ${REF} ${LINK}`} title="Open the gate job">
              {ref}
            </Link>
          ) : (
            <span className={`${MODAL_TITLE} ${REF}`}>{ref}</span>
          )}
        </div>
        {item(
          TERMS.jobNo,
          jobNo ? (
            task.shipmentId ? (
              <Link href={`/shipments/${task.shipmentId}`} className={`${REF} ${LINK}`}>
                {jobNo}
              </Link>
            ) : (
              <span className={REF}>{jobNo}</span>
            )
          ) : (
            <span className={EMPTY}>{task.shipmentId ? "—" : "stand-alone"}</span>
          ),
        )}
        {item("Customer", customer || <span className={EMPTY}>—</span>)}
        {m && item(TERMS.direction, directionOf(m))}
        {item(TERMS.warehouseStatus, m ? <Badge tone={STATUS_TONE[m.status] ?? ""}>{m.status}</Badge> : <span className={EMPTY}>no gate record</span>)}
        {item(
          "Customs",
          m?.customsStatus ? <Badge tone={CUSTOMS_STATUS_TONE[m.customsStatus] ?? ""}>{m.customsStatus}</Badge> : <span className={EMPTY}>Not set</span>,
        )}
        {m && item("Storage", <StorageLine s={m.storage} />)}
        {item(
          "Chargeable W/M",
          <span className="tabular-nums">
            {gateWm ? nf(gateWm, 2) : "—"}
            {remeasured && Math.abs(remWm - gateWm) >= 0.005 && <span className="ml-1.5 text-amber-700">remeasured {nf(remWm, 2)}</span>}
          </span>,
        )}
        {m?.eta && m.status === "Expected" && item("ETA", formatDate(m.eta))}
      </div>
    </div>
  );
}
