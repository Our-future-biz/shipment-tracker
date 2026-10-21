"use client";

import type { ReactNode } from "react";
import { Input, InputNumber, Select } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { fmtMoney, moneyInputParser } from "@/lib/money";
import type { CostLine, SalesQuoteData } from "@/app/sales/_lib/types";
import { chargeLabel, chargeOptions, toChargeCode } from "@/lib/chargeCodes";
import { CURRENCIES } from "@/lib/enums";
import { useListKeys } from "@/hooks/useListKeys";
import { convertLine, quoteCurrency, type LivePricing } from "@/app/sales/_lib/salesQuote";
import { LockedAmountInput } from "./LockedAmountInput";
import { MiniButton, RemoveLineButton } from "./QuoteButtons";
import { LINE_TD_CLASS, LINE_TH_CLASS, LINE_TH_RIGHT_CLASS, LineBlock, LineBlockEmpty, LineTable } from "./LineBlock";

// The freight charge that goes with each freight mode - what a new cost line most likely is.
const FREIGHT_LINE_CODE: Record<string, string> = {
  Air: "air_freight",
  "Sea FCL": "ocean_freight",
  "Sea LCL": "ocean_freight",
  Rail: "rail_freight",
  Road: "road_freight",
};

// A line stores its charge code and, for the print and older readers, its label as the type.
const chargeOf = (code: string): Pick<CostLine, "type" | "chargeCode"> => ({ type: chargeLabel(code), chargeCode: code });

// The description a charge pre-types ("Ocean freight"); "Other" leaves it to be written.
const describedAs = (code: string): string => (code === "other" ? "" : chargeLabel(code));

/**
 * A line given another charge: its type, and the description that charge pre-types - unless the
 * description was written by hand (anything but blank or the old charge's own text).
 */
export function withCharge(line: CostLine, code: string): CostLine {
  const description = (line.description ?? "").trim();
  const preTyped = !description || description === describedAs(line.chargeCode || toChargeCode(line.type)) || description === line.type;
  return { ...line, ...chargeOf(code), ...(preTyped ? { description: describedAs(code) } : {}) };
}

// A new cost line is in the quote's currency, so adding one never mixes currencies by accident.
const newCostLine = (quote: SalesQuoteData): CostLine => {
  const code = FREIGHT_LINE_CODE[quote.serviceType ?? ""] ?? "other";
  return {
    ...chargeOf(code),
    description: describedAs(code),
    supplier: "",
    currency: quoteCurrency(quote),
    amount: 0,
    // 1 unless the user sets another.
    value: 1,
  };
};

interface CostLinesEditorProps {
  kind: "buying" | "selling";
  title: string;
  lines: CostLine[];
  quote: SalesQuoteData;
  sheet: ExchangeRates;
  // Today's ČNB fixing and ROE %, which a draft's selling lines in another currency carry.
  live: LivePricing;
  onChange: (lines: CostLine[]) => void;
  // More actions of the block, drawn before its "Add" button.
  actions?: ReactNode;
  // Marks under a line's description, e.g. the tariff it was priced from.
  lineTag?: (line: CostLine) => ReactNode;
  // A line whose amount was 0 and was just set by hand.
  onAmountSet?: (line: CostLine, index: number) => void;
  // Asked before a line is removed; without it the line goes at once. `dropRow` keeps the rows
  // after it on their own React keys and must be called when the line is in fact removed.
  onRemove?: (index: number, dropRow: () => void) => void;
}

