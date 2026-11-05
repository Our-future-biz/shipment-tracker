"use client";

import { useState, useMemo, useEffect } from "react";
import { chargeLabel, chargeOptions } from "@/lib/chargeCodes";
import { CURRENCIES } from "@/lib/enums";
import { Modal, Tabs, Input, InputNumber, Select, Button, Alert } from "antd";
import { useToast } from "@/lib/toast";
import { ArrowLeftOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import type { controllers } from "@/lib/api/client";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { shipmentFreight } from "@/lib/freightTons";
import { EMPTY, HINT, LABEL_TEXT, MODAL_TITLE, REF, TD, TD_TOTAL, TH } from "@/styles/ui";

// The label cell of a table's totals row ("Total"): small bold caps over the totals line.
const TOTAL_LABEL = `${LABEL_TEXT} px-2 py-2 border-t-2 border-slate-200`;
// A missing value in a cell.
const dash = <span className={EMPTY}>—</span>;

interface DerivedRow {
  shipment: ShipmentItem;
  shipmentId: string;
  jobNumber: string;
  dimsJson: string;
  tons: number;
  cbm: number;
  freightTon: number;
}

function deriveRows(masterShipments: ShipmentItem[]): DerivedRow[] {
  return masterShipments.map((s) => {
    const dims = s.cargoDimensions ?? [];
    const dimsJson = dims.length > 0 ? JSON.stringify(dims) : "";
    return {
      shipment: s,
      shipmentId: s.id,
      jobNumber: s.jobNumber ?? s.id,
      dimsJson,
      ...shipmentFreight(s),
    };
  });
}

export function MasterJobDetailModal({
  mcz,
  open,
  onClose,
}: {
  mcz: string;
  open: boolean;
  onClose: () => void;
}) {
  const target = String(mcz).trim();
  // The master job's houses, found by the server among all shipments (not only the newest).
  const { shipments } = useShipments({ masterJobMcz: target, enabled: open && !!target });

  const rows = useMemo(() => {
    const masterShipments = shipments.filter(
      (s) => String(s.masterJobMczNumber ?? "").trim() === target,
    );
    return deriveRows(masterShipments);
  }, [shipments, target]);

  const totalFreightTons = rows.reduce((sum, r) => sum + r.freightTon, 0);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1000}
      destroyOnHidden
      title={
        <span className="flex items-center gap-2">
          <span className={`${MODAL_TITLE} ${REF}`}>#{target}</span>
          <span className={`${HINT} font-normal`}>
            master job · {rows.length} shipment{rows.length === 1 ? "" : "s"}
          </span>
        </span>
      }
    >
      <Tabs
        items={[
          {
            key: "shipments",
            label: "Shipments",
            children: <ShipmentsTab rows={rows} totalFreightTons={totalFreightTons} />,
          },
          {
            key: "machine",
            label: "Machine Processing",
            children: (
              <MachineProcessingTab
                rows={rows}
                totalFreightTons={totalFreightTons}
                masterNumber={target}
                onDone={onClose}
              />
            ),
          },
        ]}
      />
    </Modal>
  );
}

// ─── Shipments Tab ──────────────────────────────────────────────

