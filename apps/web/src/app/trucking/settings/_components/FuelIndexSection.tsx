"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Button, DatePicker, InputNumber, Spin } from "antd";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { apiErrorMessage } from "@/lib/api";
import { businessToday } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { useFuelIndex } from "@/hooks/useTrucking";
import { formatPercent } from "../../_lib/tariffs";
import { TruckingField } from "../../_components/TruckingField";

const monthLabel = (month: string) => dayjs(`${month}-01`).format("MMMM YYYY");

interface FuelIndexSectionProps {
  canEdit: boolean;
}

// The fuel index: the fuel surcharge percentage of each month, used by tariffs whose fuel
// surcharge follows the index. Saved on its own, apart from the other settings.
export const FuelIndexSection = ({ canEdit }: FuelIndexSectionProps) => {
  const toast = useToast();
  const { months, isLoading, isError, setMonth, isSetting } = useFuelIndex();
  const [month, setMonthValue] = useState(businessToday().slice(0, 7));
  const [percent, setPercent] = useState<number | null>(null);
  const valid = /^\d{4}-\d{2}$/.test(month) && percent != null && percent >= 0 && percent <= 100;
  const current = months.find((m) => m.month === month);

  const handleSet = async () => {
    if (percent == null) return;
    try {
      await setMonth({ month, percent });
      toast.success(`Fuel index for ${monthLabel(month)} set to ${formatPercent(percent)}`);
      setPercent(null);
    } catch (e) {
      toast.error(`Could not set the fuel index: ${apiErrorMessage(e)}`);
    }
  };

  return (
    <SectionCard title="Fuel index" extra={<CountChip count={months.length} />}>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-6">
        <div>
          {isLoading && <Spin size="small" />}
          {isError && <p className="m-0 text-[13px] text-red-600">The fuel index could not be read.</p>}
          {!isLoading && !isError && !months.length && <p className="m-0 text-[13px] text-slate-500">No month set yet — tariffs with a fuel-index surcharge add 0 %.</p>}
          {months.length > 0 && (
            <div className="max-h-[260px] overflow-y-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-1.5 pr-3 font-semibold">Month</th>
                    <th className="py-1.5 text-right font-semibold">Fuel surcharge</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month} className="border-b border-slate-100 last:border-b-0">
                      <td className="py-1.5 pr-3 text-slate-700">{monthLabel(m.month)}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">{formatPercent(m.percent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <TruckingField label="Month">
                <DatePicker
                  picker="month"
                  aria-label="Fuel index month"
                  format="MM/YYYY"
                  allowClear={false}
                  value={dayjs(`${month}-01`)}
                  onChange={(d) => d && setMonthValue(d.format("YYYY-MM"))}
                  className="w-full"
                />
              </TruckingField>
              <TruckingField label="Fuel surcharge (%)" hint={current ? `Now ${formatPercent(current.percent)}` : "Not set yet"}>
                <InputNumber aria-label="Fuel surcharge percent" min={0} max={100} step={0.1} value={percent} onChange={(v) => setPercent(v ?? null)} className="w-full" />
              </TruckingField>
            </div>
            <div>
              <Button type="primary" onClick={handleSet} loading={isSetting} disabled={!valid}>
                Set month
              </Button>
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 mb-0 text-[11px] text-slate-400">
        A consignment uses the month of its pick-up date; when that month is not set, the latest earlier month is used and the price line says so.
      </p>
    </SectionCard>
  );
};
