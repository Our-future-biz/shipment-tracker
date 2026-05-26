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

  const headerStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 500,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  return (
    <section>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "130px 90px 56px 90px 56px 120px 1fr",
          alignItems: "center",
          gap: 4,
          paddingBottom: 4,
          borderBottom: "1px solid #e2e8f0",
          marginBottom: 4,
        }}
      >
        <span style={headerStyle}>Category</span>
        <span style={headerStyle}>Est.</span>
        <span style={headerStyle}>Cur.</span>
        <span style={headerStyle}>Real</span>
        <span style={headerStyle}>Cur.</span>
        <span style={headerStyle}>Invoice #</span>
        <span style={headerStyle}>Vendor</span>
      </div>
      {rows.map((row, i) => (
        <div
          key={row.category}
          style={{
            display: "grid",
            gridTemplateColumns: "130px 90px 56px 90px 56px 120px 1fr",
            alignItems: "center",
            gap: 4,
            padding: "2px 0",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <span style={{ fontSize: 11, color: "#334155", fontWeight: 500, padding: "0 4px" }}>{row.label}</span>
          <GridInput value={row.estAmount} onChange={(v) => updateField(i, "estAmount", v)} onBlur={() => handleBlur(i)} placeholder="0.00" />
          <GridSelect value={row.estCurrency} options={[...CURRENCIES]} onChange={(v) => { updateField(i, "estCurrency", v); handleBlur(i); }} />
          <GridInput value={row.realAmount} onChange={(v) => updateField(i, "realAmount", v)} onBlur={() => handleBlur(i)} placeholder="0.00" />
          <GridSelect value={row.realCurrency} options={[...CURRENCIES]} onChange={(v) => { updateField(i, "realCurrency", v); handleBlur(i); }} />
          <GridInput value={row.invoiceNumber} onChange={(v) => updateField(i, "invoiceNumber", v)} onBlur={() => handleBlur(i)} placeholder="\u2014" />
          <GridInput value={row.vendor} onChange={(v) => updateField(i, "vendor", v)} onBlur={() => handleBlur(i)} placeholder="\u2014" />
        </div>
      ))}
    </section>
  );
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 4,
  fontSize: 11,
  padding: "3px 6px",
  color: "#334155",
  outline: "none",
};

const GridInput = ({ value, onChange, onBlur, placeholder }: { value: string; onChange: (v: string) => void; onBlur: () => void; placeholder?: string }) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    onBlur={onBlur}
    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    placeholder={placeholder}
    style={inputStyle}
  />
);

const GridSelect = ({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{ ...inputStyle, cursor: "pointer", padding: "3px 4px" }}
  >
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);