// The buying or the selling lines of a quote. Every line keeps its own currency; the "In EUR"
// column says what the line adds to the totals in the quote's currency - or that it adds nothing
// yet, for want of a rate. Only buying lines name a supplier.
export function CostLinesEditor({
  kind,
  title,
  lines,
  quote,
  sheet,
  live,
  onChange,
  actions,
  lineTag,
  onAmountSet,
  onRemove,
}: CostLinesEditorProps) {
  const buying = kind === "buying";
  const currency = quoteCurrency(quote);
  const patch = (i: number, p: Partial<CostLine>) => onChange(lines.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const lineKeys = useListKeys(lines.length);

  return (
    <LineBlock
      title={title}
      actions={
        <>
          {actions}
          <MiniButton icon={<PlusOutlined />} onClick={() => onChange([...lines, newCostLine(quote)])}>
            Add {kind} cost
          </MiniButton>
        </>
      }
    >
      {lines.length === 0 ? (
        <LineBlockEmpty>No {kind} costs yet.</LineBlockEmpty>
      ) : (
        <LineTable minWidthClass={buying ? "min-w-[740px]" : "min-w-[630px]"}>
          <colgroup>
            <col className="w-[140px]" />
            <col />
            {buying && <col className="w-[110px]" />}
            <col className="w-20" />
            <col className="w-24" />
            <col className="w-28" />
            <col className="w-[88px]" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={LINE_TH_CLASS}>Item</th>
              <th scope="col" className={LINE_TH_CLASS}>Description</th>
              {buying && <th scope="col" className={LINE_TH_CLASS}>Supplier</th>}
              <th scope="col" className={LINE_TH_CLASS}>Ccy</th>
              <th scope="col" className={LINE_TH_CLASS}>Amount</th>
              <th scope="col" className={LINE_TH_RIGHT_CLASS}>In {currency}</th>
              <th scope="col" className={LINE_TH_CLASS}>Value</th>
              <th scope="col" aria-label="Remove line" className={LINE_TH_CLASS} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const converted = convertLine(l, quote, sheet, { selling: !buying, live });
              const tag = lineTag?.(l);
              return (
                <tr key={lineKeys.keys[i]}>
                  <td className={LINE_TD_CLASS}>
                    <Select
                      size="small"
                      className="w-full"
                      aria-label="Item"
                      // Typing narrows the list ("oce" → Ocean freight), so nobody has to scroll for it.
                      showSearch
                      optionFilterProp="label"
                      value={l.chargeCode || toChargeCode(l.type)}
                      onChange={(v) => onChange(lines.map((x, j) => (j === i ? withCharge(x, v) : x)))}
                      options={chargeOptions(l.chargeCode || toChargeCode(l.type))}
                    />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <Input size="small" aria-label="Description" placeholder="Description" value={l.description} onChange={(e) => patch(i, { description: e.target.value })} />
                    {tag && <div className="mt-1 flex flex-wrap gap-1">{tag}</div>}
                  </td>
                  {buying && (
                    <td className={LINE_TD_CLASS}>
                      <Input size="small" aria-label="Supplier" placeholder="Supplier" value={l.supplier ?? ""} onChange={(e) => patch(i, { supplier: e.target.value })} />
                    </td>
                  )}
                  <td className={LINE_TD_CLASS}>
                    <Select
                      size="small"
                      className="w-full"
                      aria-label="Currency"
                      value={l.currency}
                      onChange={(v) => patch(i, { currency: v })}
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <LockedAmountInput
                      aria-label="Amount"
                      value={l.amount}
                      currency={l.currency}
                      onChange={(amount) => patch(i, { amount })}
                      onCommit={(amount, before) => {
                        if (!before && amount > 0) onAmountSet?.({ ...l, amount }, i);
                      }}
                    />
                  </td>
                  <td className={`${LINE_TD_CLASS} text-right font-medium tabular-nums whitespace-nowrap ${converted === null ? "text-red-600" : "text-slate-600"}`}>
                    {converted === null ? "no rate" : fmtMoney(converted, currency)}
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <InputNumber
                      size="small"
                      className="!w-full"
                      aria-label="Value"
                      min={0}
                      precision={2}
                      parser={moneyInputParser}
                      placeholder="=amt"
                      value={l.value}
                      onChange={(v) => patch(i, { value: v ?? undefined })}
                    />
                  </td>
                  <td className={`${LINE_TD_CLASS} pl-0`}>
                    <RemoveLineButton
                      label={`Remove ${kind} line ${i + 1}`}
                      onClick={() => {
                        const dropRow = () => lineKeys.remove(i);
                        if (onRemove) return onRemove(i, dropRow);
                        dropRow();
                        onChange(lines.filter((_, j) => j !== i));
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </LineTable>
      )}
    </LineBlock>
  );
}
