"use client";

import { useState } from "react";
import { InputNumber } from "antd";
import { SectionCard } from "@/components/SectionCard";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import type { BoxUtilization } from "../_lib/boxUtilization";
import type { SailingEarnings } from "../_lib/earnings";
import { whatIfOf } from "../_lib/sellRest";

const money = (v: number, currency: string) => `${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

// "What if I add this" (Council Outlay 14, B3): a manager types the cargo of an enquiry and what it
// would earn per W/M before the box, and sees the box and the sailing's profit with it. A sum on the
// screen only: nothing is saved, no shipment is made. Shown once the box has costs to share.
export function WhatIfCard({ earnings, box, currency }: { earnings: SailingEarnings; box: BoxUtilization | null; currency: string }) {
  const [cbm, setCbm] = useState<number | null>(null);
  const [kg, setKg] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const result = rate === null ? null : whatIfOf(earnings, box, { cbm: cbm ?? 0, kg: kg ?? 0, rate });
  const typed = (cbm ?? 0) > 0 || (kg ?? 0) > 0;

  return (
    <SectionCard title="What if I add this" extra={<span className={HINT}>a sum only, nothing is saved</span>}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL_TEXT}>Volume (cbm)</span>
            <InputNumber id="what-if-cbm" aria-label="Volume in cbm" min={0} max={500} precision={2} decimalSeparator="." value={cbm} onChange={setCbm} className="!w-full" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL_TEXT}>Weight (kg)</span>
            <InputNumber id="what-if-kg" aria-label="Weight in kg" min={0} max={100000} precision={0} value={kg} onChange={setKg} className="!w-full" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL_TEXT}>Earns per W/M, before the box ({currency})</span>
            <InputNumber id="what-if-rate" aria-label={`Earning per W/M in ${currency}`} min={0} max={1000000} precision={2} decimalSeparator="." value={rate} onChange={setRate} className="!w-full" />
          </label>
        </div>
        {result ? (
          <div className="flex flex-col gap-1 text-[13px] text-slate-700" role="status">
            <p className="m-0">
              <span className="font-semibold text-slate-900">{result.wm.toLocaleString("en-US", { maximumFractionDigits: 2 })} W/M</span> more. The box would stand at{" "}
              {[result.volumePct !== null ? `volume ${result.volumePct}%` : null, result.weightPct !== null ? `weight ${result.weightPct}%` : null].filter(Boolean).join(", ") || "no measured fill"}
              {result.over && <span className="font-semibold text-red-600"> - over its limit</span>}.
            </p>
            <p className="m-0">
              It earns <span className="font-semibold text-slate-900">{money(result.earns, result.currency)}</span> before the box and would carry {money(result.share, result.currency)} of the box costs, which the other shipments
              then no longer carry: <span className={`font-semibold ${result.after < 0 ? "text-red-600" : "text-slate-900"}`}>{money(result.after, result.currency)}</span> after its share.
            </p>
            <p className="m-0">
              The sailing&apos;s profit goes from <span className={result.profitNow < 0 ? "text-red-600" : ""}>{money(result.profitNow, result.currency)}</span> to{" "}
              <span className={`font-semibold ${result.profitThen < 0 ? "text-red-600" : "text-slate-900"}`}>{money(result.profitThen, result.currency)}</span>.
            </p>
          </div>
        ) : (
          <p className={`${HINT} m-0`}>{typed && rate === null ? "Type what it would earn per W/M." : "Type the cargo of an enquiry and what it would earn per W/M after its own costs (inland delivery, customs)."}</p>
        )}
        <p className={`${HINT} m-0`}>The box costs stay as they are, so all it earns before the box goes to the profit. Its W/M is the greater of its tonnes and its cbm.</p>
      </div>
    </SectionCard>
  );
}
