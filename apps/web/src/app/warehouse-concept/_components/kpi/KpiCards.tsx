"use client";

import { DatePicker, Segmented } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { interfaces } from "@/lib/api/client";
import { useToast } from "@/lib/toast";
import { KPI_MAX_DAYS, KPI_PRESETS, KPI_PRESET_LABEL, daysIn, kpiValueText, periodText, type KpiPreset, type KpiRange } from "./kpiPeriod";

export type Kpi = interfaces.WarehouseKpi;

// One KPI: the value (or "Not measured" with the reason), its extra figures, and a small
// "How it is measured" note with the start and stop points and how many records it counts.
export function KpiCard({ kpi, tone }: { kpi: Kpi; tone?: "amber" | "red" }) {
  const measured = kpi.value != null;
  const valueText = measured ? kpiValueText(kpi.value, kpi.unit) : "Not measured";
  const color = !measured ? "text-slate-400" : tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-slate-900";
  const parts = kpi.breakdown.filter((p) => p.value != null || p.n > 0);
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 min-w-0 flex flex-col gap-1.5" aria-label={kpi.label}>
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{kpi.label}</div>
      <div className={`text-[24px] leading-tight font-bold ${color}`}>{valueText}</div>
      <div className="text-[11px] text-slate-500">
        {kpi.n} record{kpi.n === 1 ? "" : "s"} counted
      </div>
      {kpi.notMeasured && <div className="text-xs text-amber-700">{measured ? kpi.notMeasured : `Not measured: ${kpi.notMeasured}`}</div>}
      {parts.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs m-0">
          {parts.map((p) => (
            <div key={p.label} className="contents">
              <dt className="text-slate-500 truncate" title={p.label}>
                {p.label}
              </dt>
              <dd className="m-0 text-right font-semibold tabular-nums text-slate-700">{p.value == null ? <span className="text-slate-300">—</span> : kpiValueText(p.value, p.unit)}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="m-0 mt-1 border-t border-slate-100 pt-1.5 text-[11px] leading-snug text-slate-500">
        <InfoCircleOutlined className="mr-1 text-slate-400" />
        <b className="text-slate-600">How it is measured:</b> {kpi.measured}
      </p>
    </section>
  );
}

/** Amber / red for KPIs that need attention (failed shipment updates, high variance or exceptions). */
export function kpiTone(k: Kpi): "amber" | "red" | undefined {
  if (k.value == null) return undefined;
  if (k.key === "outboxHealth") return (k.breakdown.find((p) => p.label === "Failed")?.value ?? 0) > 0 ? "red" : k.value > 0 ? "amber" : undefined;
  if (k.key === "onTime") return k.value < 80 ? "amber" : undefined;
  if (k.key === "reweighVariance" || k.key === "exceptionRate") return k.value >= 10 ? "red" : k.value > 0 ? "amber" : undefined;
  return undefined;
}

// Period filter: Today / 7 days / 30 days / Custom (a range of Prague days).
export function KpiPeriodBar({
  preset,
  range,
  onPreset,
  onCustom,
  busy,
}: {
  preset: KpiPreset;
  range: KpiRange;
  onPreset: (p: KpiPreset) => void;
  onCustom: (r: KpiRange) => void;
  busy?: boolean;
}) {
  const toast = useToast();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold text-slate-600">Period</span>
      <Segmented<KpiPreset> size="small" value={preset} onChange={onPreset} options={KPI_PRESETS.map((p) => ({ value: p, label: KPI_PRESET_LABEL[p] }))} />
      {preset === "custom" && (
        <DatePicker.RangePicker
          size="small"
          format="DD.MM.YYYY"
          allowClear={false}
          value={[dayjs(range.from), dayjs(range.to)]}
          disabledDate={(d) => d.isAfter(dayjs().add(1, "year"))}
          onChange={(v) => {
            const [a, b] = v ?? [];
            if (!a || !b) return;
            const r = { from: a.format("YYYY-MM-DD"), to: b.format("YYYY-MM-DD") };
            if (daysIn(r.from, r.to) > KPI_MAX_DAYS) toast.warning(`Pick at most ${KPI_MAX_DAYS} days`);
            else onCustom(r);
          }}
        />
      )}
      <span className="text-xs text-slate-500">
        {periodText(range)} · Prague days{busy ? " · updating…" : ""}
      </span>
    </div>
  );
}
