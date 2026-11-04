"use client";

import type { ReactNode } from "react";
import { Checkbox, Input, Select } from "antd";
import { SupplierPicker } from "@/components/SupplierPicker";
import { PlusOutlined } from "@ant-design/icons";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { chargeOptions, toChargeCode } from "@/lib/chargeCodes";
import { CURRENCIES } from "@/lib/enums";
import { fmtMoney } from "@/lib/money";
import { fmtQuantity } from "../_lib/fmtQuantity";
import { isInAllIn, isProfitBasis, priceFclBlock, type FclBlock } from "@/app/sales/_lib/fclPricing";
import { lineRate, perUnitBasis, type LivePricing } from "@/app/sales/_lib/salesQuote";
import type { CostLine, FclBlockProfit, SalesQuoteData } from "@/app/sales/_lib/types";
import { FclProfitRow } from "./FclProfitRow";
import { LockedAmountInput } from "./LockedAmountInput";
import { MiniButton, RemoveLineButton } from "./QuoteButtons";
import { LINE_TD_CLASS, LINE_TH_CHECK_CLASS, LINE_TH_CLASS, LINE_TH_RIGHT_CLASS, LineBlock, LineBlockEmpty, LineTable } from "./LineBlock";

interface FclBlockCardProps {
  block: FclBlock;
  quote: SalesQuoteData;
  sheet: ExchangeRates;
  /** Today's ROE % (a draft's): charges in another currency than the quote's are sold at it. */
  live?: LivePricing;
  currency: string;
  closed: boolean;
  setting: FclBlockProfit;
  onAdd: () => void;
  onPatchLine: (index: number, patch: Partial<CostLine>) => void;
  onChooseService: (index: number, code: string) => void;
  onRate: (index: number, rate: number) => void;
  onRemove: (index: number) => void;
  onSetting: (patch: Partial<FclBlockProfit>) => void;
  onEditPerCharge: () => void;
  lineTag?: (line: CostLine) => ReactNode;
  lineAction?: (line: CostLine, index: number) => ReactNode;
  lineWarn?: (index: number) => boolean;
}

