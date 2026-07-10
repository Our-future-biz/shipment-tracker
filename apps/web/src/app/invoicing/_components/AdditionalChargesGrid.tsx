"use client";

import { Button } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { CURRENCIES } from "@/lib/enums";
import { billingDisplay, overrideKeyForCharge, type ChargeRow } from "../_lib/billing";
import { GridHeader, GridInput, GridSelect } from "./gridControls";

const TEMPLATE = "grid-cols-[minmax(140px,1.6fr)_84px_60px_84px_60px_100px_minmax(100px,1.2fr)_96px_32px]";

interface AdditionalChargesGridProps {
  rows: ChargeRow[];
  roe: number;
  overrides: Record<string, string>;
  onField: (index: number, field: keyof ChargeRow, value: string) => void;
  onFieldBlur: (index: number) => void;
  onOverride: (chargeId: string, value: string) => void;
  onOverrideBlur: (chargeId: string) => void;
  onDelete: (index: number) => void;
}

export const AdditionalChargesGrid = ({
  rows,
  roe,
  overrides,
  onField,
  onFieldBlur,
  onOverride,
  onOverrideBlur,
  onDelete,
}: AdditionalChargesGridProps) => {
  if (rows.length === 0) {
    return <p className="text-xs text-slate-400 m-0">No additional charges. Add one below.</p>;
  }
  return (
    <section>
      <GridHeader
        template={TEMPLATE}
        columns={["Description", "Est.", "Cur.", "Real", "Cur.", "Invoice #", "Vendor", "Billing", ""]}
      />
      {rows.map((row, i) => {
        const key = overrideKeyForCharge(row.id);
        return (
          <div key={row.id} className={`grid ${TEMPLATE} items-center gap-1 py-[2px] border-b border-slate-100`}>
            <GridInput value={row.description} onChange={(v) => onField(i, "description", v)} onBlur={() => onFieldBlur(i)} placeholder="Description" />
            <GridInput value={row.estAmount} onChange={(v) => onField(i, "estAmount", v)} onBlur={() => onFieldBlur(i)} placeholder="0.00" />
            <GridSelect value={row.estCurrency} options={CURRENCIES} onChange={(v) => { onField(i, "estCurrency", v); onFieldBlur(i); }} />
            <GridInput value={row.realAmount} onChange={(v) => onField(i, "realAmount", v)} onBlur={() => onFieldBlur(i)} placeholder="0.00" />
            <GridSelect value={row.realCurrency} options={CURRENCIES} onChange={(v) => { onField(i, "realCurrency", v); onFieldBlur(i); }} />
            <GridInput value={row.invoiceNumber} onChange={(v) => onField(i, "invoiceNumber", v)} onBlur={() => onFieldBlur(i)} placeholder="—" />
            <GridInput value={row.vendor} onChange={(v) => onField(i, "vendor", v)} onBlur={() => onFieldBlur(i)} placeholder="—" />
            <GridInput
              value={overrides[key] ?? ""}
              onChange={(v) => onOverride(row.id, v)}
              onBlur={() => onOverrideBlur(row.id)}
              placeholder={billingDisplay(undefined, row.realAmount, roe) || "auto"}
              className="text-indigo-600 font-medium"
            />
            <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => onDelete(i)} className="!text-slate-400 hover:!text-red-500" />
          </div>
        );
      })}
    </section>
  );
};
