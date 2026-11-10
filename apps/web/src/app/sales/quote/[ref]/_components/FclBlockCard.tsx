"use client";

import type { ReactNode } from "react";
import { Checkbox, Input, Select } from "antd";
import { SupplierPicker } from "@/components/SupplierPicker";
import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { chargeOptions, toChargeCode } from "@/lib/chargeCodes";
import { CURRENCIES } from "@/lib/enums";
import { fmtMoney, roundCents } from "@/lib/money";
import { formatNumber } from "@/lib/number";
import { fmtQuantity } from "../_lib/fmtQuantity";
import { isInAllIn, priceFclBlock, type FclBlock } from "@/app/sales/_lib/fclPricing";
import { lineRate, perUnitBasis, type LivePricing } from "@/app/sales/_lib/salesQuote";
import type { CostLine, SalesQuoteData } from "@/app/sales/_lib/types";
import { LABEL_TEXT, TD_TOTAL } from "@/styles/ui";
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
  onAdd: () => void;
  onPatchLine: (index: number, patch: Partial<CostLine>) => void;
  onChooseService: (index: number, code: string) => void;
  onRate: (index: number, rate: number) => void;
  onRemove: (index: number) => void;
  onEditPerCharge: () => void;
  lineTag?: (line: CostLine) => ReactNode;
  lineAction?: (line: CostLine, index: number) => ReactNode;
  lineWarn?: (index: number) => boolean;
}

// A figure of the block's totals row, under its column.
const TOTAL_FIGURE_CLASS = `${TD_TOTAL} align-baseline text-right tabular-nums whitespace-nowrap`;
// The second line of a figure: its % or the ROE in it.
const FIGURE_NOTE_CLASS = "block text-[11px] font-normal text-slate-400";

// One block of FCL pricing (a container type, or the charges per shipment): its charges, each
// with its buying and what the block's profit puts on it, and the block's totals under them - per
// container in a container block, and for all its containers under that. Its header says the cargo
// weight of its containers and opens "Profit per charge", where the profit is set.
export function FclBlockCard({
  block,
  quote,
  sheet,
  live,
  currency,
  closed,
  onAdd,
  onPatchLine,
  onChooseService,
  onRate,
  onRemove,
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
  const many = block.perContainer && block.units > 1;
  const times = (amount: number) => fmtMoney(roundCents(amount * block.units), currency);

  return (
    <LineBlock
      title={title}
      note={
        block.weights.length > 0 && (
          <>
            Cargo weight{" "}
            <span className="font-semibold text-slate-700">{block.weights.map((w) => `${fmtQuantity(w)} kgs`).join(", ")}</span> per container
          </>
        )
      }
      actions={
        <>
          <MiniButton icon={<EditOutlined />} title="Set the profit of each charge" disabled={closed || priced.charges.length === 0} onClick={onEditPerCharge}>
            Profit per charge
          </MiniButton>
          <MiniButton icon={<PlusOutlined />} disabled={closed} onClick={onAdd}>
            Add charge
          </MiniButton>
        </>
      }
    >
      {block.lines.length === 0 ? (
        <LineBlockEmpty>{block.perContainer ? "No charges per container yet." : "No charges per shipment yet (B/L fee, documentation…)."}</LineBlockEmpty>
      ) : (
        <LineTable minWidthClass="min-w-[960px]">
          <colgroup>
            <col className="w-[54px]" />
            <col className="w-[144px]" />
            <col />
            <col className="w-[110px]" />
            <col className="w-20" />
            <col className="w-24" />
            <col className="w-[104px]" />
            <col className="w-24" />
            <col className="w-[108px]" />
            <col className="w-9" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={LINE_TH_CHECK_CLASS}>All in</th>
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
                      // A quote sent as a breakdown had no all-in price.
                      checked={allIn && isInAllIn(l)}
                      onChange={(e) => onPatchLine(c.index, { inAllIn: e.target.checked })}
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
                  <td className={`${LINE_TD_CLASS} text-right tabular-nums whitespace-nowrap ${c.buying === null ? "!text-red-600" : ""}`}>
                    {c.buying === null ? "no rate" : fmtMoney(c.buying, currency)}
                  </td>
                  <td className={`${LINE_TD_CLASS} text-right tabular-nums whitespace-nowrap ${c.takesProfit ? "" : "!text-slate-400"}`}>
                    {c.takesProfit ? fmtMoney(c.profit, currency) : "at cost"}
                    {c.takesProfit && c.percent !== null && <span className={FIGURE_NOTE_CLASS}>{c.percent} %</span>}
                  </td>
                  <td className={`${LINE_TD_CLASS} text-right font-semibold tabular-nums whitespace-nowrap !text-slate-900`}>
                    {c.selling === null ? "—" : fmtMoney(c.selling, currency)}
                    {/* The figure above names the currency: with it again, the line would not fit its column. */}
                    {c.roe !== 0 && (
                      <span className={FIGURE_NOTE_CLASS} title={`Includes ${fmtMoney(c.roe, currency)} of ROE (the FX buffer)`}>
                        incl. ROE {formatNumber(c.roe, 2)}
                      </span>
                    )}
                  </td>
                  <td className={`${LINE_TD_CLASS} !pl-0`}>
                    <RemoveLineButton label={`Remove charge ${l.description || l.type}`} onClick={() => onRemove(c.index)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className={`${TD_TOTAL} align-baseline`} colSpan={6}>
                <span className={LABEL_TEXT}>{block.perContainer ? "Total per container" : "Total"}</span>
              </td>
              <td className={TOTAL_FIGURE_CLASS}>{fmtMoney(priced.buying, currency)}</td>
              <td className={TOTAL_FIGURE_CLASS}>
                {fmtMoney(priced.profit, currency)}
                {priced.percent !== null && <span className={FIGURE_NOTE_CLASS}>{priced.percent} %</span>}
              </td>
              <td className={TOTAL_FIGURE_CLASS}>
                {fmtMoney(priced.selling, currency)}
                {priced.roe !== 0 && (
                  <span
                    className={FIGURE_NOTE_CLASS}
                    title={`Total selling includes ${fmtMoney(priced.roe, currency)}${block.perContainer ? " / ctr" : ""} of ROE (the FX buffer) on the charges in another currency than ${currency}, as the quotation and the totals do.`}
                  >
                    incl. ROE {formatNumber(priced.roe, 2)}
                  </span>
                )}
              </td>
              <td className={TD_TOTAL} />
            </tr>
            {many && (
              <tr className="text-[12px] text-slate-500 tabular-nums">
                <td className="px-2 pb-2" colSpan={6}>
                  × {block.units} containers
                </td>
                <td className="px-2 pb-2 text-right whitespace-nowrap">{times(priced.buying)}</td>
                <td className="px-2 pb-2 text-right whitespace-nowrap">{times(priced.profit)}</td>
                <td className="px-2 pb-2 text-right whitespace-nowrap">{times(priced.selling)}</td>
                <td />
              </tr>
            )}
          </tfoot>
        </LineTable>
      )}
    </LineBlock>
  );
}
