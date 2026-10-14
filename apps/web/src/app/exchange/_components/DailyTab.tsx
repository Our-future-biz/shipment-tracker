"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Spin, Switch, Tooltip } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { CELL, FX_KEYS, TH, fmtRate, type DailyResponse } from "./fxShared";

type Day = DailyResponse["days"][number];

const KIND: Record<Day["kind"], { label: string; cell: string }> = {
  fixing: { label: "ČNB fixing", cell: "bg-emerald-500" },
  weekend: { label: "Weekend — previous fixing applies", cell: "bg-slate-200" },
  no_fixing: { label: "Czech public holiday — previous fixing applies", cell: "bg-slate-300" },
  missing: { label: "Missing — not imported yet", cell: "bg-red-500" },
  pending: { label: "Waiting for today's fixing (pulled at 15:00)", cell: "bg-amber-300" },
  future: { label: "Future", cell: "bg-white border border-slate-200" },
};

function sourceText(day: Day): string {
  if (day.kind === "fixing") return day.fixingNo ? `ČNB no. ${day.fixingNo}` : "ČNB";
  const carried = day.rates[0]?.fixingDate;
  return carried ? `Carried from ${formatDate(carried)}` : "";
}

export function DailyTab({ initialMonth }: { initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const [all, setAll] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: FX_KEYS.daily(month, all),
    queryFn: () => api.fx.fxDaily({ month, all }),
  });

  const shift = (n: number) => setMonth(dayjs(`${month}-01`).add(n, "month").format("YYYY-MM"));
  const days = data?.days ?? [];
  const currencies = data?.currencies ?? [];
  const chronological = [...days].reverse();
  const showRoe = days.some((d) => d.roePct !== 100);

  return (
    <div className="flex flex-col gap-4 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="small" icon={<LeftOutlined />} onClick={() => shift(-1)} />
          <span className="text-[14px] font-semibold text-slate-700 w-[110px] text-center">{dayjs(`${month}-01`).format("MMMM YYYY")}</span>
          <Button size="small" icon={<RightOutlined />} onClick={() => shift(1)} disabled={month >= initialMonth} />
        </div>
        <label className="flex items-center gap-2 text-[13px] text-slate-600">
          <Switch size="small" checked={all} onChange={setAll} /> Show all ČNB currencies
        </label>
      </div>

      {/* One cell per day of the month, coloured by what ČNB published. */}
      <div className="flex flex-wrap gap-1">
        {chronological.map((d) => (
          <Tooltip key={d.date} title={`${formatDate(d.date)} — ${KIND[d.kind].label}`}>
            <div className={`w-6 h-6 rounded text-[10px] flex items-center justify-center ${KIND[d.kind].cell} ${d.kind === "fixing" || d.kind === "missing" ? "text-white" : "text-slate-500"}`}>
              {Number(d.date.slice(8))}
            </div>
          </Tooltip>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spin /></div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Date</th>
                {currencies.map((c) => <th key={c} className={`${TH} text-right`}>{c}</th>)}
                {!all && showRoe && currencies.map((c) => <th key={`roe-${c}`} className={`${TH} text-right`}>{c} pricing</th>)}
                <th className={TH}>Source</th>
              </tr>
            </thead>
            <tbody>
              {days.filter((d) => d.kind !== "future").map((d) => {
                const quiet = d.kind !== "fixing";
                return (
                  <tr key={d.date} className={quiet ? "bg-slate-50/60" : ""}>
                    <td className={`${CELL} whitespace-nowrap`}>
                      {formatDate(d.date)} <span className="text-slate-400 text-[12.5px]">{dayjs(d.date).format("ddd")}</span>
                    </td>
                    {currencies.map((c) => {
                      const r = d.rates.find((x) => x.currency === c);
                      return (
                        <td key={c} className={`${CELL} text-right tabular-nums ${quiet ? "text-slate-400" : "text-slate-900"}`}>
                          {fmtRate(r?.rate)}
                        </td>
                      );
                    })}
                    {!all && showRoe && currencies.map((c) => {
                      const r = d.rates.find((x) => x.currency === c);
                      return (
                        <td key={`roe-${c}`} className={`${CELL} text-right tabular-nums text-slate-500`}>
                          {fmtRate(r ? (r.rate * d.roePct) / 100 : null)}
                        </td>
                      );
                    })}
                    <td className={`${CELL} text-[13px] ${d.kind === "missing" ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                      {d.kind === "missing" || d.kind === "pending" ? KIND[d.kind].label : sourceText(d)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12.5px] text-slate-400 m-0">
        A fixing applies to its day and any following weekend or public holiday (ČNB rule). Rates are CZK per 1 unit.
      </p>
    </div>
  );
}
