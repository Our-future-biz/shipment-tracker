"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Spin } from "antd";
import { useInternalMonths, type InternalMonth } from "@/hooks/useTruckingMoney";
import { MONTH_STATUS_CHIP, monthCount, monthLabel, monthTotal } from "../_lib/internalBilling";
import { formatMoney } from "../_lib/tariffs";
import { InternalMonthDetail } from "./InternalMonthDetail";
import { TruckingStatusChip } from "./TruckingStatusChip";

// Internal billing: the current month and twelve back, with their totals per department; a month
// opens its charges (?month=).
export const TruckingInternalBillingTab = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { months, isLoading, isError } = useInternalMonths();
  const chosen = months.find((m) => m.month === searchParams.get("month")) ?? null;

  const handleOpen = (m: InternalMonth) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", m.month);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-16">
        <Spin />
      </div>
    );
  }
  if (chosen) return <InternalMonthDetail month={chosen} />;

  return (
    <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2">Month</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2 text-right">Consignments</th>
            <th className="px-4 py-2">Per department</th>
            <th className="px-4 py-2 text-right">Total</th>
            <th className="px-4 py-2">Statements</th>
          </tr>
        </thead>
        <tbody>
          {months.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                {isError ? "The months could not be loaded." : "No months yet."}
              </td>
            </tr>
          )}
          {months.map((m) => (
            <tr
              key={m.month}
              tabIndex={0}
              aria-label={`Open ${monthLabel(m.month)}`}
              onClick={() => handleOpen(m)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpen(m);
                }
              }}
              className="cursor-pointer border-b border-slate-100 align-top last:border-b-0 hover:bg-slate-50 focus:bg-indigo-50 focus:outline-none"
            >
              <td className="px-4 py-2 font-semibold text-indigo-600">{monthLabel(m.month)}</td>
              <td className="px-4 py-2">
                <TruckingStatusChip chip={MONTH_STATUS_CHIP[m.status]} />
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{monthCount(m)}</td>
              <td className="px-4 py-2 text-slate-600">{m.totals.map((t) => `${t.department} ${formatMoney(t.amount, "CZK")} (${t.count})`).join(" · ") || "—"}</td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatMoney(monthTotal(m), "CZK")}</td>
              <td className="px-4 py-2 font-mono text-[12px] text-slate-600">{m.statementNumbers.join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
