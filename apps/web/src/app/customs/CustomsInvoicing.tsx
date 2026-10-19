"use client";

import { useMemo, useState } from "react";
import { Button, Spin } from "antd";
import { useToast } from "@/lib/toast";
import { DeleteOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { CURRENCIES } from "@/lib/enums";
import { AppCard } from "@/components/AppCard";
import { GridHeader, GridInput, GridSelect } from "@/app/invoicing/_components/gridControls";
import { type ShipmentItem } from "@/hooks/useShipments";
import { type CustomsInvoiceLineItem, useCustomsInvoicing } from "@/hooks/useCustomsInvoicing";
import { CustomsInvoicePreview } from "./CustomsInvoicePreview";
import { type CustomsInvoiceLine, fmt, parseAmount, totalsByCurrency } from "./_lib/customsInvoice";

// Offered in the Category field; any other text can be typed in as well.
const CUSTOMS_CATEGORIES = ["Customs clearance", "Duty", "VAT", "T1 document", "Other"];

const TEMPLATE = "grid-cols-[minmax(180px,2fr)_84px_minmax(110px,1fr)_32px]";

const inputClass =
  "w-full bg-white border border-slate-200 rounded text-[11px] px-1.5 py-[3px] text-slate-700 outline-none focus:border-indigo-400";

interface LineRow {
  id: string;
  category: string;
  currency: string;
  value: string;
}

type LineDraft = Partial<Omit<LineRow, "id">>;

const toRow = (l: CustomsInvoiceLineItem): LineRow => ({ id: l.id, category: l.category, currency: l.currency, value: l.value ?? "" });

interface CustomsInvoicingProps {
  shipment: ShipmentItem;
}

// Invoicing tab of a shipment opened in Customs: lines of Category, Currency and Value,
// and one Issued Invoice Number for the whole shipment. Each field saves when it is left.
// What is being typed is kept as a draft over the saved lines, so a save or refetch of
// another line never overwrites it.
export function CustomsInvoicing({ shipment }: CustomsInvoicingProps) {
  const toast = useToast();
  const { lines, issuedInvoiceNumber, isLoading, addLine, isAdding, updateLine, deleteLine, setIssuedInvoiceNumber } =
    useCustomsInvoicing(shipment.id);

  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [numberDraft, setNumberDraft] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const rows = useMemo(() => lines.map((l) => ({ ...toRow(l), ...drafts[l.id] })), [lines, drafts]);
  const issuedNumber = numberDraft ?? issuedInvoiceNumber;

  const dropDraft = (id: string) =>
    setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)));

  // After a save, forget only the draft fields that still hold what was sent: anything typed
  // in the meantime (e.g. the value, while the category was saving) stays.
  const settleDraft = (id: string, sent: LineDraft) =>
    setDrafts((prev) => {
      const draft = prev[id];
      if (!draft) return prev;
      const left = Object.fromEntries(
        Object.entries(draft).filter(([field, v]) => v !== sent[field as keyof LineDraft]),
      ) as LineDraft;
      const others = Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id));
      return Object.keys(left).length ? { ...others, [id]: left } : others;
    });

  const handleFieldChange = (id: string, field: keyof LineDraft, value: string) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  // Only a changed line is written back; an amount that can't be read is not sent.
  const handleLineCommit = (row: LineRow) => {
    const saved = lines.find((l) => l.id === row.id);
    if (!saved) return;
    const value = parseAmount(row.value);
    if (value === null) {
      toast.error(`"${row.value}" is not an amount — use e.g. 1 250,50`);
      return;
    }
    const sent: LineDraft = { category: row.category, currency: row.currency, value: row.value };
    const before = toRow(saved);
    if (before.category === row.category && before.currency === row.currency && before.value === value) {
      settleDraft(row.id, sent);
      return;
    }
    updateLine({ id: row.id, category: row.category, currency: row.currency, value })
      .then(() => settleDraft(row.id, sent))
      .catch(() => {});
  };

  const handleNumberCommit = () => {
    if (numberDraft === null) return;
    if (numberDraft.trim() === issuedInvoiceNumber) {
      setNumberDraft(null);
      return;
    }
    setIssuedInvoiceNumber(numberDraft)
      .then(() => setNumberDraft(null))
      .catch(() => {});
  };

  // Lines with an amount that reads as a number; the rest are left out of totals and preview.
  const amountOf = (r: LineRow) => {
    const v = parseAmount(r.value);
    return v ? Number(v) : null;
  };

  const totals = useMemo(
    () =>
      totalsByCurrency(
        rows.flatMap((r) => {
          const n = amountOf(r);
          return n === null ? [] : [{ category: r.category, currency: r.currency, value: n }];
        }),
      ),
    [rows],
  );

  // What the preview shows: every line that has anything filled in, a missing value as 0.
  const previewLines: CustomsInvoiceLine[] = rows
    .filter((r) => r.category.trim() !== "" || r.value.trim() !== "")
    .map((r) => ({ category: r.category, currency: r.currency, value: amountOf(r) ?? 0 }));
  const unreadable = rows.filter((r) => parseAmount(r.value) === null).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spin />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <AppCard
        title="Customs Invoicing"
        extra={
          <div className="flex items-center gap-2">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)}>
              Preview
            </Button>
            <Button size="small" icon={<PlusOutlined />} loading={isAdding} onClick={() => addLine({ currency: "CZK", sortOrder: rows.length })}>
              Add line
            </Button>
          </div>
        }
      >
        {rows.length === 0 ? (
          <p className="text-xs text-slate-400 m-0">No lines yet. Add one with “Add line”.</p>
        ) : (
          <section>
            <datalist id="customs-invoice-categories">
              {CUSTOMS_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <GridHeader template={TEMPLATE} columns={["Category", "Cur.", "Value", ""]} />
            {rows.map((row) => (
              <div key={row.id} className={`grid ${TEMPLATE} items-center gap-1 py-[2px] border-b border-slate-100`}>
                <input
                  type="text"
                  list="customs-invoice-categories"
                  value={row.category}
                  onChange={(e) => handleFieldChange(row.id, "category", e.target.value)}
                  onBlur={() => handleLineCommit(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  placeholder="Choose or type a category"
                  className={inputClass}
                />
                <GridSelect
                  value={row.currency}
                  options={CURRENCIES}
                  onChange={(v) => {
                    handleFieldChange(row.id, "currency", v);
                    handleLineCommit({ ...row, currency: v });
                  }}
                />
                <GridInput
                  value={row.value}
                  onChange={(v) => handleFieldChange(row.id, "value", v)}
                  onBlur={() => handleLineCommit(row)}
                  placeholder="0.00"
                  className={parseAmount(row.value) === null ? "!border-red-400 !text-red-600" : ""}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    deleteLine(row.id, { onSuccess: () => dropDraft(row.id) });
                  }}
                  className="!text-slate-400 hover:!text-red-500"
                />
              </div>
            ))}
          </section>
        )}
      </AppCard>

      <AppCard title="Issued Invoice">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-slate-500">Issued Invoice Number:</label>
          <input
            value={issuedNumber}
            onChange={(e) => setNumberDraft(e.target.value)}
            onBlur={handleNumberCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder="—"
            className="bg-white border border-slate-200 rounded-md text-xs px-2 py-1 w-56 text-slate-700 outline-none focus:border-indigo-400"
          />
          <div className="ml-auto flex items-center gap-4 text-xs">
            <span className="text-slate-500">Total:</span>
            {totals.length === 0 ? (
              <span className="text-slate-400">—</span>
            ) : (
              totals.map(([cur, sum]) => (
                <span key={cur} className="text-indigo-600 font-semibold">
                  {cur} {fmt(sum)}
                </span>
              ))
            )}
            {unreadable > 0 && (
              <span className="text-red-500">
                ({unreadable} {unreadable === 1 ? "amount" : "amounts"} not readable, left out)
              </span>
            )}
          </div>
        </div>
      </AppCard>

      <CustomsInvoicePreview
        open={previewOpen}
        shipment={shipment}
        issuedNumber={issuedNumber.trim()}
        lines={previewLines}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
