"use client";

import Link from "next/link";
import type { interfaces } from "@/lib/api/client";
import { Pill } from "@/components/Pill";
import { chargeLabel } from "@/lib/chargeCodes";
import { formatAmount } from "@/lib/money";
import { EMPTY, LINK, REF, TD, TH } from "@/styles/ui";
import { lineHref } from "../_lib/payables";

// An invoice opened to its lines (D1): per job, the charge, the estimate, what the invoice bills and the
// difference. Amounts are not edited here: Costs Breakdown stays the one place for that.

const HEAD = `${TH} first:pl-4 last:pr-4`;
const CELL = `${TD} first:pl-4 last:pr-4`;
const NUM = "!text-right tabular-nums whitespace-nowrap";

function Difference({ value, currency }: { value: number | null; currency: string }) {
  if (value === null) return <span className={EMPTY}>—</span>;
  if (Math.abs(value) < 0.005) return <span className="text-slate-500">as estimated</span>;
  return (
    <span className={value > 0 ? "text-red-600 font-medium" : "text-emerald-700"}>
      {value > 0 ? "+" : ""}
      {formatAmount(value, currency)}
    </span>
  );
}

export function PayableLines({ lines }: { lines: interfaces.PayableLineItem[] }) {
  if (!lines.length) return <div className="px-4 py-3 text-[13px] text-slate-400">No lines on the jobs.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={HEAD}>Job</th>
            <th className={HEAD}>Charge</th>
            <th className={HEAD}>Description</th>
            <th className={`${HEAD} !text-right`}>Estimate</th>
            <th className={`${HEAD} !text-right`}>Amount</th>
            <th className={`${HEAD} !text-right`}>Difference</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const href = lineHref(l);
            return (
              <tr key={l.lineId}>
                <td className={`${CELL} whitespace-nowrap`}>
                  {href ? (
                    <Link href={href} className={`${REF} font-semibold ${LINK}`} onClick={(e) => e.stopPropagation()}>
                      {l.jobNumber || "Job"}
                    </Link>
                  ) : (
                    <span className={REF}>{l.jobNumber || "—"}</span>
                  )}
                  {l.kind === "master_job" && (
                    <Pill tone="slate" className="ml-1.5" title="A master job's line, shared out to its jobs">
                      Master job
                    </Pill>
                  )}
                  {l.customer && <div className="text-[12px] text-slate-500 max-w-[200px] truncate" title={l.customer}>{l.customer}</div>}
                </td>
                <td className={CELL}>{l.category ? chargeLabel(l.category) : <span className={EMPTY}>—</span>}</td>
                <td className={`${CELL} max-w-[280px]`}>
                  <span className="block truncate" title={l.description}>
                    {l.description || <span className={EMPTY}>—</span>}
                  </span>
                </td>
                <td className={`${CELL} ${NUM}`}>{l.estimate === null ? <span className="text-slate-400">no estimate</span> : formatAmount(l.estimate, l.estCurrency)}</td>
                <td className={`${CELL} ${NUM} font-semibold text-slate-900`}>{formatAmount(l.amount, l.currency)}</td>
                <td className={`${CELL} ${NUM}`}>
                  <Difference value={l.difference} currency={l.currency} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
