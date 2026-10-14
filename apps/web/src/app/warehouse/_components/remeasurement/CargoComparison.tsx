"use client";

import { useState } from "react";
import { Alert, Button, Modal, Tooltip } from "antd";
import type { GateMovement } from "@/hooks/useGateLog";
import type { interfaces } from "@/lib/api/client";
import { formatDateTime } from "@/lib/date";
import { TERMS } from "../../_lib/glossary";
import { nf } from "../../gate-log/_lib/gate";
import { declaredTotals, linesTotals, parseLines, pctText, reweighVariance, TOLERANCE, variance, wm, type CargoTotals, type RemeasureLine } from "../../_lib/cargoCompare";
import { Card } from "../tabs/shared";
import { sentHistory } from "./NotesAndSent";

// Block B — the cargo side by side: declared on the shipment, received at the gate (the gate
// figures) and remeasured by the warehouse (the lines below, as typed). A difference is flagged
// when any piece differs or weight / volume differ by more than 5 %. "Use remeasured figures for
// the warehouse" sets the GATE figures from the saved lines — the shipment's cargo never changes.

type Row = { key: "pieces" | "kg" | "cbm" | "wm"; label: string; digits: number };
const ROWS: Row[] = [
  { key: "pieces", label: TERMS.pieces, digits: 0 },
  { key: "kg", label: TERMS.weightKg, digits: 1 },
  { key: "cbm", label: TERMS.volumeCbm, digits: 3 },
  { key: "wm", label: "Chargeable W/M", digits: 2 },
];

const valueOf = (t: CargoTotals | null, key: Row["key"]) => (!t ? null : key === "wm" ? wm(t) : t[key]);
const hasAny = (t: CargoTotals | null) => !!t && (t.pieces > 0 || t.kg > 0 || t.cbm > 0);

