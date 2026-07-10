"use client";

import { CURRENCIES } from "@/lib/enums";
import { billingDisplay, type CostRow } from "../_lib/billing";
import { GridHeader, GridInput, GridSelect } from "./gridControls";

const TEMPLATE = "grid-cols-[minmax(110px,1.3fr)_84px_60px_84px_60px_100px_minmax(100px,1.2fr)_96px]";

interface CostGridProps {
  rows: CostRow[];
  roe: number;
  overrides: Record<string, string>;
  onField: (index: number, field: keyof CostRow, value: string) => void;
  onFieldBlur: (index: number) => void;
  onOverride: (category: string, value: string) => void;
  onOverrideBlur: (category: string) => void;
}

export const CostGrid = ({ rows, roe, overrides, onField, onFieldBlur, onOverride, onOverrideBlur }: CostGridProps) => {
  return (
    <section>
      <GridHeader
        template={TEMPLATE}
        columns={["Category", "Est.", "Cur.", "Real", "Cur.", "Invoice #", "Vendor", "Billing"]}
      />
      {rows.map((row, i) => (
        <div key={row.category} className={`grid ${TEMPLATE} items-center gap-1 py-[2px] border-b border-slate-100`}>
          <span className="text-[11px] text-slate-600 font-medium px-1">{row.label}</span>
          <GridInput value={row.estAmount} onChange={(v) => onField(i, "estAmount", v)} onBlur={() => onFieldBlur(i)} placeholder="0.00" />
          <GridSelect value={row.estCurrency} options={CURRENCIES} onChange={(v) => { onField(i, "estCurrency", v); onFieldBlur(i); }} />
          <GridInput value={row.realAmount} onChange={(v) => onField(i, "realAmount", v)} onBlur={() => onFieldBlur(i)} placeholder="0.00" />
          <GridSelect value={row.realCurrency} options={CURRENCIES} onChange={(v) => { onField(i, "realCurrency", v); onFieldBlur(i); }} />
          <GridInput value={row.invoiceNumber} onChange={(v) => onField(i, "invoiceNumber", v)} onBlur={() => onFieldBlur(i)} placeholder="—" />
          <GridInput value={row.vendor} onChange={(v) => onField(i, "vendor", v)} onBlur={() => onFieldBlur(i)} placeholder="—" />
          <GridInput
            value={overrides[row.category] ?? ""}
            onChange={(v) => onOverride(row.category, v)}
            onBlur={() => onOverrideBlur(row.category)}
            placeholder={billingDisplay(undefined, row.realAmount, roe) || "auto"}
            className="text-indigo-600 font-medium"
          />
        </div>
      ))}
    </section>
  );
};
