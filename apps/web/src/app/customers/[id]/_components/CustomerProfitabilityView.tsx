"use client";

import { useMemo } from "react";
import dayjs from "dayjs";
import type { ReactNode } from "react";
import { Spin } from "antd";
import { RightOutlined } from "@ant-design/icons";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "@/components/SectionCard";
import { CUSTOMER_SHIPMENTS_LIMIT, useCustomerShipments } from "@/hooks/useCustomerShipments";
import type { ShipmentItem } from "@/hooks/useCustomerShipments";
import type { CustomerItem } from "@/hooks/useCustomers";
import { CHART_COLORS } from "../../_lib/constants";
import { fmtMoney, num } from "../../_lib/customerMoney";
import { CustomerKpiTile, KPI_GRID_CLASS, profitTone } from "./CustomerKpiTile";

const ISO_MONTH = /^\d{4}-\d{2}/;

interface MonthBucket {
  // "YYYY-MM", the sort key.
  month: string;
  // "MM.YYYY", as printed on the axis.
  label: string;
  revenue: number;
  cost: number;
  profit: number;
}

// A shipment counts into the month of its ETA; without a usable ETA, into the month it was created.
function shipmentMonth(shipment: ShipmentItem): string {
  const eta = shipment.estimatedArrival ?? "";
  // createdAt is a UTC timestamp; its month is the one on the viewer's calendar.
  return ISO_MONTH.test(eta) ? eta.slice(0, 7) : dayjs(shipment.createdAt).format("YYYY-MM");
}

function bucketByMonth(shipments: ShipmentItem[]): MonthBucket[] {
  const buckets = new Map<string, MonthBucket>();
  for (const shipment of shipments) {
    const month = shipmentMonth(shipment);
    if (!ISO_MONTH.test(month)) continue;
    const revenue = num(shipment.selling);
    const cost = num(shipment.buying);
    const bucket = buckets.get(month) ?? { month, label: `${month.slice(5)}.${month.slice(0, 4)}`, revenue: 0, cost: 0, profit: 0 };
    bucket.revenue += revenue;
    bucket.cost += cost;
    bucket.profit += revenue - cost;
    buckets.set(month, bucket);
  }
  return Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month));
}

const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const formatAxisValue = (value: number) => compactNumber.format(value);

// Chart chrome stays quiet (hairline slate grid, small slate text) so the bars and the line are the only colour.
const CHART_BOX_CLASS = "h-[260px]";
const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
const GRID_STROKE = "#e2e8f0";
const BASELINE_STROKE = "#94a3b8";
const AXIS_TICK = { fontSize: 11, fill: "#64748b" };
const AXIS_LINE = { stroke: GRID_STROKE };
const TOOLTIP_CONTENT_STYLE = { borderRadius: 8, border: `1px solid ${GRID_STROKE}`, fontSize: 12 };
const TOOLTIP_LABEL_STYLE = { color: "#1e293b", fontWeight: 600 };
// Tooltip rows are printed in ink; recharts would otherwise colour them like their series, which is hard to read.
const TOOLTIP_ITEM_STYLE = { color: "#334155" };
const LEGEND_STYLE = { fontSize: 12 };
// Rounded at the value end, square at the baseline.
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
const MAX_BAR_SIZE = 24;
const LINE_DOT = { r: 4, fill: CHART_COLORS.profit, stroke: "#ffffff", strokeWidth: 2 };

const renderLegendLabel = (value: string) => <span className="text-slate-600">{value}</span>;

interface CustomerProfitabilityViewProps {
  customer: CustomerItem;
  onSelectTab: (key: string) => void;
}

