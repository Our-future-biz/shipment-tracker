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
import { dimensionTotals } from "@/lib/cargo";
import { SectionCard } from "@/components/SectionCard";
import { ConfirmModal } from "@/components/ConfirmModal";
import { BTN_BAR_PRIMARY, HINT } from "@/styles/ui";
import { TD_CELL, TH_CELL, TOTAL_CELL, rowLine } from "./warehouse/warehouseUi";
import { RemeasureCompare, figuresCompared, figuresDiffer, type CargoFigures } from "./warehouse/RemeasureCompare";
import { figuresText, lineCbm, readRemeasuredLines, remeasuredFigures } from "./warehouse/remeasuredLines";

// Cargo Details' view of the warehouse's remeasurement (owner decision, 18 Nov 2026): the lines the
// warehouse saved (Warehouse → Shipment Details → Dimensions / Remeasurement), read-only, against
// the dimension lines here, with the same Compared table. Accepting it is never automatic: who may
// change the shipment's details clicks "Accept remeasurement", and the warehouse's lines replace
// the dimension lines, Pcs, Total Weight and Total Volume (the description lines stay).

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
  const ship = useMemo<CargoFigures>(() => {
    const t = dimensionTotals(shipment.cargoDimensions ?? []);
    return { colli: t.pcs, weightKg: t.kg, volumeCbm: t.m3 };
  }, [shipment.cargoDimensions]);

  // Nothing remeasured and nothing accepted: the card is not shown.
  if (lines.length === 0 && !acceptance) return null;

  const mismatch = lines.length > 0 && figuresDiffer(ship, re);
  const compared = lines.length > 0 && figuresCompared(ship, re);
  const acceptBlocked = readOnly
    ? "Only the user in Handled By or Holiday Cover, or a manager, can accept the remeasurement"
    : lines.length === 0
      ? "The warehouse has no remeasured lines saved"
      : null;

  const onAccept = async () => {
    try {
      await accept(saved);
      setAsking(false);
      messageApi.success("Remeasurement accepted: Cargo Details now holds the warehouse's figures");
    } catch (e) {
      setAsking(false);
      messageApi.error(e instanceof SectionChangedError ? e.message : `Not accepted: ${apiErrorMessage(e)}`);
    }
  };

  return (
    <SectionCard
      title="Remeasured by warehouse"
      extra={
        lines.length > 0 && (mismatch || !compared) ? (
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
            <RemeasureCompare ship={ship} re={re} freightMode={shipment.freightMode} shipLabel="Cargo Details values" />
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
          {!compared && <div className={`mt-3 ${HINT}`}>Cargo Details has no dimension lines to compare with.</div>}
        </>
      ) : (
        <div className={HINT}>The warehouse has no remeasured lines saved now.</div>
      )}

      {informedAt && <div className={`mt-2 ${HINT}`}>Operations informed on {formatDateTime(informedAt)}</div>}
      {acceptance && (
        <div className={`mt-1 ${HINT}`}>
          Accepted{acceptance.acceptedBy ? ` by ${acceptance.acceptedBy}` : ""} on {formatDateTime(acceptance.acceptedAt)} — before: {figuresText(acceptance.before)}; taken over: {figuresText(acceptance.after)}
        </div>
      )}

      <ConfirmModal
        open={asking}
        title="Accept the remeasurement?"
        description={`The warehouse's lines replace the dimension lines here, and Pcs, Total Weight and Total Volume become ${figuresText(re)}. Package type, stackability and dangerous goods stay; the description lines are not changed. Cost quantities are not changed: Costs Breakdown shows a warning to check them.`}
        confirmLabel="Accept"
        loading={isAccepting}
        onClose={() => setAsking(false)}
        onConfirm={onAccept}
      />
    </SectionCard>
  );
}