export function CargoComparison({
  m,
  shipment,
  rows,
  linesUnsaved,
  data,
  sectionVersion,
  informing,
  onInform,
  onMarkRemeasurementSent,
  applyRemeasured,
  applying,
}: {
  m: GateMovement | undefined;
  shipment: interfaces.ShipmentItem | null;
  /** The lines as currently typed. */
  rows: RemeasureLine[];
  linesUnsaved: boolean;
  data: Record<string, unknown>;
  sectionVersion: number;
  informing: boolean;
  onInform: () => void;
  onMarkRemeasurementSent: () => void;
  applyRemeasured: (sectionVersion: number) => Promise<unknown>;
  applying: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const declared = declaredTotals(shipment);
  const gate: CargoTotals | null = m ? { pieces: m.colli, kg: m.weightKg, cbm: m.measureCbm } : null;
  const typed = linesTotals(rows);
  const remeasured = hasAny(typed) ? typed : null;
  const saved = linesTotals(parseLines(data.remeasure_rows));
  const savedRemeasured = hasAny(saved) ? saved : null;

  // Compared with what the shipment declares; a stand-alone position against its gate figures.
  const reference = declared ?? (hasAny(gate) ? gate : null);
  const gateVsDeclared = variance(declared, hasAny(gate) ? gate : null);
  const remVsRef = variance(reference, remeasured);
  const remVsGate = variance(hasAny(gate) ? gate : null, remeasured);
  // LCL cargo is re-weighed by the warehouse: the weight row also shows the re-weighed weight,
  // compared with the same reference and tolerance (recomputed against the live shipment).
  const reweighed = m?.reweigh ?? null;
  const reweighVar = reweighVariance(reweighed?.weighedKg, reference?.kg);
  const anyVariance = gateVsDeclared.any || remVsRef.any || reweighVar.flagged;

  const flag = (v: ReturnType<typeof variance>, key: Row["key"]) => (key === "pieces" ? v.pieces : key === "kg" ? v.kg : key === "cbm" ? v.cbm : v.wm);
  const diffText = (a: CargoTotals | null, b: CargoTotals | null, key: Row["key"], digits: number) => {
    const va = valueOf(a, key);
    const vb = valueOf(b, key);
    if (!va || !vb) return "";
    if (key === "pieces") return `${vb - va >= 0 ? "+" : "−"}${Math.abs(vb - va)}`;
    if (key === "wm") return `${vb - va >= 0 ? "+" : "−"}${nf(Math.abs(vb - va), digits)}`;
    return pctText((vb - va) / va);
  };

  // W/M changed by the saved remeasurement and not sent since the lines were saved.
  const linesSavedAt = typeof data.remeasure_rows_saved_at === "string" ? data.remeasure_rows_saved_at : "";
  const lastSent = sentHistory(data, "remeasurement")[0];
  const wmChanged = !!savedRemeasured && !!reference && Math.abs(wm(savedRemeasured) - wm(reference)) >= 0.005;
  const sentSinceSave = !!lastSent && (!linesSavedAt || Date.parse(lastSent.at) >= Date.parse(linesSavedAt));
  const informed = sentHistory(data, "inform_operations")[0];

  // Gate figures may take the saved lines while the cargo is not released and they differ.
  const sameAsGate = !!savedRemeasured && !!gate && savedRemeasured.pieces === gate.pieces && savedRemeasured.kg === gate.kg && savedRemeasured.cbm === gate.cbm;
  const applyBlocked = !m
    ? "No gate record for this position yet"
    : m.impRelease
      ? "The cargo is already released — the gate figures stay as released"
      : m.archivedAt
        ? "The gate record is archived"
        : !savedRemeasured || !savedRemeasured.pieces
          ? "Save remeasured lines first"
          : linesUnsaved
            ? "Save the lines first — the saved lines are used"
            : sameAsGate
              ? "The gate figures already match the remeasurement"
              : null;

  const cell = "px-3 py-2 text-right tabular-nums";
  return (
    <Card title="Cargo comparison" extra={`Tolerance: any piece difference, or more than ${TOLERANCE * 100} % on weight / volume`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <th className="text-left px-3 py-2" />
              <th className="text-right px-3 py-2">Declared (shipment)</th>
              <th className="text-right px-3 py-2">Received at gate</th>
              <th className="text-right px-3 py-2">
                Remeasured{linesUnsaved ? <span className="ml-1 normal-case font-semibold text-amber-600">(unsaved)</span> : null}
              </th>
              {(reweighed || m?.needsReweigh) && <th className="text-right px-3 py-2">Re-weighed</th>}
              <th className="text-left px-3 py-2">Variance</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => {
              const g = flag(gateVsDeclared, r.key);
              const x = flag(remVsRef, r.key);
              const show = (t: CargoTotals | null) => {
                const v = valueOf(t, r.key);
                return v ? nf(v, r.digits) : <span className="text-slate-300">—</span>;
              };
              return (
                <tr key={r.key} className="border-b border-slate-100 last:border-b-0">
                  <th scope="row" className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {r.label}
                  </th>
                  <td className={cell}>{declared ? show(declared) : <span className="text-slate-300">{r.key === "pieces" ? "stand-alone" : "—"}</span>}</td>
                  <td className={`${cell} ${g ? "text-amber-700 font-semibold" : ""}`}>{show(gate)}</td>
                  <td className={`${cell} ${x ? "text-amber-700 font-semibold" : ""}`}>{show(remeasured)}</td>
                  {(reweighed || m?.needsReweigh) && (
                    <td className={`${cell} ${r.key === "kg" && reweighVar.flagged ? "text-amber-700 font-semibold" : ""}`}>
                      {r.key !== "kg" ? (
                        <span className="text-slate-300">—</span>
                      ) : reweighed ? (
                        <Tooltip title={`${formatDateTime(reweighed.weighedAt)}${reweighed.weighedBy ? ` · ${reweighed.weighedBy}` : ""}`}>
                          <span>{nf(reweighed.weighedKg, r.digits)}</span>
                        </Tooltip>
                      ) : (
                        <span className="text-red-600 text-[11px] font-semibold">not yet</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1.5">
                      {r.key === "kg" && reweighVar.flagged && <VarTag label={`re-weighed ${pctText(reweighVar.pct)}${declared ? "" : " vs gate"}`} />}
                      {g && <VarTag label={`gate ${diffText(declared, gate, r.key, r.digits)}`} />}
                      {x && <VarTag label={`remeasured ${diffText(reference, remeasured, r.key, r.digits)}${declared ? "" : " vs gate"}`} />}
                      {!g && !x && flag(remVsGate, r.key) && <VarTag label={`remeasured vs gate ${diffText(gate, remeasured, r.key, r.digits)}`} />}
                      {!g && !x && !flag(remVsGate, r.key) && !(r.key === "kg" && reweighVar.flagged) && <span className="text-slate-300">—</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 mt-3">
        {anyVariance ? (
          <Alert
            type="warning"
            showIcon
            message={<span className="text-xs font-semibold">The figures differ beyond the tolerance</span>}
            description={
              <span className="text-xs">
                {informed ? `Operations informed ${formatDateTime(informed.at)}${informed.by ? ` by ${informed.by}` : ""}.` : "Operations have not been informed yet."}
              </span>
            }
            action={
              <Button size="small" danger onClick={onInform} loading={informing}>
                {informed ? "Inform again" : "Inform Operations"}
              </Button>
            }
          />
        ) : hasAny(remeasured) || (declared && hasAny(gate)) || (reweighed && reweighVar.pct != null) ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs text-emerald-700">Within tolerance</div>
        ) : null}

        {wmChanged && !sentSinceSave && (
          <Alert
            type="info"
            showIcon
            message={
              <span className="text-xs">
                The chargeable W/M changed with the remeasurement ({nf(wm(reference), 2)} → {nf(wm(savedRemeasured), 2)}). Mark the remeasurement as sent once it went out.
              </span>
            }
            action={
              <Button size="small" onClick={onMarkRemeasurementSent}>
                Mark remeasurement as sent
              </Button>
            }
          />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Tooltip title={applyBlocked ?? undefined}>
            <span className="inline-flex">
              <Button size="small" disabled={!!applyBlocked} onClick={() => setConfirmOpen(true)}>
                Use remeasured figures for the warehouse
              </Button>
            </span>
          </Tooltip>
          <span className="text-[11px] text-slate-400">Changes the gate figures only — the shipment&rsquo;s cargo is not changed.</span>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        title="Use remeasured figures for the warehouse"
        okText="Use remeasured figures"
        confirmLoading={applying}
        onCancel={() => setConfirmOpen(false)}
        onOk={() =>
          applyRemeasured(sectionVersion)
            .then(() => setConfirmOpen(false))
            .catch(() => undefined)
        }
        destroyOnHidden
      >
        <p className="text-xs text-slate-500 mt-0">
          The gate figures of {m?.positionRef || m?.gateRef} become the totals of the saved remeasured lines. Logged on the gate record. The shipment&apos;s cargo
          is not changed.
        </p>
        {gate && savedRemeasured && (
          <table className="w-full text-xs border-collapse">
            <tbody>
              {(
                [
                  [TERMS.pieces, nf(gate.pieces), nf(savedRemeasured.pieces)],
                  [TERMS.weightKg, nf(gate.kg, 1), nf(savedRemeasured.kg, 1)],
                  [TERMS.volumeCbm, nf(gate.cbm, 3), nf(savedRemeasured.cbm, 3)],
                ] as const
              ).map(([k, from, to]) => (
                <tr key={k} className="border-b border-slate-100">
                  <th scope="row" className="text-left py-1.5 text-[11px] uppercase text-slate-500">
                    {k}
                  </th>
                  <td className="py-1.5 text-right tabular-nums">{from}</td>
                  <td className="py-1.5 px-2 text-center text-slate-400">→</td>
                  <td className="py-1.5 tabular-nums font-semibold">{to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </Card>
  );
}

function VarTag({ label }: { label: string }) {
  return <span className="inline-block rounded-[5px] bg-orange-50 px-2 py-[2px] text-[10.5px] font-semibold text-orange-700 whitespace-nowrap">{label}</span>;
}