// Finance sub-view "Profitability": the two figures the header does not show, and how money moved month by month.
export function CustomerProfitabilityView({ customer, onSelectTab }: CustomerProfitabilityViewProps) {
  const { shipments, isCapped, isLoading, isError } = useCustomerShipments(customer.id);
  const monthly = useMemo(() => bucketByMonth(shipments), [shipments]);

  // Both tiles come from the stored rollup, like the header totals, so the two can never disagree.
  const { currency, totalRevenue, totalProfit, totalShipments } = customer;
  const avgProfit = totalShipments > 0 ? totalProfit / totalShipments : null;

  const formatTooltipValue = (value: unknown) => fmtMoney(Number(value), currency);

  const handleViewShipments = () => onSelectTab("shipments");

  let chartPlaceholder: ReactNode = null;
  if (isLoading) {
    chartPlaceholder = (
      <div className="h-full flex items-center justify-center">
        <Spin />
      </div>
    );
  } else if (isError) {
    chartPlaceholder = <div className="h-full flex items-center justify-center text-[13px] text-slate-400">Could not load shipments.</div>;
  } else if (monthly.length === 0) {
    chartPlaceholder = <div className="h-full flex items-center justify-center text-[13px] text-slate-400">No shipments to chart yet</div>;
  }

  return (
    <div className="space-y-5">
      <div className={KPI_GRID_CLASS}>
        <CustomerKpiTile label="Total cost" value={fmtMoney(totalRevenue - totalProfit, currency)} />
        <CustomerKpiTile
          label="Avg profit / shipment"
          value={avgProfit === null ? <span className="text-slate-300">—</span> : fmtMoney(avgProfit, currency)}
          tone={avgProfit === null ? undefined : profitTone(avgProfit)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Revenue vs cost vs profit — monthly">
          <div className={CHART_BOX_CLASS}>
            {chartPlaceholder ?? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={CHART_MARGIN} barGap={2}>
                  <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                  <YAxis width={48} tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={formatAxisValue} />
                  <Tooltip
                    formatter={formatTooltipValue}
                    cursor={{ fill: "#f1f5f9" }}
                    contentStyle={TOOLTIP_CONTENT_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                  />
                  <Legend iconType="square" iconSize={10} wrapperStyle={LEGEND_STYLE} formatter={renderLegendLabel} itemSorter={null} />
                  <ReferenceLine y={0} stroke={BASELINE_STROKE} />
                  <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS.revenue} radius={BAR_RADIUS} maxBarSize={MAX_BAR_SIZE} />
                  <Bar dataKey="cost" name="Cost" fill={CHART_COLORS.cost} radius={BAR_RADIUS} maxBarSize={MAX_BAR_SIZE} />
                  <Bar dataKey="profit" name="Profit" fill={CHART_COLORS.profit} radius={BAR_RADIUS} maxBarSize={MAX_BAR_SIZE} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Profit trend">
          <div className={CHART_BOX_CLASS}>
            {chartPlaceholder ?? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthly} margin={CHART_MARGIN}>
                  <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                  <YAxis width={48} tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={formatAxisValue} />
                  <Tooltip
                    formatter={formatTooltipValue}
                    cursor={{ stroke: "#cbd5e1" }}
                    contentStyle={TOOLTIP_CONTENT_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                  />
                  <ReferenceLine y={0} stroke={BASELINE_STROKE} />
                  <Line
                    type="linear"
                    dataKey="profit"
                    name="Profit"
                    stroke={CHART_COLORS.profit}
                    strokeWidth={2}
                    dot={LINE_DOT}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-slate-400">
        <span>
          Months follow each shipment&apos;s ETA, or its creation date when it has none.
          {/* The list is capped, so the charts can cover less than the customer's stored totals do. */}
          {isCapped && ` Charts cover the newest ${CUSTOMER_SHIPMENTS_LIMIT} shipments.`}
        </span>
        <button
          type="button"
          onClick={handleViewShipments}
          className="flex items-center gap-1 p-0 border-none bg-transparent text-[13px] font-semibold text-indigo-600 hover:underline cursor-pointer"
        >
          View shipments
          <RightOutlined className="text-[10px]" />
        </button>
      </div>
    </div>
  );
}
