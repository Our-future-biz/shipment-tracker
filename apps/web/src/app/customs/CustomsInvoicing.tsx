"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Spin } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CURRENCIES } from "@/lib/enums";
import { AppCard } from "@/components/AppCard";
import { GridHeader, GridInput, GridSelect } from "@/app/invoicing/_components/gridControls";

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

// "1 000,50" and "1000.50" are the same value; it is stored with a dot and no spaces.
const toNumberText = (v: string) => v.replace(/\s/g, "").replace(",", ".");

const fmt = (n: number) => n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Invoicing tab of a shipment opened in Customs: lines of Category, Currency and Value,
// and one Issued Invoice Number for the whole shipment. Each field saves when it is left.
export function CustomsInvoicing({ shipmentId }: { shipmentId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["customs-invoicing", shipmentId];
  const query = useQuery({ queryKey, queryFn: () => api.invoicing.customsInvoicingGet(shipmentId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const [rows, setRows] = useState<LineRow[]>([]);
  const [issuedNumber, setIssuedNumber] = useState("");

  useEffect(() => {
    if (!query.data) return;
    setRows(query.data.lines.map((l) => ({ id: l.id, category: l.category, currency: l.currency, value: l.value ?? "" })));
    setIssuedNumber(query.data.issuedInvoiceNumber);
  }, [query.data]);

  const addLine = useMutation({
    mutationFn: () => api.invoicing.customsInvoicingAddLine(shipmentId, { currency: "CZK", sortOrder: rows.length }),
    onSuccess: invalidate,
  });
  const saveLine = useMutation({
    mutationFn: (row: LineRow) =>
      api.invoicing.customsInvoicingUpdateLine(shipmentId, row.id, {
        category: row.category,
        currency: row.currency,
        value: toNumberText(row.value),
      }),
    onSuccess: invalidate,
  });
  const deleteLine = useMutation({
    mutationFn: (id: string) => api.invoicing.customsInvoicingDeleteLine(shipmentId, id),
    onSuccess: invalidate,
  });
  const saveNumber = useMutation({
    mutationFn: (value: string) => api.invoicing.customsInvoicingSetNumber(shipmentId, { issuedInvoiceNumber: value }),
    onSuccess: invalidate,
  });

  const setField = (i: number, field: keyof LineRow, value: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  // Only a changed line is written back.
  const commitLine = (row: LineRow) => {
    const saved = query.data?.lines.find((l) => l.id === row.id);
    if (saved && saved.category === row.category && saved.currency === row.currency && (saved.value ?? "") === row.value) return;
    saveLine.mutate(row);
  };

  // The lines add up per currency; values that are not numbers are left out.
  const totals = useMemo(() => {
    const sums = new Map<string, number>();
    for (const r of rows) {
      const n = Number(toNumberText(r.value));
      if (r.value.trim() === "" || !Number.isFinite(n)) continue;
      sums.set(r.currency, (sums.get(r.currency) ?? 0) + n);
    }
    return [...sums.entries()];
  }, [rows]);

  if (query.isLoading) {
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
          <Button size="small" icon={<PlusOutlined />} loading={addLine.isPending} onClick={() => addLine.mutate()}>
            Add line
          </Button>
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
            {rows.map((row, i) => (
              <div key={row.id} className={`grid ${TEMPLATE} items-center gap-1 py-[2px] border-b border-slate-100`}>
                <input
                  type="text"
                  list="customs-invoice-categories"
                  value={row.category}
                  onChange={(e) => setField(i, "category", e.target.value)}
                  onBlur={() => commitLine(rows[i]!)}
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
                    setField(i, "currency", v);
                    commitLine({ ...row, currency: v });
                  }}
                />
                <GridInput
                  value={row.value}
                  onChange={(v) => setField(i, "value", v)}
                  onBlur={() => commitLine(rows[i]!)}
                  placeholder="0.00"
                />
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => deleteLine.mutate(row.id)}
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
            onChange={(e) => setIssuedNumber(e.target.value)}
            onBlur={() => {
              if (issuedNumber.trim() !== (query.data?.issuedInvoiceNumber ?? "")) saveNumber.mutate(issuedNumber);
            }}
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
          </div>
        </div>
      </AppCard>
    </div>
  );
}
