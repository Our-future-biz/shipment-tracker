"use client";

import Link from "next/link";
import { ArrowLeftOutlined } from "@ant-design/icons";
import type { GateMovement } from "@/hooks/useGateLog";
import type { interfaces } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import { TERMS, directionOfVisit } from "../../_lib/glossary";
import { Badge, CUSTOMS_STATUS_TONE, STATUS_TONE, nf } from "../../gate-log/_lib/gate";
import { wm, type CargoTotals } from "../../_lib/cargoCompare";
import { StorageLine } from "../../_lib/storageText";

// Block A — who and where: the WCZ ref (opens the gate job), job no., customer, warehouse status,
// customs, days in the warehouse with the free time left, and the chargeable W/M.
export function HeaderStrip({
  task,
  m,
  shipment,
  remeasured,
  onBack,
}: {
  task: interfaces.WarehouseTaskItem;
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
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-[13px] font-semibold text-slate-900 mt-0.5 break-words">{value}</div>
    </div>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <button onClick={onBack} aria-label="Back to the worklist" className="text-slate-400 hover:text-indigo-500 cursor-pointer bg-transparent border-none p-1">
            <ArrowLeftOutlined />
          </button>
          {m ? (
            <Link href={`/warehouse/gate-log/${m.id}`} className="font-mono text-[18px] font-bold text-indigo-600 hover:underline" title="Open the gate job">
              {ref}
            </Link>
          ) : (
            <span className="font-mono text-[18px] font-bold text-slate-800">{ref}</span>
          )}
        </div>
        {item(
          TERMS.jobNo,
          jobNo ? (
            task.shipmentId ? (
              <Link href={`/shipments/${task.shipmentId}`} className="font-mono text-indigo-500 hover:underline">
                {jobNo}
              </Link>
            ) : (
              <span className="font-mono">{jobNo}</span>
            )
          ) : (
            <span className="text-slate-300">{task.shipmentId ? "—" : "stand-alone"}</span>
          ),
        )}
        {item("Customer", customer || <span className="text-slate-300">—</span>)}
        {m && item(TERMS.direction, directionOfVisit(m.visit))}
        {item(TERMS.warehouseStatus, m ? <Badge tone={STATUS_TONE[m.status] ?? ""}>{m.status}</Badge> : <span className="text-slate-300">no gate record</span>)}
        {item(
          "Customs",
          m?.customsStatus ? <Badge tone={CUSTOMS_STATUS_TONE[m.customsStatus] ?? ""}>{m.customsStatus}</Badge> : <span className="text-slate-300">Not set</span>,
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
