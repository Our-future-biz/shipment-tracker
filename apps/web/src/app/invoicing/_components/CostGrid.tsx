"use client";

import { useState } from "react";
import { CURRENCIES } from "@/lib/enums";
import type { controllers } from "@/lib/api/client";

interface CostGridProps {
  costs: Array<{ category: string; estAmount: string | null; estCurrency: string; realAmount: string | null; realCurrency: string; invoiceNumber: string; vendor: string }>;
  onSave: (params: controllers.UpsertCostRequest) => void;
}

const COST_CATEGORIES = [
  { key: "freight", label: "Freight" },
  { key: "collection", label: "Collection / Delivery" },
  { key: "locals", label: "Locals" },
  { key: "others", label: "Others" },
  { key: "insurance", label: "Insurance" },
  { key: "customs", label: "Customs clearance" },
];

interface CostRow {
  category: string;
  label: string;
  estAmount: string;
  estCurrency: string;
  realAmount: string;
  realCurrency: string;
  invoiceNumber: string;
  vendor: string;
}

export const CostGrid = ({ costs, onSave }: CostGridProps) => {
  const storedMap = new Map(costs.map((c) => [c.category, c]));

  const [rows, setRows] = useState<CostRow[]>(() =>
    COST_CATEGORIES.map((cat) => {
      const stored = storedMap.get(cat.key);
      return {
        category: cat.key,
        label: cat.label,
        estAmount: stored?.estAmount ?? "",
        estCurrency: stored?.estCurrency ?? "CZK",
        realAmount: stored?.realAmount ?? "",
        realCurrency: stored?.realCurrency ?? "CZK",
        invoiceNumber: stored?.invoiceNumber ?? "",
        vendor: stored?.vendor ?? "",
      };
    }),
  );

  const updateField = (index: number, field: keyof CostRow, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, [field]: value } as CostRow;
      return next;
    });
  };

  const handleBlur = (index: number) => {
    const row = rows[index]!;
    onSave({ category: row.category, estAmount: row.estAmount, estCurrency: row.estCurrency, realAmount: row.realAmount, realCurrency: row.realCurrency, invoiceNumber: row.invoiceNumber, vendor: row.vendor });
  };

  return (
    <section>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Costs</h3>
      <div className="grid items-center gap-1 pb-1 border-b border-gray-200 dark:border-gray-700 mb-1" style={{ gridTemplateColumns: "130px 90px 56px 90px 56px 120px 1fr" }}>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Category</span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Est.</span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Cur.</span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Real</span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Cur.</span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Invoice #</span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Vendor</span>
      </div>
      {rows.map((row, i) => (
        <div key={row.category} className="grid items-center gap-1 py-0.5 border-b border-gray-100 dark:border-gray-800" style={{ gridTemplateColumns: "130px 90px 56px 90px 56px 120px 1fr" }}>
          <span className="text-[11px] text-gray-700 dark:text-gray-300 font-medium px-1">{row.label}</span>
          <GridInput value={row.estAmount} onChange={(v) => updateField(i, "estAmount", v)} onBlur={() => handleBlur(i)} placeholder="0.00" />
          <GridSelect value={row.estCurrency} options={[...CURRENCIES]} onChange={(v) => { updateField(i, "estCurrency", v); handleBlur(i); }} />
          <GridInput value={row.realAmount} onChange={(v) => updateField(i, "realAmount", v)} onBlur={() => handleBlur(i)} placeholder="0.00" />
          <GridSelect value={row.realCurrency} options={[...CURRENCIES]} onChange={(v) => { updateField(i, "realCurrency", v); handleBlur(i); }} />
          <GridInput value={row.invoiceNumber} onChange={(v) => updateField(i, "invoiceNumber", v)} onBlur={() => handleBlur(i)} placeholder="—" />
          <GridInput value={row.vendor} onChange={(v) => updateField(i, "vendor", v)} onBlur={() => handleBlur(i)} placeholder="—" />
        </div>
      ))}
    </section>
  );
};

const GridInput = ({ value, onChange, onBlur, placeholder }: { value: string; onChange: (v: string) => void; onBlur: () => void; placeholder?: string }) => (
  <input type="text" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} placeholder={placeholder} className="w-full bg-transparent border border-gray-200 dark:border-gray-700 rounded text-[11px] px-2 py-1 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500/50 focus:border-teal-500 placeholder:text-gray-300 dark:placeholder:text-gray-600" />
);

const GridSelect = ({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent border border-gray-200 dark:border-gray-700 rounded text-[11px] px-1 py-1 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500/50 cursor-pointer">{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
);
