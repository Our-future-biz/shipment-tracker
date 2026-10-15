"use client";

import { Table } from "antd";
import type { interfaces } from "@/lib/api/client";
import { SURCHARGE_CALC_LABELS, SURCHARGE_LABELS, formatMoney, formatPercent, formatQty } from "../../_lib/tariffs";

const PERCENT_CALCS: interfaces.SurchargeCalc[] = ["PCT", "PCT_OF_VALUE"];

/** The value as it applies: "12.5 %", "350 CZK", "the month's %". */
const valueText = (s: interfaces.TariffSurcharge, currency: string) => {
  if (s.calc === "FUEL_INDEX") return "the month’s %";
  if (PERCENT_CALCS.includes(s.calc)) return formatPercent(s.value);
  return s.calc === "FLAT" ? formatMoney(s.value, currency) : `${formatQty(s.value)} ${currency}`;
};

interface TariffSurchargesTableProps {
  surcharges: interfaces.TariffSurcharge[];
  currency: string;
}

// The surcharges of a version, in the tariff currency.
export const TariffSurchargesTable = ({ surcharges, currency }: TariffSurchargesTableProps) => (
  <Table<interfaces.TariffSurcharge>
    size="small"
    rowKey={(s) => `${s.code}-${s.calc}`}
    dataSource={surcharges}
    pagination={false}
    locale={{ emptyText: "No surcharges." }}
    columns={[
      { key: "code", title: "Surcharge", render: (_, s) => <span className="font-semibold">{SURCHARGE_LABELS[s.code] ?? s.code}</span> },
      { key: "calc", title: "Charged as", render: (_, s) => SURCHARGE_CALC_LABELS[s.calc] ?? s.calc },
      { key: "value", title: "Value", align: "right", render: (_, s) => <span className="tabular-nums">{valueText(s, currency)}</span> },
      { key: "min", title: "At least", align: "right", render: (_, s) => <span className="tabular-nums">{s.min != null ? formatMoney(s.min, currency) : "—"}</span> },
      {
        key: "base",
        title: "Percentage of",
        render: (_, s) =>
          s.calc === "PCT" || s.calc === "FUEL_INDEX" ? (s.onBasePlusSurcharges ? "Freight + surcharges" : "Freight only") : <span className="text-slate-400">—</span>,
      },
    ]}
  />
);
