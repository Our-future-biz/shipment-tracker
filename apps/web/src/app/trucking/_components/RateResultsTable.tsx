"use client";

import { Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { StarFilled, WarningOutlined } from "@ant-design/icons";
import { Pill } from "@/components/Pill";
import type { interfaces } from "@/lib/api/client";
import type { RateLevelResult } from "@/hooks/useTrucking";
import { bestBuy, promisedLabel } from "../_lib/rateCalculator";
import { formatMoney, formatPercent, isPriced } from "../_lib/tariffs";
import { RateResultDetail } from "./RateResultDetail";

/** A priced side's total, with CZK under it when the tariff is in another currency; "Unpriced" with the reason otherwise. */
const PriceCell = ({ side }: { side: interfaces.PricedSide | interfaces.Unpriced | null }) => {
  if (!side) return <span className="text-slate-400">—</span>;
  if (!isPriced(side)) {
    return (
      <span className="block max-w-[220px]">
        <Pill tone="amber">Unpriced</Pill>
        <span className="block mt-0.5 text-[11.5px] text-slate-500 whitespace-normal">{side.reason}</span>
      </span>
    );
  }
  return (
    <span className="block text-right tabular-nums whitespace-nowrap">
      <span className="font-semibold text-slate-900">{formatMoney(side.total, side.currency)}</span>
      {side.currency !== "CZK" && <span className="block text-[11.5px] text-slate-500">{formatMoney(side.totalCzk, "CZK")}</span>}
    </span>
  );
};

interface RateResultsTableProps {
  results: RateLevelResult[];
  includeBuy: boolean;
  includeInternal: boolean;
  /** The margin floor from the settings, for the warning's explanation. */
  marginFloor: interfaces.MarginFloor | null;
}

// One row per service level: when it arrives, sell, best buy, margin and internal; a row opens
// to the price lines, every haulier and the ones left out.
export const RateResultsTable = ({ results, includeBuy, includeInternal, marginFloor }: RateResultsTableProps) => {
  const floorText = marginFloor ? `The margin floor is ${formatPercent(marginFloor.percent)} and ${formatMoney(marginFloor.minAmountCzk, "CZK")}.` : "";
  const columns: ColumnsType<RateLevelResult> = [
    { key: "level", title: "Service level", render: (_, r) => <span className="font-semibold text-slate-800 whitespace-nowrap">{r.label}</span> },
    {
      key: "promised",
      title: "Delivered",
      render: (_, r) => (
        <span className="block min-w-[150px]">
          <span className="whitespace-nowrap">{promisedLabel(r)}</span>
          {r.promiseNote && <span className="block text-[11.5px] text-slate-500">{r.promiseNote}</span>}
        </span>
      ),
    },
    { key: "sell", title: "Sell", align: "right", render: (_, r) => <PriceCell side={r.sell} /> },
  ];
  if (includeBuy) {
    columns.push({
      key: "buy",
      title: "Best buy",
      align: "right",
      render: (_, r) => {
        const best = bestBuy(r);
        if (!best) {
          return (
            <span className="text-[12px] text-slate-500 whitespace-nowrap">
              No haulier{r.excluded.length ? ` (${r.excluded.length} blocked)` : ""}
            </span>
          );
        }
        return (
          <span className="block">
            <span className="block text-[12px] text-slate-600 whitespace-nowrap">
              {best.preferred && (
                <Tooltip title="Preferred lane of this haulier">
                  <StarFilled className="mr-1 text-amber-500" aria-label="Preferred lane" />
                </Tooltip>
              )}
              {best.ownerName ?? "Haulier"}
              {r.buy.length > 1 && <span className="ml-1 text-slate-400">+{r.buy.length - 1}</span>}
            </span>
            <PriceCell side={best} />
          </span>
        );
      },
    });
    columns.push({
      key: "margin",
      title: "Margin",
      align: "right",
      render: (_, r) => {
        if (r.marginCzk == null) return <span className="text-slate-400">—</span>;
        return (
          <span className="block text-right tabular-nums whitespace-nowrap">
            <span className={`font-semibold ${r.marginCzk < 0 ? "text-red-700" : "text-slate-900"}`}>{formatMoney(r.marginCzk, "CZK")}</span>
            <span className="block text-[11.5px] text-slate-500">{formatPercent(r.marginPercent)}</span>
            {r.belowFloor && (
              <Tooltip title={floorText}>
                <Pill tone="red" className="mt-0.5">
                  <WarningOutlined aria-hidden />
                  Below margin floor
                </Pill>
              </Tooltip>
            )}
          </span>
        );
      },
    });
  }
  if (includeInternal) columns.push({ key: "internal", title: "Internal", align: "right", render: (_, r) => <PriceCell side={r.internal} /> });

  return (
    <Table<RateLevelResult>
      size="small"
      rowKey="serviceLevel"
      columns={columns}
      dataSource={results}
      pagination={false}
      scroll={{ x: "max-content" }}
      locale={{ emptyText: "No service level is active — switch one on in the Trucking settings." }}
      rowClassName={(r) => (r.belowFloor ? "bg-red-50/40" : "")}
      expandable={{
        expandRowByClick: true,
        expandedRowRender: (r) => <RateResultDetail result={r} includeBuy={includeBuy} />,
      }}
    />
  );
};
