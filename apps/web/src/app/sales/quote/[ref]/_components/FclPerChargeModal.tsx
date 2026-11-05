"use client";

import { useState } from "react";
import { Button, InputNumber, Select } from "antd";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { fmtMoney, moneyInputParser } from "@/lib/money";
import { AppModal } from "@/components/AppModal";
import { MAX_PROFIT_PERCENT, blockProfitOf, priceFclBlock, type FclBlock } from "@/app/sales/_lib/fclPricing";
import type { LivePricing } from "@/app/sales/_lib/salesQuote";
import type { FclProfit, SalesQuoteData } from "@/app/sales/_lib/types";
import { FCL_PROFIT_MODES } from "../_lib/fclPricingUi";
import { LINE_TD_CLASS, LINE_TH_CLASS, LINE_TH_RIGHT_CLASS, LineTable } from "./LineBlock";
import { TD_TOTAL } from "@/styles/ui";

interface FclPerChargeModalProps {
  block: FclBlock;
  quote: SalesQuoteData;
  sheet: ExchangeRates;
  /** Today's ROE % (a draft's): charges in another currency than the quote's are sold at it. */
  live?: LivePricing;
  currency: string;
  onClose: () => void;
  onSave: (profits: Map<number, FclProfit>) => void;
  onOneProfit: (total: number) => void;
}

// "Edit per charge": the profit of each charge of a block that takes profit, as a % of its selling
// price or a sum, opened with what the block's profit puts on each now.
export function FclPerChargeModal({ block, quote, sheet, live, currency, onClose, onSave, onOneProfit }: FclPerChargeModalProps) {
  const lines = quote.buyingLines ?? [];
  const setting = blockProfitOf(quote, block.key);
  const now = priceFclBlock(quote, sheet, block, live);
  const taking = now.charges.filter((c) => c.takesProfit && c.buying !== null);
  const [profits, setProfits] = useState<Map<number, FclProfit>>(
    () =>
      new Map(
        taking.map((c) => {
          const own = setting.perCharge ? lines[c.index]!.chargeProfit : undefined;
          return [c.index, own ?? (setting.mode === "percent" && !setting.perCharge ? { mode: "percent", value: setting.value } : { mode: "sum", value: c.profit })];
        }),
      ),
  );
  // The block as the window has it: each charge with the profit set here.
  const preview = priceFclBlock(
    {
      ...quote,
      buyingLines: lines.map((l, i) => (profits.has(i) ? { ...l, chargeProfit: profits.get(i)! } : l)),
      fclPricing: { blocks: { ...quote.fclPricing?.blocks, [block.key]: { ...setting, perCharge: true } } },
    },
    sheet,
    block,
    live,
  );
  const per = block.perContainer ? " / ctr" : "";
  const put = (i: number, patch: Partial<FclProfit>) => setProfits((m) => new Map(m).set(i, { ...m.get(i)!, ...patch }));

  return (
    <AppModal
      open
      onClose={onClose}
      size="large"
      title={`Profit per charge - ${block.label}`}
      subtitle={block.perContainer ? "Per container. % profit is a whole number." : "% profit is a whole number."}
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <Button onClick={() => onOneProfit(now.profit)} disabled={!setting.perCharge}>
            Use one profit for the block
          </Button>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" onClick={() => onSave(profits)}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <LineTable minWidthClass="min-w-[640px]">
        <colgroup>
          <col className="w-[150px]" />
          <col />
          <col className="w-[200px]" />
          <col className="w-[110px]" />
          <col className="w-[110px]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={LINE_TH_CLASS}>Charge</th>
            <th scope="col" className={LINE_TH_CLASS}>Description</th>
            <th scope="col" className={LINE_TH_CLASS}>Profit{per}</th>
            <th scope="col" className={LINE_TH_RIGHT_CLASS}>Buying{per}</th>
            <th scope="col" className={LINE_TH_RIGHT_CLASS}>Selling{per}</th>
          </tr>
        </thead>
        <tbody>
          {preview.charges
            .filter((c) => profits.has(c.index))
            .map((c) => {
              const l = lines[c.index]!;
              const p = profits.get(c.index)!;
              return (
                <tr key={l.pairId ?? c.index}>
                  <td className={LINE_TD_CLASS}>{l.type}</td>
                  <td className={LINE_TD_CLASS}>{l.description}</td>
                  <td className={LINE_TD_CLASS}>
                    <div className="flex items-center gap-1">
                      <InputNumber
                        size="small"
                        className="!w-[110px]"
                        aria-label={`Profit of ${l.description || l.type}`}
                        min={p.mode === "percent" ? 0 : undefined}
                        max={p.mode === "percent" ? MAX_PROFIT_PERCENT : undefined}
                        precision={p.mode === "percent" ? 0 : 2}
                        parser={moneyInputParser}
                        value={p.value}
                        onChange={(v) => put(c.index, { value: Number(v) || 0 })}
                      />
                      <Select
                        size="small"
                        className="w-[72px]"
                        aria-label={`Profit of ${l.description || l.type} as`}
                        value={p.mode}
                        options={FCL_PROFIT_MODES}
                        // The same profit the other way round: a sum as its whole %, a % as its sum.
                        onChange={(mode: FclProfit["mode"]) => put(c.index, { mode, value: mode === "sum" ? c.profit : (c.percent ?? 0) })}
                      />
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {p.mode === "percent" ? fmtMoney(c.profit, currency) : c.percent !== null ? `${c.percent} %` : ""}
                    </span>
                  </td>
                  <td className={`${LINE_TD_CLASS} text-right tabular-nums`}>{fmtMoney(c.buying, currency)}</td>
                  <td className={`${LINE_TD_CLASS} text-right font-semibold tabular-nums`}>{c.selling === null ? "—" : fmtMoney(c.selling, currency)}</td>
                </tr>
              );
            })}
        </tbody>
        <tfoot>
          <tr>
            <td className={TD_TOTAL} colSpan={2}>
              Block
            </td>
            <td className={`${TD_TOTAL} tabular-nums`}>
              {fmtMoney(preview.profit, currency)}
              {preview.percent !== null && <span className="text-slate-400 font-normal"> · {preview.percent} %</span>}
            </td>
            <td className={`${TD_TOTAL} text-right tabular-nums`}>{fmtMoney(preview.buying, currency)}</td>
            <td className={`${TD_TOTAL} text-right tabular-nums`}>{fmtMoney(preview.selling, currency)}</td>
          </tr>
        </tfoot>
      </LineTable>
      <p className="mt-2 mb-0 text-[12px] text-slate-500">Charges that take no profit are offered at cost and are not listed here.</p>
    </AppModal>
  );
}
