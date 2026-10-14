"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Spin, Switch } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "@/lib/api";
import { CELL, FX_KEYS, TH, fmtRate, type AveragesResponse } from "./fxShared";

type Period = AveragesResponse["periods"][number];

function label(p: Period): string {
  if (p.type === "month") return dayjs(`${p.key}-01`).format("MMMM");
  if (p.type === "quarter") return p.key.slice(5);
  return `Year ${p.key}`;
}

export function AveragesTab({ initialYear }: { initialYear: number }) {
  const [year, setYear] = useState(initialYear);
  const [all, setAll] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: FX_KEYS.averages(year, all),
    queryFn: () => api.fx.fxAverages({ year, all }),
  });
  const currencies = data?.currencies ?? [];
  const groups: { title: string; type: Period["type"] }[] = [
    { title: "Months", type: "month" },
    { title: "Quarters", type: "quarter" },
    { title: "Year", type: "year" },
  ];

  return (
    <div className="flex flex-col gap-4 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="small" icon={<LeftOutlined />} onClick={() => setYear(year - 1)} disabled={year <= 2024} />
          <span className="text-[14px] font-semibold text-slate-700 w-[60px] text-center">{year}</span>
          <Button size="small" icon={<RightOutlined />} onClick={() => setYear(year + 1)} disabled={year >= initialYear} />
        </div>
        <label className="flex items-center gap-2 text-[13px] text-slate-600">
          <Switch size="small" checked={all} onChange={setAll} /> Show all ČNB currencies
        </label>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spin /></div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Period</th>
                {currencies.map((c) => <th key={c} className={`${TH} text-right`}>{c}</th>)}
                <th className={`${TH} text-right`}>Fixing days</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const rows = (data?.periods ?? []).filter((p) => p.type === g.type);
                if (!rows.length) return null;
                return [
                  <tr key={g.type}>
                    <td colSpan={currencies.length + 3} className="px-4 pt-3 pb-1 text-[11.5px] font-bold tracking-[.05em] uppercase text-slate-400">
                      {g.title}
                    </td>
                  </tr>,
                  ...rows.map((p) => (
                    <tr key={p.key}>
                      <td className={`${CELL} ${p.type === "month" ? "" : "font-semibold"}`}>{label(p)}</td>
                      {currencies.map((c) => (
                        <td key={c} className={`${CELL} text-right tabular-nums`}>
                          {fmtRate(p.averages.find((a) => a.currency === c)?.average)}
                        </td>
                      ))}
                      <td className={`${CELL} text-right tabular-nums text-slate-500`}>{p.averages[0]?.fixingDays ?? 0}</td>
                      <td className={CELL}>
                        {p.final ? (
                          <span className="text-[12px] font-semibold text-slate-600 bg-slate-100 rounded px-2 py-0.5">Final</span>
                        ) : (
                          <span className="text-[12px] font-semibold text-[#95620B] bg-[#FBEED2] rounded px-2 py-0.5">Provisional</span>
                        )}
                      </td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12.5px] text-slate-400 m-0">
        Average of the ČNB fixing days in the period, rounded to 3 decimals — the same method as ČNB&apos;s own published averages.
        Quarters and years average all their fixing days, not the monthly averages. Reports use these rates without the ROE %.
      </p>
    </div>
  );
}