function ShipmentsTab({ rows, totalFreightTons }: { rows: DerivedRow[]; totalFreightTons: number }) {
  const [dimsRow, setDimsRow] = useState<DerivedRow | null>(null);
  const totalTons = rows.reduce((s, r) => s + r.tons, 0);
  const totalCbm = rows.reduce((s, r) => s + r.cbm, 0);

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-[13px] text-slate-500">
        No shipments are attached to this master job yet.
      </div>
    );
  }

  return (
    <div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className={TH}>Internal Reference</th>
            <th className={TH}>Dimensions</th>
            <th className={`${TH} text-right`}>Weight (tons)</th>
            <th className={`${TH} text-right`}>Volume (CBM)</th>
            <th className={`${TH} text-right`}>Freight Tons</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const dimsCount = (() => {
              if (!r.dimsJson) return 0;
              try {
                return (JSON.parse(r.dimsJson) as unknown[]).length;
              } catch {
                return 0;
              }
            })();
            return (
              <tr key={r.shipmentId}>
                <td className={`${TD} ${REF} font-semibold !text-slate-900`}>{r.jobNumber}</td>
                <td className={TD}>
                  <Button size="small" disabled={!r.dimsJson} onClick={() => setDimsRow(r)}>
                    {r.dimsJson ? `${dimsCount} row${dimsCount === 1 ? "" : "s"} · view` : "no dimensions"}
                  </Button>
                </td>
                <td className={`${TD} text-right tabular-nums`}>{r.tons > 0 ? r.tons.toFixed(3) : dash}</td>
                <td className={`${TD} text-right tabular-nums`}>{r.cbm > 0 ? r.cbm.toFixed(3) : dash}</td>
                <td className={`${TD} text-right tabular-nums font-semibold ${r.freightTon > 0 ? "!text-indigo-600" : "!text-red-600"}`}>
                  {r.freightTon > 0 ? r.freightTon.toFixed(3) : "0.000"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50">
            <td colSpan={2} className={TOTAL_LABEL}>Total</td>
            <td className={`${TD_TOTAL} text-right tabular-nums`}>{totalTons.toFixed(3)}</td>
            <td className={`${TD_TOTAL} text-right tabular-nums`}>{totalCbm.toFixed(3)}</td>
            <td className={`${TD_TOTAL} text-right tabular-nums !text-indigo-600`}>{totalFreightTons.toFixed(3)}</td>
          </tr>
        </tfoot>
      </table>

      <DimensionsViewer row={dimsRow} onClose={() => setDimsRow(null)} />
    </div>
  );
}

function DimensionsViewer({ row, onClose }: { row: DerivedRow | null; onClose: () => void }) {
  let dimRows: Record<string, string>[] = [];
  if (row?.dimsJson) {
    try {
      dimRows = JSON.parse(row.dimsJson);
    } catch {
      dimRows = [];
    }
  }

  return (
    <Modal
      open={!!row}
      onCancel={onClose}
      footer={null}
      width={900}
      title={<span className={MODAL_TITLE}>Dimensions · <span className={`${REF} font-normal text-slate-500`}>{row?.jobNumber}</span></span>}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-50">
            {["Colli", "L (cm)", "W (cm)", "H (cm)", "Weight/pc (kg)", "Vol/pc (CBM)", "Packing", "Stackability"].map((h) => (
              <th key={h} className={TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dimRows.length === 0 && (
            <tr><td colSpan={8} className={`${TD} !py-5 text-center !text-slate-500`}>No dimension rows.</td></tr>
          )}
          {dimRows.map((r, idx) => (
            <tr key={idx}>
              <td className={TD}>{r.colli || dash}</td>
              <td className={TD}>{r.length || dash}</td>
              <td className={TD}>{r.width || dash}</td>
              <td className={TD}>{r.height || dash}</td>
              <td className={TD}>{r.weightPerPiece || dash}</td>
              <td className={TD}>{r.volumePerPiece || dash}</td>
              <td className={TD}>{r.packing || dash}</td>
              <td className={TD}>{r.stackable == null ? dash : String(r.stackable)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

// ─── Machine Processing Tab ─────────────────────────────────────

interface ExistingCost {
  realAmount: string;
  realCurrency: string;
  invoiceNumber: string;
}

function MachineProcessingTab({
  rows,
  totalFreightTons,
  masterNumber,
  onDone,
}: {
  rows: DerivedRow[];
  totalFreightTons: number;
  masterNumber: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"input" | "review">("input");
  const [invoiceValue, setInvoiceValue] = useState<number | null>(null);
  const [currency, setCurrency] = useState("CZK");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [overwriteRows, setOverwriteRows] = useState<Set<string>>(new Set());
  const [existing, setExisting] = useState<Record<string, ExistingCost | undefined>>({});
  // Each shipment's part, as the server splits it (to the cent, adding up to the invoice total).
  const [parts, setParts] = useState<Record<string, string | null>>({});
  const [splitError, setSplitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);

  const invValueNum = invoiceValue ?? 0;
  const inputsValid = invValueNum > 0 && invoiceNumber.trim().length > 0 && totalFreightTons > 0 && !!category;
  const multiplier = totalFreightTons > 0 ? invValueNum / totalFreightTons : 0;
  const zeroFreightCount = rows.filter((r) => r.freightTon <= 0).length;
  const blockProceed = zeroFreightCount > 0;
  const conflicts = rows.filter((r) => existing[r.shipmentId] && !overwriteRows.has(r.shipmentId));
  const splitReady = rows.every((r) => r.shipmentId in parts);
  const canSubmit = !blockProceed && conflicts.length === 0 && !submitting && rows.length > 0 && splitReady && !splitError;
  const categoryLabel = category ? chargeLabel(category) : "";

  // The split request; the review asks it as a dry run, "Proceed" posts it.
  const splitRequest = (dryRun: boolean): controllers.SplitCostRequest => ({
    category: category ?? "",
    total: invValueNum.toFixed(2),
    currency,
    invoiceNumber: invoiceNumber.trim(),
    lines: rows.map((r) => ({ shipmentId: r.shipmentId, weight: r.freightTon })),
    overwriteShipmentIds: [...overwriteRows],
    dryRun,
  });

  // Entering review: each shipment's part and the real cost it already has under the charge
  useEffect(() => {
    if (step !== "review") return;
    let cancelled = false;
    setParts({});
    setSplitError("");
    api.invoicing
      .invoicingSplitCost(splitRequest(true))
      .then(({ lines }) => {
        if (cancelled) return;
        setParts(Object.fromEntries(lines.map((l) => [l.shipmentId, l.amount])));
        setExisting(Object.fromEntries(lines.map((l) => [l.shipmentId, l.existing ?? undefined])));
      })
      .catch((err) => {
        if (!cancelled) setSplitError(apiErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
    // overwriteRows only matter for posting, not for the split shown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, category, rows]);

  const toggleOverwrite = (shipmentId: string) => {
    setOverwriteRows((prev) => {
      const next = new Set(prev);
      if (next.has(shipmentId)) next.delete(shipmentId);
      else next.add(shipmentId);
      return next;
    });
  };

  const handleProceed = async () => {
    setSubmitting(true);
    try {
      // Shipments of 0 freight tons get nothing; one that keeps its own real cost is skipped.
      const { lines } = await api.invoicing.invoicingSplitCost(splitRequest(false));
      for (const l of lines) {
        if (l.written) queryClient.invalidateQueries({ queryKey: ["invoicing", l.shipmentId] });
      }
      setSubmitDone(true);
      toast.success("Pushed to Invoicing");
      setTimeout(() => onDone(), 1100);
    } catch {
      toast.error("Failed to push to Invoicing");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "input") {
    return (
      <div className="max-w-[720px]">
        <div className="mb-4">
          <h3 className={`${LABEL_TEXT} m-0 mb-1`}>
            Step 1 of 2 · Invoice details
          </h3>
          <p className={`${HINT} m-0`}>
            Enter the invoice info, then we&apos;ll compute a per-shipment split based on each shipment&apos;s freight tons.
          </p>
        </div>

        <div className="grid grid-cols-[1fr_120px_1fr] gap-3 mb-3.5">
          <Field label="Invoice total value">
            <InputNumber
              className="w-full"
              min={0}
              step={0.01}
              value={invoiceValue}
              onChange={(v) => setInvoiceValue(v)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Currency">
            <Select className="w-full" value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="Invoice number">
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. F-2026-001" />
          </Field>
        </div>

        <div className="mb-5">
          <Field label="Service / category (from Invoicing)">
            <Select className="w-full" placeholder="Select category…" showSearch optionFilterProp="label" value={category} onChange={setCategory} options={chargeOptions()} />
          </Field>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 mb-4">
          <Stat label="Master" value={`#${masterNumber}`} mono />
          <Stat label="Shipments under master" value={String(rows.length)} />
          <Stat label="Total freight tons" value={totalFreightTons.toFixed(3)} />
          <Stat label="Multiplier (invoice ÷ freight tons)" value={inputsValid ? multiplier.toFixed(4) : "—"} highlight={inputsValid} />
        </div>

        {totalFreightTons <= 0 && (
          <Alert
            type="warning"
            showIcon
            className="mb-4"
            message="None of the shipments under this master have freight tons. Add dimensions in the Shipments tab before continuing."
          />
        )}

        <div className="flex justify-end">
          <Button type="primary" disabled={!inputsValid} onClick={() => setStep("review")}>
            Calculate split →
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className={`${LABEL_TEXT} m-0 mb-1`}>
          Step 2 of 2 · Review the split
        </h3>
        <p className={`${HINT} m-0`}>
          Invoice {invoiceNumber} · {invValueNum.toFixed(2)} {currency} · category{" "}
          <span className="text-indigo-600">{categoryLabel}</span> · multiplier{" "}
          <span className="text-indigo-600 font-bold">{multiplier.toFixed(4)}</span>
        </p>
      </div>

      <table className="w-full border-collapse mb-4">
        <thead>
          <tr className="bg-slate-50">
            <th className={TH}>Internal Reference</th>
            <th className={`${TH} text-right`}>Freight Tons</th>
            <th className={`${TH} text-right`}>Amount ({currency})</th>
            <th className={TH}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const amt = parts[r.shipmentId];
            const isZero = r.freightTon <= 0;
            const isExisting = !!existing[r.shipmentId];
            const overwrite = overwriteRows.has(r.shipmentId);
            const rowCls = isZero ? "bg-red-50" : isExisting && !overwrite ? "bg-amber-50" : "";
            return (
              <tr key={r.shipmentId} className={rowCls}>
                <td className={`${TD} ${REF} font-semibold !text-slate-900`}>{r.jobNumber}</td>
                <td className={`${TD} text-right tabular-nums ${isZero ? "!text-red-600" : ""}`}>{r.freightTon.toFixed(3)}</td>
                <td className={`${TD} text-right tabular-nums font-semibold ${isZero ? "!text-red-600" : "!text-indigo-600"}`}>
                  {isZero ? dash : (amt ?? "…")}
                </td>
                <td className={TD}>
                  {isZero ? (
                    <span className="text-red-600">no freight tons — add dimensions</span>
                  ) : isExisting ? (
                    <label className={`flex items-center gap-1.5 cursor-pointer ${overwrite ? "text-indigo-600" : "text-amber-600"}`}>
                      <input
                        type="checkbox"
                        checked={overwrite}
                        onChange={() => toggleOverwrite(r.shipmentId)}
                        className="accent-indigo-600"
                      />
                      {overwrite
                        ? `overwrite ${existing[r.shipmentId]?.realAmount} ${existing[r.shipmentId]?.realCurrency}`
                        : `existing ${existing[r.shipmentId]?.realAmount} ${existing[r.shipmentId]?.realCurrency} — keep`}
                    </label>
                  ) : (
                    <span className="text-slate-500">will write</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50">
            <td className={TOTAL_LABEL}>Σ total</td>
            <td className={`${TD_TOTAL} text-right tabular-nums`}>{totalFreightTons.toFixed(3)}</td>
            <td className={`${TD_TOTAL} text-right tabular-nums !text-indigo-600`}>{invValueNum.toFixed(2)}</td>
            <td className={TD_TOTAL} />
          </tr>
        </tfoot>
      </table>

      {blockProceed && (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          message={`${zeroFreightCount} shipment${zeroFreightCount === 1 ? "" : "s"} ha${zeroFreightCount === 1 ? "s" : "ve"} 0 freight tons. Add dimensions or remove from this master before proceeding.`}
        />
      )}
      {!blockProceed && conflicts.length > 0 && (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message={`${conflicts.length} shipment${conflicts.length === 1 ? "" : "s"} already ha${conflicts.length === 1 ? "s" : "ve"} a value for "${categoryLabel}". Tick overwrite for any you want to replace; un-ticked rows will be skipped.`}
        />
      )}
      {splitError && <Alert type="error" showIcon className="mb-4" message={`Could not split the invoice: ${splitError}`} />}
      {submitDone && (
        <Alert type="success" showIcon icon={<CheckCircleOutlined />} className="mb-4" message="Pushed to Invoicing — closing…" />
      )}

      <div className="flex justify-between">
        <Button icon={<ArrowLeftOutlined />} disabled={submitting} onClick={() => setStep("input")}>
          Correct
        </Button>
        <Button type="primary" disabled={!canSubmit} loading={submitting} onClick={handleProceed}>
          Proceed → push to Invoicing
        </Button>
      </div>
    </div>
  );
}

// ─── Tiny presentational helpers ────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={LABEL_TEXT}>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`${mono ? REF : "tabular-nums"} ${highlight ? "text-indigo-600 font-bold" : "text-slate-900 font-medium"}`}>
        {value}
      </span>
    </div>
  );
}
