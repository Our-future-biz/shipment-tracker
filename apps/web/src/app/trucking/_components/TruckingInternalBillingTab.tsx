"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Spin } from "antd";
import { useInternalMonths, type InternalMonth } from "@/hooks/useTruckingMoney";
import { CARD, EMPTY, REF, TD, TH } from "@/styles/ui";
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
    <section className={`${CARD} overflow-x-auto`}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>Month</th>
            <th className={TH}>Status</th>
            <th className={`${TH} !text-right`}>Consignments</th>
            <th className={TH}>Per department</th>
            <th className={`${TH} !text-right`}>Total</th>
            <th className={TH}>Statements</th>
          </tr>
        </thead>
        <tbody>
          {months.length === 0 && (
            <tr>
              <td colSpan={6} className="px-2 py-8 text-center text-[13px] text-slate-500">
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
              className="cursor-pointer [&>td]:align-top [&:last-child>td]:border-b-0 hover:bg-slate-50 focus:bg-indigo-50 focus:outline-none"
            >
              <td className={`${TD} font-semibold !text-indigo-600`}>{monthLabel(m.month)}</td>
              <td className={TD}>
                <TruckingStatusChip chip={MONTH_STATUS_CHIP[m.status]} />
              </td>
              <td className={`${TD} text-right tabular-nums`}>{monthCount(m)}</td>
              <td className={TD}>{m.totals.map((t) => `${t.department} ${formatMoney(t.amount, "CZK")} (${t.count})`).join(" · ") || <span className={EMPTY}>—</span>}</td>
              <td className={`${TD} text-right font-semibold tabular-nums`}>{formatMoney(monthTotal(m), "CZK")}</td>
              <td className={`${TD} ${REF}`}>{m.statementNumbers.join(", ") || <span className={EMPTY}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
