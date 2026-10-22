"use client";

import type { ReactNode } from "react";
import { Alert, InputNumber, Radio } from "antd";
import { fmtQuantity } from "../_lib/fmtQuantity";
import { moneyInputParser } from "@/lib/money";
import { checkOog, gaugeAdvice, inGaugeMaximum, type OogCheck } from "../../../_lib/oog";
import type { QuoteOog } from "../../../_lib/types";
import { LINE_TD_CLASS, LINE_TH_CLASS, LINE_TH_RIGHT_CLASS, LineBlock, LineTable } from "./LineBlock";

interface QuoteOogBlockProps {
  value: QuoteOog | undefined;
  // The open-top and flat-rack types among the quote's containers (oogTypes).
  types: string[];
  onChange: (patch: Partial<QuoteOog>) => void;
  // Why the Cargo details step is not complete yet (oogMissing).
  missing: string | null;
}

// A measure the cargo stands out by: "28 cm", or a dash within gauge.
const over = (cm: number) => (cm > 0 ? <span className="font-semibold text-red-600">{fmtQuantity(cm)} cm</span> : <span className="text-slate-400">—</span>);

// Where the lost slots are, in words: "1 above, 1 left, 1 right, 2 diagonally above".
function lostText(lost: OogCheck["lost"]): string {
  const parts = [
    [lost.above, "above"],
    [lost.left, "left"],
    [lost.right, "right"],
    [lost.front, "front"],
    [lost.back, "back"],
    [lost.corners, "diagonally above"],
  ] as const;
  return parts
    .filter(([n]) => n > 0)
    .map(([n, where]) => `${n} ${where}`)
    .join(", ");
}

function Measure({ label, hint, value, onChange }: { label: string; hint: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <label className="block text-xs">
      <span className="block mb-1 text-slate-500 font-medium">{label}</span>
      <InputNumber
        size="small"
        className="!w-full"
        aria-label={`${label} in cm`}
        status={value ? undefined : "error"}
        min={0}
        parser={moneyInputParser}
        value={value}
        suffix="cm"
        onChange={(v) => onChange(v ?? undefined)}
      />
      <span className="block mt-0.5 text-[11px] text-slate-400">{hint}</span>
    </label>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-[150px] shrink-0 text-slate-500 font-medium">{label}</span>
      {children}
    </div>
  );
}

// The out-of-gauge requirements of a quote with an open top or flat rack among its containers:
// whether the cargo is in gauge, and its overall length, widest and highest piece - pre-filled
// with the most the equipment takes in gauge when the answer is Yes, to correct where needed.
// Against each such box the cargo's over-width, over-height and over-length are shown, and the
// slots on board it costs - indicative, as the carrier's equipment and stowage decide.
export function QuoteOogBlock({ value, types, onChange, missing }: QuoteOogBlockProps) {
  const o = value ?? {};
  const max = inGaugeMaximum(types);
  const measured = typeof o.inGauge === "boolean" && !!(o.length && o.width && o.height);
  const checks = measured ? types.map((t) => checkOog(t, { length: o.length!, width: o.width!, height: o.height! })).filter((c): c is OogCheck => !!c) : [];
  return (
    <LineBlock title="Out-of-gauge requirements">
      <div className="p-3 space-y-3">
        <Row label="In gauge (required)">
          <Radio.Group
            size="small"
            value={o.inGauge}
            onChange={(e) => {
              const inGauge = e.target.value as boolean;
              // In gauge: the equipment's maximum is typed in, to be corrected to the real cargo.
              onChange(inGauge && max ? { inGauge, length: max.length, width: max.width, height: max.height } : { inGauge });
            }}
          >
            <Radio value={true}>Yes</Radio>
            <Radio value={false}>No</Radio>
          </Radio.Group>
          {missing && <span className="text-[11px] text-red-600">{missing}</span>}
        </Row>

        {typeof o.inGauge === "boolean" && (
          <>
            {/* What a box's measures alone do not tell, said once per type. */}
            {types.flatMap((t) => {
              const advice = gaugeAdvice(t);
              return advice ? [<div key={t} className="text-[11px] font-medium text-indigo-700">{t}: {advice}</div>] : [];
            })}
            {o.inGauge && max && (
              <div className="text-[11px] text-slate-500">
                Pre-filled with the maximum in gauge for {max.limitedBy}: {max.length.toLocaleString("en-US")} × {max.width} × {max.height} cm. Correct it to the real cargo.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Measure label="Overall length" hint="All pieces combined" value={o.length} onChange={(v) => onChange({ length: v })} />
              <Measure label="Width" hint="The widest piece" value={o.width} onChange={(v) => onChange({ width: v })} />
              <Measure label="Height" hint="The highest piece" value={o.height} onChange={(v) => onChange({ height: v })} />
            </div>

            {checks.length > 0 && (
              <div className="border border-slate-200 rounded-md overflow-hidden">
                {/* The headings are long for their figures: the columns are wide enough for them, and a
                    heading that still does not fit wraps instead of running into the next one. */}
                <LineTable minWidthClass="min-w-[760px] [&_th]:!whitespace-normal">
                  <colgroup>
                    <col className="w-[110px]" />
                    <col className="w-[160px]" />
                    <col className="w-[130px]" />
                    <col className="w-[160px]" />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className={LINE_TH_CLASS}>Container</th>
                      <th scope="col" className={LINE_TH_RIGHT_CLASS}>Over-width / side</th>
                      <th scope="col" className={LINE_TH_RIGHT_CLASS}>Over-height</th>
                      <th scope="col" className={LINE_TH_RIGHT_CLASS}>Over-length / end</th>
                      <th scope="col" className={LINE_TH_CLASS}>Lost slots per container</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((c) => (
                      <tr key={c.type}>
                        <td className={`${LINE_TD_CLASS} font-medium text-slate-700`}>{c.type}</td>
                        <td className={`${LINE_TD_CLASS} text-right tabular-nums`}>{over(c.overWidthPerSide)}</td>
                        <td className={`${LINE_TD_CLASS} text-right tabular-nums`}>{over(c.overHeight)}</td>
                        <td className={`${LINE_TD_CLASS} text-right tabular-nums`}>{over(c.overLengthPerEnd)}</td>
                        <td className={LINE_TD_CLASS}>
                          {c.doesNotFit ? (
                            <span className="font-semibold text-red-600">{c.doesNotFit}</span>
                          ) : c.lost.total > 0 ? (
                            <span>
                              <span className="font-semibold text-slate-800">{c.lost.total}</span>
                              <span className="text-slate-500"> - {lostText(c.lost)}</span>
                            </span>
                          ) : (
                            <span className="text-green-700 font-semibold">None - within the box</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </LineTable>
              </div>
            )}
            {o.inGauge && checks.some((c) => c.doesNotFit || c.overWidthPerSide || c.overHeight || c.overLengthPerEnd) && (
              <Alert type="warning" showIcon message="These measures are out of gauge for the equipment - answer No to In gauge, or choose other equipment." />
            )}
            {checks.length > 0 && (
              <Alert
                type="info"
                showIcon
                message="Indicative: measured against standard inside dimensions, cargo centred on the box. The carrier confirms the equipment, the stowage and the lost slots it charges."
              />
            )}
          </>
        )}
      </div>
    </LineBlock>
  );
}
