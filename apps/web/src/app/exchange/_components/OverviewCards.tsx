"use client";

import { useState } from "react";
import { Button, Tooltip } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, EditOutlined } from "@ant-design/icons";
import { formatDate } from "@/lib/date";
import { CARD, fmtPct, fmtRate, type FxOverview } from "./fxShared";
import { RoeDialog } from "./RoeDialog";

function Change({ rate, previous, previousDate }: { rate: number | null; previous: number | null; previousDate: string | null }) {
  if (rate == null || previous == null) return null;
  const diff = rate - previous;
  if (Math.abs(diff) < 0.0005) return <span className="text-[12px] text-slate-400">unchanged</span>;
  // Neutral colour: a stronger or weaker koruna is neither good nor bad in itself.
  const up = diff > 0;
  return (
    <Tooltip title={`vs ${formatDate(previousDate)}`}>
    <span className="text-[12px] font-semibold text-slate-500">
      {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(diff).toFixed(3)}
    </span>
    </Tooltip>
  );
}

export function OverviewCards({ data, isAdmin }: { data: FxOverview; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const pct = data.roe.pct;
  const fixingDate = data.rates.find((r) => r.fixingDate)?.fixingDate ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className={`${CARD} px-5 py-4`}>
        <div className="text-[12px] font-bold tracking-[.05em] uppercase text-slate-500">Today&apos;s ČNB rate</div>
        <div className="text-[12.5px] text-slate-400 mb-3">{fixingDate ? `Fixing of ${formatDate(fixingDate)}` : "No fixing yet"}</div>
        {data.rates.map((r) => (
          <div key={r.currency} className="flex items-baseline justify-between py-1">
            <span className="text-[14px] font-semibold text-slate-600">{r.currency}</span>
            <span className="flex items-baseline gap-3">
              <Change rate={r.rate} previous={r.previousRate} previousDate={r.previousFixingDate} />
              <span className="text-[22px] font-bold text-slate-900 tabular-nums">{fmtRate(r.rate)}</span>
            </span>
          </div>
        ))}
      </div>

      <div className={`${CARD} px-5 py-4`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[12px] font-bold tracking-[.05em] uppercase text-slate-500">Company ROE %</div>
            <div className="text-[12.5px] text-slate-400">
              {data.roe.effectiveFrom
                ? `Since ${formatDate(data.roe.effectiveFrom)}${data.roe.changedByName ? `, set by ${data.roe.changedByName}` : ""}`
                : "Standard — pure ČNB rate"}
            </div>
          </div>
          {isAdmin && (
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>
              Change
            </Button>
          )}
        </div>
        <div className="text-[28px] font-bold text-slate-900 tabular-nums mt-1">{fmtPct(pct)}</div>
        <div className="text-[12.5px] text-slate-500 mb-1">Pricing rate = ČNB × {fmtPct(pct)}</div>
        {data.rates.map((r) => (
          <div key={r.currency} className="flex items-baseline justify-between py-0.5">
            <span className="text-[13px] text-slate-600">{r.currency}</span>
            <span className="text-[15px] font-semibold text-slate-800 tabular-nums">{fmtRate(r.rate == null ? null : (r.rate * pct) / 100)}</span>
          </div>
        ))}
        {data.scheduledRoe && (
          <div className="text-[12px] text-[#95620B] mt-2">
            Changes to {fmtPct(data.scheduledRoe.pct)} on {formatDate(data.scheduledRoe.effectiveFrom)}
          </div>
        )}
      </div>

      <div className={`${CARD} px-5 py-4`}>
        <div className="text-[12px] font-bold tracking-[.05em] uppercase text-slate-500">This month&apos;s average</div>
        <div className="text-[12.5px] text-slate-400 mb-3">
          {data.month} · provisional · {data.monthAverages[0]?.fixingDays ?? 0} fixing days so far
        </div>
        {data.monthAverages.length === 0 && <div className="text-[13px] text-slate-400">No fixings this month yet</div>}
        {data.monthAverages.map((a) => (
          <div key={a.currency} className="flex items-baseline justify-between py-1">
            <span className="text-[14px] font-semibold text-slate-600">{a.currency}</span>
            <span className="text-[22px] font-bold text-slate-900 tabular-nums">{fmtRate(a.average)}</span>
          </div>
        ))}
        <div className="text-[12px] text-slate-400 mt-1">Used by reports; fixed when the month ends.</div>
      </div>

      {editing && <RoeDialog current={data.roe.pct} rates={data.rates} today={data.today} onClose={() => setEditing(false)} />}
    </div>
  );
}
