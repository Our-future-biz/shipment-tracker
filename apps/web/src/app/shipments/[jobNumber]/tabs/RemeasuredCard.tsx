"use client";

import { useMemo, useState } from "react";
import { Tooltip } from "antd";
import { CheckCircleFilled, WarningOutlined } from "@ant-design/icons";
import type { ShipmentItem } from "@/hooks/useShipments";
import { SectionChangedError, useWarehouseSection } from "@/hooks/useWarehouseSection";
import { useRemeasureAcceptance } from "@/hooks/useRemeasureAcceptance";
import { useMessages } from "@/lib/toast";
import { apiErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/date";
import { SectionCard } from "@/components/SectionCard";
import { ConfirmModal } from "@/components/ConfirmModal";
import { BTN_BAR_PRIMARY, HINT } from "@/styles/ui";
import { TD_CELL, TH_CELL, TOTAL_CELL, rowLine } from "./warehouse/warehouseUi";
import { RemeasureCompare, figuresCompared, figuresDiffer, noFigures } from "./warehouse/RemeasureCompare";
import { ALREADY_ACCEPTED, alreadyAccepted, figuresText, lineCbm, readRemeasuredLines, remeasuredFigures, shipmentCargoFigures, unmeasuredReason } from "./warehouse/remeasuredLines";

// Cargo Details' view of the warehouse's remeasurement (owner decision, 18 Nov 2026): the lines the
// warehouse saved (Warehouse → Shipment Details → Dimensions / Remeasurement), read-only, against
// the dimension lines here, with the same Compared table. Accepting it is never automatic: who may
// change the shipment's details clicks "Accept remeasurement", and since 22 Nov (owner's answer) that
// only records it here - Cargo Details' lines, the shipment's Colli, Total Weight and Total Volume and
// its container stay as they are; Alerts, Shipments → Managers and Costs Breakdown take the acceptance
// as before. Only lines measured in full can be accepted (kg per piece and every size), saying which
// line lacks one. The API refuses the same.

const cell = (v: string) => v || "—";

export function RemeasuredCard({ shipment, readOnly }: { shipment: ShipmentItem; readOnly: boolean }) {
  const messageApi = useMessages();
  const { data } = useWarehouseSection(shipment.id, "job");
  const { acceptance, accept, isAccepting } = useRemeasureAcceptance(shipment.id);
  const [asking, setAsking] = useState(false);

  const job = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const saved = typeof job.remeasure_rows === "string" ? job.remeasure_rows : "";
  const informedAt = typeof job.inform_operations_sent === "string" ? job.inform_operations_sent : "";
  const lines = useMemo(() => readRemeasuredLines(saved), [saved]);
  const re = useMemo(() => remeasuredFigures(lines), [lines]);
  const unmeasured = useMemo(() => unmeasuredReason(saved), [saved]);
  // The lines' totals, a figure they lack from the shipment's own, rounded as the remeasured ones.
  const ship = useMemo(() => shipmentCargoFigures(shipment), [shipment]);

  // Nothing remeasured and nothing accepted: the card is not shown.
  if (lines.length === 0 && !acceptance) return null;

  // A figure only the warehouse measured is a difference too (mock test council Y9): Accept is offered.
  const mismatch = lines.length > 0 && figuresDiffer(ship, re);
  const compared = lines.length > 0 && figuresCompared(ship, re);
  // The same lines are accepted once: until the warehouse saves other lines.
  const acceptBlocked = readOnly
    ? "Only the user in Handled By or Holiday Cover, or a manager, can accept the remeasurement"
    : lines.length === 0
      ? "The warehouse has no remeasured lines saved"
      : (unmeasured ?? (alreadyAccepted(acceptance?.lines, saved) ? ALREADY_ACCEPTED : null));
  // The server says the same of the same lines (shipment.service acceptRemeasurement).

  const onAccept = async () => {
    try {
      await accept(saved);
      setAsking(false);
      messageApi.success("Remeasurement accepted: recorded here, Cargo Details stays as it is");
    } catch (e) {
      setAsking(false);
      messageApi.error(e instanceof SectionChangedError ? e.message : `Not accepted: ${apiErrorMessage(e)}`);
    }
  };

  return (
    <SectionCard
      title="Remeasured by warehouse"
      extra={
        lines.length > 0 && mismatch ? (
          <Tooltip title={acceptBlocked ?? undefined}>
            <span className="inline-flex">
              <button type="button" className={BTN_BAR_PRIMARY} disabled={!!acceptBlocked || isAccepting} onClick={() => setAsking(true)}>
                Accept remeasurement
              </button>
            </span>
          </Tooltip>
        ) : null
      }
    >
      {lines.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[13px]">
              <thead>
                <tr>
                  {["Qty", "L (cm)", "W (cm)", "H (cm)", "Weight/pc (kg)", "Volume (CBM)"].map((h) => (
                    <th key={h} className={`${TH_CELL} text-center`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className={rowLine(i, lines.length)}>
                    <td className={`${TD_CELL} text-center tabular-nums`}>{cell(l.pieces)}</td>
                    <td className={`${TD_CELL} text-center tabular-nums`}>{cell(l.lengthCm)}</td>
                    <td className={`${TD_CELL} text-center tabular-nums`}>{cell(l.widthCm)}</td>
                    <td className={`${TD_CELL} text-center tabular-nums`}>{cell(l.heightCm)}</td>
                    <td className={`${TD_CELL} text-center tabular-nums`}>{cell(l.weightPerPcKg)}</td>
                    <td className={`${TD_CELL} text-center tabular-nums text-slate-500`}>{lineCbm(l) > 0 ? lineCbm(l).toFixed(4) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={`${TOTAL_CELL} text-center`}>{re.colli || "—"}</td>
                  <td className={TOTAL_CELL} colSpan={3} />
                  <td className={`${TOTAL_CELL} text-center`}>{re.weightKg > 0 ? `${re.weightKg.toFixed(1)} kg` : "—"}</td>
                  <td className={`${TOTAL_CELL} text-center`}>{re.volumeCbm > 0 ? `${re.volumeCbm.toFixed(3)} CBM` : "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-5">
            <RemeasureCompare ship={ship} re={re} freightMode={shipment.freightMode} loadType={shipment.loadType} shipLabel="Cargo Details values" />
          </div>

          {mismatch && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
              <WarningOutlined /> The warehouse&apos;s remeasured values differ from Cargo Details.
            </div>
          )}
          {compared && !mismatch && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-700">
              <CheckCircleFilled /> Cargo Details matches the remeasurement
            </div>
          )}
          {noFigures(ship) && <div className={`mt-3 ${HINT}`}>Cargo Details has no figures yet: the remeasured ones are all new.</div>}
        </>
      ) : (
        <div className={HINT}>The warehouse has no remeasured lines saved now.</div>
      )}

      {informedAt && <div className={`mt-2 ${HINT}`}>Operations informed on {formatDateTime(informedAt)}</div>}
      {acceptance && (
        <div className={`mt-1 ${HINT}`}>
          Accepted{acceptance.acceptedBy ? ` by ${acceptance.acceptedBy}` : ""} on {formatDateTime(acceptance.acceptedAt)} — Cargo Details then: {figuresText(acceptance.before)}; remeasured: {figuresText(acceptance.after)}
        </div>
      )}

      <ConfirmModal
        open={asking}
        title="Accept the remeasurement?"
        description={`The warehouse's remeasurement (${figuresText(re)}) is recorded as accepted here. Cargo Details' lines, the shipment's Colli, Total Weight and Total Volume and its container stay as they are. Costs Breakdown shows a note to check the cost quantities.`}
        confirmLabel="Accept"
        loading={isAccepting}
        onClose={() => setAsking(false)}
        onConfirm={onAccept}
      />
    </SectionCard>
  );
}
