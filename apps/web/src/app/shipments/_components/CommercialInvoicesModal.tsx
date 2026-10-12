"use client";

import { useEffect, useState } from "react";
import { AutoComplete, Button, Input, Modal } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { interfaces } from "@/lib/api/client";
import { CURRENCIES } from "@/lib/cargo";

// The Commercial Invoice number(s) / value cells open this: the shipment's commercial
// invoices (number, value, currency), edited as a whole like the Dimensions dialog —
// nothing is written until Save.

type CommercialInvoiceLine = interfaces.CommercialInvoiceLine;

const COLS = "grid grid-cols-[1.4fr_1fr_1fr_32px] gap-3 items-center";

const emptyLine = (): CommercialInvoiceLine => ({ invoiceNumber: "", value: "", currency: "" });
const isEmpty = (l: CommercialInvoiceLine) => !l.invoiceNumber.trim() && !l.value.trim() && !l.currency;

const parseValue = (v: string) => {
  const n = parseFloat(v.replace(/[^0-9.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const currencyOptions = (query: string) => {
  const q = (query ?? "").toLowerCase().trim();
  return CURRENCIES.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)).map((c) => ({
    value: c.code,
    label: (
      <span>
        {c.code} <span className="text-slate-400 text-xs">{c.name}</span>
      </span>
    ),
  }));
};

// "12,500.00 USD · 3,000.00 EUR" — one figure per currency; a value without one stands alone.
function totalsByCurrency(lines: CommercialInvoiceLine[]): string {
  const by = new Map<string, number>();
  for (const l of lines) {
    const v = parseValue(l.value);
    if (v) by.set(l.currency, (by.get(l.currency) ?? 0) + v);
  }
  return [...by.entries()]
    .map(([c, v]) => `${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`.trim())
    .join(" · ");
}

export function CommercialInvoicesModal({
  shipment,
  onClose,
  onSave,
}: {
  /** The shipment whose invoices are shown; null keeps the dialog closed. */
  shipment: ShipmentItem | null;
  onClose: () => void;
  /** Saves the invoices (empty rows already left out); the dialog closes when it resolves. */
  onSave: (shipment: ShipmentItem, lines: CommercialInvoiceLine[]) => Promise<unknown>;
}) {
  const [lines, setLines] = useState<CommercialInvoiceLine[]>([]);
  const [saving, setSaving] = useState(false);

  const shipmentId = shipment?.id;
  useEffect(() => {
    if (!shipment) return;
    const saved = shipment.commercialInvoices ?? [];
    setLines(saved.length ? saved : [emptyLine()]);
    // Only when another shipment is opened: a refetch must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId]);

  const patch = (idx: number, p: Partial<CommercialInvoiceLine>) =>
    setLines((r) => r.map((l, j) => (j === idx ? { ...l, ...p } : l)));
  const remove = (idx: number) => setLines((r) => (r.length > 1 ? r.filter((_, j) => j !== idx) : [emptyLine()]));
  const totals = totalsByCurrency(lines);

  const save = async () => {
    if (!shipment || saving) return;
    setSaving(true);
    try {
      await onSave(shipment, lines.filter((l) => !isEmpty(l)));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!shipment}
      title={`Commercial Invoices — ${shipment?.jobNumber ?? ""}`}
      width={640}
      centered
      destroyOnHidden
      onCancel={onClose}
      footer={
        <div className="flex items-center justify-between">
          <Button icon={<PlusOutlined />} onClick={() => setLines((r) => [...r, emptyLine()])}>
            Add row
          </Button>
          <div className="flex items-center gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <div className={`${COLS} px-1 pb-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200`}>
        <span className="text-center truncate">Commercial Invoice Number</span>
        <span className="text-center truncate">Value</span>
        <span className="text-center truncate">Currency</span>
        <span />
      </div>

      {lines.map((l, idx) => (
        <div key={idx} className={`${COLS} px-1 py-1 border-b border-slate-100`}>
          <Input size="small" className="text-center" value={l.invoiceNumber} onChange={(e) => patch(idx, { invoiceNumber: e.target.value })} />
          <Input
            size="small"
            className="text-center"
            inputMode="decimal"
            placeholder="12 500"
            value={l.value}
            onChange={(e) => patch(idx, { value: e.target.value })}
          />
          <AutoComplete
            size="small"
            className="w-full [&_input]:!text-center"
            value={l.currency}
            placeholder="USD"
            options={currencyOptions(l.currency)}
            onChange={(v) => patch(idx, { currency: (v ?? "").toUpperCase() })}
          />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Delete row" onClick={() => remove(idx)} />
        </div>
      ))}

      {/* The values add up per currency, under the Value column. */}
      <div className={`${COLS} px-1 pt-2.5 mt-1 border-t border-slate-200 text-[11px] font-bold text-slate-700`}>
        <span className="text-center tabular-nums">
          {lines.filter((l) => !isEmpty(l)).length} INVOICE{lines.filter((l) => !isEmpty(l)).length === 1 ? "" : "S"}
        </span>
        <span className="col-span-2 text-center tabular-nums">{totals || "—"}</span>
        <span />
      </div>
    </Modal>
  );
}
