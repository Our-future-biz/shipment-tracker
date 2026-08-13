"use client";

import { useState, useMemo, useEffect } from "react";
import { Modal, Tabs, Input, InputNumber, Select, Button, Alert, message } from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { computeDimensionTotals } from "@/lib/columnConfig";

const CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CHF", "CNY", "JPY"];

const COST_CATEGORIES = [
  { key: "freight", label: "Freight" },
  { key: "collection", label: "Collection/Delivery" },
  { key: "locals", label: "Locals" },
  { key: "others", label: "Others" },
  { key: "insurance", label: "Insurance" },
  { key: "customs", label: "Customs clearance" },
];

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
    const { weightKg, volumeCbm } = computeDimensionTotals(dims);
    const manualTons = parseFloat(String(s.totalWeightTons ?? "")) || 0;
    const manualCbm = parseFloat(String(s.totalVolumeCbm ?? "")) || 0;
    const tons = weightKg > 0 ? weightKg / 1000 : manualTons;
    const cbm = volumeCbm > 0 ? volumeCbm : manualCbm;
    return {
      shipment: s,
      shipmentId: s.id,
      jobNumber: s.jobNumber ?? s.id,
      dimsJson,
      tons,
      cbm,
      freightTon: Math.max(tons, cbm),
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
  const { shipments } = useShipments();
  const target = String(mcz).trim();

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
      destroyOnClose
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono font-semibold text-indigo-500">#{target}</span>
          <span className="text-xs font-normal text-slate-400">
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
      <div className="py-10 text-center text-sm text-slate-400">
        No shipments are attached to this master job yet.
      </div>
    );
  }

  return (
    <div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left p-2 font-semibold text-slate-500">Internal Reference</th>
            <th className="text-left p-2 font-semibold text-slate-500">Dimensions</th>
            <th className="text-right p-2 font-semibold text-slate-500">Weight (tons)</th>
            <th className="text-right p-2 font-semibold text-slate-500">Volume (CBM)</th>
            <th className="text-right p-2 font-semibold text-slate-500">Freight Tons</th>
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
              <tr key={r.shipmentId} className="border-b border-slate-100">
                <td className="p-2 font-mono font-semibold text-indigo-500">{r.jobNumber}</td>
                <td className="p-2">
                  <Button size="small" disabled={!r.dimsJson} onClick={() => setDimsRow(r)}>
                    {r.dimsJson ? `${dimsCount} row${dimsCount === 1 ? "" : "s"} · view` : "no dimensions"}
                  </Button>
                </td>
                <td className="p-2 text-right tabular-nums">{r.tons > 0 ? r.tons.toFixed(3) : "—"}</td>
                <td className="p-2 text-right tabular-nums">{r.cbm > 0 ? r.cbm.toFixed(3) : "—"}</td>
                <td className={`p-2 text-right tabular-nums font-semibold ${r.freightTon > 0 ? "text-indigo-500" : "text-red-500"}`}>
                  {r.freightTon > 0 ? r.freightTon.toFixed(3) : "0.000"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 border-t-2 border-slate-200">
            <td colSpan={2} className="p-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</td>
            <td className="p-2 text-right tabular-nums font-bold">{totalTons.toFixed(3)}</td>
            <td className="p-2 text-right tabular-nums font-bold">{totalCbm.toFixed(3)}</td>
            <td className="p-2 text-right tabular-nums font-bold text-indigo-500">{totalFreightTons.toFixed(3)}</td>
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
      title={<span className="text-sm">Dimensions · <span className="font-mono text-slate-500">{row?.jobNumber}</span></span>}
    >
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {["Colli", "L (cm)", "W (cm)", "H (cm)", "Weight/pc (kg)", "Vol/pc (CBM)", "Packing", "Stackable"].map((h) => (
              <th key={h} className="text-left p-2 font-semibold text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dimRows.length === 0 && (
            <tr><td colSpan={8} className="p-5 text-center text-slate-400">No dimension rows.</td></tr>
          )}
          {dimRows.map((r, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              <td className="p-2">{r.colli || "—"}</td>
              <td className="p-2">{r.length || "—"}</td>
              <td className="p-2">{r.width || "—"}</td>
              <td className="p-2">{r.height || "—"}</td>
              <td className="p-2">{r.weightPerPiece || "—"}</td>
              <td className="p-2">{r.volumePerPiece || "—"}</td>
              <td className="p-2">{r.packing || "—"}</td>
              <td className="p-2">{String(r.stackable ?? "—")}</td>
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
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"input" | "review">("input");
  const [invoiceValue, setInvoiceValue] = useState<number | null>(null);
  const [currency, setCurrency] = useState("CZK");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [category, setCategory] = useState("freight");
  const [overwriteRows, setOverwriteRows] = useState<Set<string>>(new Set());
  const [existing, setExisting] = useState<Record<string, ExistingCost | undefined>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);

  const invValueNum = invoiceValue ?? 0;
  const inputsValid = invValueNum > 0 && invoiceNumber.trim().length > 0 && totalFreightTons > 0;
  const multiplier = totalFreightTons > 0 ? invValueNum / totalFreightTons : 0;
  const zeroFreightCount = rows.filter((r) => r.freightTon <= 0).length;
  const blockProceed = zeroFreightCount > 0;
  const conflicts = rows.filter((r) => existing[r.shipmentId] && !overwriteRows.has(r.shipmentId));
  const canSubmit = !blockProceed && conflicts.length === 0 && !submitting && rows.length > 0;
  const categoryLabel = COST_CATEGORIES.find((c) => c.key === category)?.label;

  // Fetch existing costs for the chosen category when entering review
  useEffect(() => {
    if (step !== "review") return;
    let cancelled = false;
    (async () => {
      const map: Record<string, ExistingCost | undefined> = {};
      await Promise.all(
        rows.map(async (r) => {
          try {
            const data = await api.invoicing.invoicingGet(r.shipmentId);
            const match = data.costs?.find((c) => c.category === category);
            if (match && match.realAmount && match.realAmount.trim()) {
              map[r.shipmentId] = {
                realAmount: match.realAmount,
                realCurrency: match.realCurrency,
                invoiceNumber: match.invoiceNumber,
              };
            }
          } catch {
            /* ignore */
          }
        }),
      );
      if (!cancelled) setExisting(map);
    })();
    return () => {
      cancelled = true;
    };
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
      for (const r of rows) {
        if (r.freightTon <= 0) continue;
        if (existing[r.shipmentId] && !overwriteRows.has(r.shipmentId)) continue;
        const amt = (r.freightTon * multiplier).toFixed(2);
        await api.invoicing.invoicingUpsertCost(r.shipmentId, {
          category,
          realAmount: amt,
          realCurrency: currency,
          invoiceNumber: invoiceNumber.trim(),
        });
        queryClient.invalidateQueries({ queryKey: ["invoicing", r.shipmentId] });
      }
      setSubmitDone(true);
      message.success("Pushed to Invoicing");
      setTimeout(() => onDone(), 1100);
    } catch {
      message.error("Failed to push to Invoicing");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "input") {
    return (
      <div className="max-w-[720px]">
        <div className="mb-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 m-0 mb-1">
            Step 1 of 2 · Invoice details
          </h3>
          <p className="text-[11px] text-slate-400 m-0">
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
            <Select className="w-full" value={category} onChange={setCategory} options={COST_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} />
          </Field>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 mb-4">
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
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 m-0 mb-1">
          Step 2 of 2 · Review the split
        </h3>
        <p className="text-[11px] text-slate-400 m-0">
          Invoice {invoiceNumber} · {invValueNum.toFixed(2)} {currency} · category{" "}
          <span className="text-indigo-500">{categoryLabel}</span> · multiplier{" "}
          <span className="text-indigo-500 font-bold">{multiplier.toFixed(4)}</span>
        </p>
      </div>

      <table className="w-full border-collapse text-xs mb-4">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left p-2 font-semibold text-slate-500">Internal Reference</th>
            <th className="text-right p-2 font-semibold text-slate-500">Freight Tons</th>
            <th className="text-right p-2 font-semibold text-slate-500">Amount ({currency})</th>
            <th className="text-left p-2 font-semibold text-slate-500">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const amt = r.freightTon * multiplier;
            const isZero = r.freightTon <= 0;
            const isExisting = !!existing[r.shipmentId];
            const overwrite = overwriteRows.has(r.shipmentId);
            const rowCls = isZero ? "bg-red-50" : isExisting && !overwrite ? "bg-amber-50" : "";
            return (
              <tr key={r.shipmentId} className={`border-b border-slate-100 ${rowCls}`}>
                <td className="p-2 font-mono font-semibold text-indigo-500">{r.jobNumber}</td>
                <td className={`p-2 text-right tabular-nums ${isZero ? "text-red-500" : ""}`}>{r.freightTon.toFixed(3)}</td>
                <td className={`p-2 text-right tabular-nums font-semibold ${isZero ? "text-red-500" : "text-indigo-500"}`}>
                  {isZero ? "—" : amt.toFixed(2)}
                </td>
                <td className="p-2">
                  {isZero ? (
                    <span className="text-red-500">no freight tons — add dimensions</span>
                  ) : isExisting ? (
                    <label className={`flex items-center gap-1.5 cursor-pointer ${overwrite ? "text-indigo-500" : "text-amber-600"}`}>
                      <input
                        type="checkbox"
                        checked={overwrite}
                        onChange={() => toggleOverwrite(r.shipmentId)}
                        className="accent-indigo-500"
                      />
                      {overwrite
                        ? `overwrite ${existing[r.shipmentId]?.realAmount} ${existing[r.shipmentId]?.realCurrency}`
                        : `existing ${existing[r.shipmentId]?.realAmount} ${existing[r.shipmentId]?.realCurrency} — keep`}
                    </label>
                  ) : (
                    <span className="text-slate-400">will write</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 border-t-2 border-slate-200">
            <td className="p-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Σ total</td>
            <td className="p-2 text-right tabular-nums font-bold">{totalFreightTons.toFixed(3)}</td>
            <td className="p-2 text-right tabular-nums font-bold text-indigo-500">{(totalFreightTons * multiplier).toFixed(2)}</td>
            <td />
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
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`tabular-nums ${mono ? "font-mono" : ""} ${highlight ? "text-indigo-500 font-bold" : "text-slate-700 font-medium"}`}>
        {value}
      </span>
    </div>
  );
}