// One block of FCL pricing (a container type, or the charges per shipment): its charges, each
// with its buying and what the block's profit puts on it, and the block's profit below.
export function FclBlockCard({
  block,
  quote,
  sheet,
  live,
  currency,
  closed,
  setting,
  onAdd,
  onPatchLine,
  onChooseService,
  onRate,
  onRemove,
  onSetting,
  onEditPerCharge,
  lineTag,
  lineAction,
  lineWarn,
}: FclBlockCardProps) {
  const lines = quote.buyingLines ?? [];
  const allIn = !!quote.allIn;
  const priced = priceFclBlock(quote, sheet, block, live);
  const per = block.perContainer ? " per container" : "";
  const title = block.perContainer ? `${block.label} · ${block.units} ${block.units === 1 ? "container" : "containers"}` : block.label;

  return (
    <LineBlock
      title={title}
      actions={
        <MiniButton icon={<PlusOutlined />} disabled={closed} onClick={onAdd}>
          Add charge
        </MiniButton>
      }
    >
      {block.weights.length > 0 && (
        <div className="px-3 pt-2 text-[12px] text-slate-600">
          Cargo weight{" "}
          <span className="font-semibold">{block.weights.map((w) => `${fmtQuantity(w)} kgs`).join(", ")}</span> per container
        </div>
      )}
      {block.lines.length === 0 ? (
        <LineBlockEmpty>{block.perContainer ? "No charges per container yet." : "No charges per shipment yet (B/L fee, documentation…)."}</LineBlockEmpty>
      ) : (
        <LineTable minWidthClass="min-w-[1080px]">
          <colgroup>
            <col className="w-14" />
            <col className="w-20" />
            <col className="w-[150px]" />
            <col />
            <col className="w-[110px]" />
            <col className="w-20" />
            <col className="w-24" />
            <col className="w-[104px]" />
            <col className="w-[104px]" />
            <col className="w-[104px]" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={LINE_TH_CHECK_CLASS}>All in</th>
              <th scope="col" className={LINE_TH_CHECK_CLASS}>Profit basis</th>
              <th scope="col" className={LINE_TH_CLASS}>Charge</th>
              <th scope="col" className={LINE_TH_CLASS}>Description</th>
              <th scope="col" className={LINE_TH_CLASS}>Supplier</th>
              <th scope="col" className={LINE_TH_CLASS}>Ccy</th>
              <th scope="col" className={LINE_TH_CLASS}>Buying{per && " / ctr"}</th>
              <th scope="col" className={LINE_TH_RIGHT_CLASS}>In {currency}</th>
              <th scope="col" className={LINE_TH_RIGHT_CLASS}>Profit</th>
              <th scope="col" className={LINE_TH_RIGHT_CLASS}>Selling</th>
              <th scope="col" aria-label="Remove charge" className={LINE_TH_CLASS} />
            </tr>
          </thead>
          <tbody>
            {priced.charges.map((c) => {
              const l = lines[c.index]!;
              const tag = lineTag?.(l);
              const action = lineAction?.(l, c.index);
              return (
                <tr key={l.pairId ?? c.index} className={lineWarn?.(c.index) ? "bg-amber-50" : undefined}>
                  <td className={`${LINE_TD_CLASS} text-center`}>
                    <Checkbox
                      aria-label="In the all-in price"
                      checked={isInAllIn(l)}
                      // Only an all-in offer has an all-in price. `undefined` when open: a closed quote's lock still applies.
                      disabled={!allIn || undefined}
                      onChange={(e) => onPatchLine(c.index, { inAllIn: e.target.checked })}
                    />
                  </td>
                  <td className={`${LINE_TD_CLASS} text-center`}>
                    <Checkbox
                      aria-label="Profit basis"
                      checked={isProfitBasis(l)}
                      // In an all-in offer the profit goes on the all-in price.
                      disabled={allIn || undefined}
                      onChange={(e) => onPatchLine(c.index, { profitBasis: e.target.checked })}
                    />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <Select
                      size="small"
                      className="w-full"
                      aria-label="Charge"
                      showSearch
                      optionFilterProp="label"
                      popupMatchSelectWidth={380}
                      value={l.chargeCode || toChargeCode(l.type)}
                      onChange={(v) => onChooseService(c.index, v)}
                      options={chargeOptions(l.chargeCode || toChargeCode(l.type), quote.serviceType)}
                    />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <Input size="small" aria-label="Description" placeholder="Description" value={l.description} onChange={(e) => onPatchLine(c.index, { description: e.target.value })} />
                    {(tag || action) && (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {tag}
                        {action}
                      </div>
                    )}
                  </td>
                  <td className={LINE_TD_CLASS}>
                    {/* Picked from the Customer Database's suppliers (with their stars) or typed; a tariff's line keeps the tariff's supplier. */}
                    <SupplierPicker
                      value={{ name: l.supplier ?? "", supplierCustomerId: l.supplierCustomerId ?? null }}
                      readOnly={!!l.tariffRef}
                      onChange={(next) => onPatchLine(c.index, { supplier: next.name, supplierCustomerId: next.supplierCustomerId ?? undefined })}
                    />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <Select
                      showSearch
                      size="small"
                      className="w-full"
                      aria-label="Currency"
                      optionFilterProp="label"
                      value={l.currency}
                      onChange={(v) => onPatchLine(c.index, { currency: v })}
                      options={CURRENCIES.map((x) => ({ value: x, label: x }))}
                    />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <LockedAmountInput
                      aria-label={`Buying${per || (perUnitBasis(l.basis) ? " per W/M" : "")}`}
                      // What onRate takes: the rate per container or per W/M (a line charged per W/M
                      // among the charges per shipment), else the whole line.
                      value={block.perContainer || perUnitBasis(l.basis) ? lineRate(l) : Number(l.amount) || 0}
                      currency={l.currency}
                      onChange={(rate) => onRate(c.index, rate)}
                    />
                  </td>
                  <td className={`${LINE_TD_CLASS} text-right tabular-nums whitespace-nowrap ${c.buying === null ? "text-red-600" : "text-slate-600"}`}>
                    {c.buying === null ? "no rate" : fmtMoney(c.buying, currency)}
                  </td>
                  <td className={`${LINE_TD_CLASS} text-right tabular-nums whitespace-nowrap ${c.takesProfit ? "text-slate-700" : "text-slate-400"}`}>
                    {c.takesProfit ? fmtMoney(c.profit, currency) : "at cost"}
                    {c.takesProfit && c.percent !== null && <span className="block text-[10.5px] text-slate-400">{c.percent} %</span>}
                  </td>
                  <td className={`${LINE_TD_CLASS} text-right font-semibold tabular-nums whitespace-nowrap text-slate-800`}>
                    {c.selling === null ? "—" : fmtMoney(c.selling, currency)}
                    {c.roe !== 0 && <span className="block text-[10.5px] font-normal text-slate-400">incl. ROE {fmtMoney(c.roe, currency)}</span>}
                  </td>
                  <td className={`${LINE_TD_CLASS} pl-0`}>
                    <RemoveLineButton label={`Remove charge ${l.description || l.type}`} onClick={() => onRemove(c.index)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </LineTable>
      )}
      <FclProfitRow
        block={block}
        priced={priced}
        setting={setting}
        currency={currency}
        closed={closed}
        onSetting={onSetting}
        onEditPerCharge={onEditPerCharge}
      />
    </LineBlock>
  );
}
