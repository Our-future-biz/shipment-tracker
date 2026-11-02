"use client";

import { Button, Modal, Select, Tooltip } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, CloseOutlined } from "@ant-design/icons";
import { CARD_CURRENCIES } from "./useFxCurrencies";
import { CELL, TH, currencyName, fmtAverage, fmtPct, fmtQuoted, type FxOverview } from "./fxShared";
import { RateChange } from "./RateChange";

interface Props {
  data: FxOverview;
  /** The user's list as it stands (it may be ahead of `data` while new rates load) */
  list: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}

// Every currency the user picked, with today's rate, the pricing rate and the month's average;
// here they add, remove and order them. The first CARD_CURRENCIES are the ones on the cards.
export function CurrenciesDialog({ data, list, onChange, onClose }: Props) {
  const pct = data.roe.pct;
  const rateOf = new Map(data.rates.map((r) => [r.currency, r]));
  const averageOf = new Map(data.monthAverages.map((a) => [a.currency, a]));

  const move = (i: number, by: number) => {
    const next = [...list];
    next.splice(i + by, 0, ...next.splice(i, 1));
    onChange(next);
  };

  const options = data.available
    .filter((c) => !list.includes(c))
    .map((c) => ({ value: c, label: `${c}${currencyName(c) ? ` — ${currencyName(c)}` : ""}` }));

  return (
    <Modal open title="Your currencies" footer={null} onCancel={onClose} width={860} destroyOnHidden>
      <div className="text-[13px] text-slate-500 mb-3">
        ČNB rates in CZK. The first {CARD_CURRENCIES} are shown on the cards; use the arrows to change which.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>Currency</th>
              <th className={`${TH} !text-right`}>Today&apos;s ČNB</th>
              <th className={`${TH} !text-right`}>Pricing at {fmtPct(pct)}</th>
              <th className={`${TH} !text-right`}>{data.month} average</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {list.map((c, i) => {
              const r = rateOf.get(c);
              return (
                <tr key={c} className={i === CARD_CURRENCIES - 1 && list.length > CARD_CURRENCIES ? "border-b-2 border-slate-300" : ""}>
                  <td className={CELL}>
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-slate-800">{c}</span>
                      <span className="text-[12.5px] text-slate-400 whitespace-nowrap">{currencyName(c)}</span>
                      {i < CARD_CURRENCIES && (
                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 rounded px-1.5 whitespace-nowrap">on cards</span>
                      )}
                    </div>
                  </td>
                  <td className={`${CELL} text-right whitespace-nowrap`}>
                    {r ? (
                      <span className="inline-flex items-baseline gap-3">
                        <RateChange rate={r.rate} previous={r.previousRate} previousDate={r.previousFixingDate} amount={r.amount} />
                        <span className="font-semibold text-slate-900 tabular-nums">{fmtQuoted(r.rate, r.amount)}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400">…</span>
                    )}
                  </td>
                  <td className={`${CELL} text-right tabular-nums whitespace-nowrap`}>
                    {r ? fmtQuoted(r.rate == null ? null : (r.rate * pct) / 100, r.amount) : "…"}
                  </td>
                  <td className={`${CELL} text-right tabular-nums whitespace-nowrap`}>{r ? fmtAverage(averageOf.get(c)) : "…"}</td>
                  <td className={`${CELL} text-right whitespace-nowrap`}>
                    <Tooltip title="Move up">
                      <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${c} up`} />
                    </Tooltip>
                    <Tooltip title="Move down">
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowDownOutlined />}
                        disabled={i === list.length - 1}
                        onClick={() => move(i, 1)}
                        aria-label={`Move ${c} down`}
                      />
                    </Tooltip>
                    <Tooltip title={list.length === 1 ? "Keep at least one currency" : "Remove"}>
                      <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        disabled={list.length === 1}
                        onClick={() => onChange(list.filter((x) => x !== c))}
                        aria-label={`Remove ${c}`}
                      />
                    </Tooltip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <Select
          showSearch
          value={null}
          placeholder="Add a currency…"
          options={options}
          optionFilterProp="label"
          onSelect={(c: string | null) => c && onChange([...list, c])}
          className="w-80"
          disabled={options.length === 0}
          aria-label="Add a currency"
        />
        <span className="text-[12.5px] text-slate-400">{data.available.length} currencies published by ČNB</span>
      </div>
    </Modal>
  );
}
