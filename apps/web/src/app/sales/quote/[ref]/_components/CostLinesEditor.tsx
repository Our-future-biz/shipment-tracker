"use client";

import { useState, type ReactNode } from "react";
import { Input, InputNumber, Select } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { fmtMoney, moneyInputParser } from "@/lib/money";
import type { ChargeBasis, CostLine, SalesQuoteData } from "@/app/sales/_lib/types";
import { chargeLabel, chargeOptions, toChargeCode } from "@/lib/chargeCodes";
import { CURRENCIES } from "@/lib/enums";
import { useListKeys } from "@/hooks/useListKeys";
import { ConfirmModal } from "@/components/ConfirmModal";
import { computeCargo, convertLine, lineRate, quoteCurrency, withRate, type LivePricing } from "@/app/sales/_lib/salesQuote";
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

// The description a service pre-types ("Ocean freight"); "Other" leaves it to be written.
const describedAs = (code: string): string => (code === "other" ? "" : chargeLabel(code));

// What a line can be charged by; a line without one is a lump sum.
const BASIS_OPTIONS: { value: ChargeBasis; label: string }[] = [
  { value: "lumpsum", label: "Lumpsum" },
  { value: "wm", label: "W/M" },
];

/** A line's amount as a number: a quote's JSON may hold it as text, or not at all (priced by qty × unit price). */
export const amountOf = (line: CostLine): number => Number(line.amount) || 0;

type ListKeys = ReturnType<typeof useListKeys>;

/**
 * A line given another service: its type and code and, when its description is blank or the old
 * service's own name, the new service's name. A description written by hand is kept, and `ask`
 * says the user is to be asked whether it gives way.
 */
export function serviceChange(line: CostLine, code: string): { line: CostLine; ask: boolean } {
  const next = chargeOf(code);
  const description = (line.description ?? "").trim();
  const preTyped = !description || description === describedAs(line.chargeCode || toChargeCode(line.type)) || description === line.type;
  if (preTyped) return { line: { ...line, ...next, description: describedAs(code) }, ask: false };
  return { line: { ...line, ...next }, ask: description !== next.type };
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
    basis: "lumpsum",
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
  // The rows' React keys (useListKeys over `lines`), owned by the caller: a removal it makes on
  // its own - of a counterpart on the other side - drops that row's key as well.
  lineKeys: ListKeys;
  // A line whose amount was 0 and was just set by hand.
  onAmountSet?: (line: CostLine, index: number) => void;
  // A line whose amount was changed by hand (any amount before), with the amount it had.
  onAmountChanged?: (line: CostLine, index: number, before: number) => void;
  // Takes over removing a line (to ask about its counterpart first); without it the line goes at once.
  onRemove?: (index: number) => void;
  // The basis a line has from elsewhere (a selling line its buying line's): shown and not chosen here.
  basisOf?: (line: CostLine) => ChargeBasis | undefined;
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
  lineKeys,
  onAmountSet,
  onAmountChanged,
  onRemove,
  basisOf,
}: CostLinesEditorProps) {
  const buying = kind === "buying";
  const currency = quoteCurrency(quote);
  const patch = (i: number, p: Partial<CostLine>) => onChange(lines.map((x, j) => (j === i ? { ...x, ...p } : x)));
  // A line's Amount column: per W/M the rate, which the cargo's weight / measure multiplies.
  const wm = computeCargo(quote).weightMeasure;
  const priced = (line: CostLine, rate: number) => withRate(line, rate, wm);
  // The line whose service was changed while its description held text of its own: whether that
  // text gives way to the service's name is asked.
  const [asked, setAsked] = useState<{ index: number; description: string; service: string } | null>(null);

  const chooseService = (i: number, code: string) => {
    const current = lines[i];
    if (!current) return;
    const { line, ask } = serviceChange(current, code);
    onChange(lines.map((x, j) => (j === i ? line : x)));
    if (ask) setAsked({ index: i, description: line.description, service: line.type });
  };

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
        <LineTable minWidthClass={buying ? "min-w-[850px]" : "min-w-[740px]"}>
          <colgroup>
            <col className="w-[140px]" />
            <col />
            {buying && <col className="w-[110px]" />}
            <col className="w-20" />
            <col className="w-24" />
            <col className="w-28" />
            <col className="w-[88px]" />
            <col className="w-[110px]" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={LINE_TH_CLASS}>Service</th>
              <th scope="col" className={LINE_TH_CLASS}>Description</th>
              {buying && <th scope="col" className={LINE_TH_CLASS}>Supplier</th>}
              <th scope="col" className={LINE_TH_CLASS}>Ccy</th>
              <th scope="col" className={LINE_TH_CLASS}>Amount</th>
              <th scope="col" className={LINE_TH_RIGHT_CLASS}>In {currency}</th>
              <th scope="col" className={LINE_TH_CLASS}>Quantity</th>
              <th scope="col" className={LINE_TH_CLASS}>Basis</th>
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
                      aria-label="Service"
                      // Typing narrows the list ("oce" → Ocean freight), so nobody has to scroll for it.
                      showSearch
                      optionFilterProp="label"
                      value={l.chargeCode || toChargeCode(l.type)}
                      onChange={(v) => chooseService(i, v)}
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
                      showSearch
                      size="small"
                      className="w-full"
                      aria-label="Currency"
                      optionFilterProp="label"
                      value={l.currency}
                      onChange={(v) => patch(i, { currency: v })}
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <LockedAmountInput
                      aria-label="Amount"
                      value={lineRate(l)}
                      currency={l.currency}
                      onChange={(amount) => onChange(lines.map((x, j) => (j === i ? priced(x, amount) : x)))}
                      onCommit={(amount, before) => {
                        if (!before && amount > 0) onAmountSet?.(priced(l, amount), i);
                        if (amount !== before) onAmountChanged?.(priced(l, amount), i, before);
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
                      aria-label="Quantity"
                      min={0}
                      // Per W/M: the cargo's weight / measure, 3 decimals as Cargo details shows it.
                      precision={l.basis === "wm" ? 3 : 2}
                      disabled={l.basis === "wm"}
                      title={l.basis === "wm" ? "Weight / measure from Cargo details" : undefined}
                      parser={moneyInputParser}
                      placeholder="=amt"
                      value={l.value}
                      onChange={(v) => patch(i, { value: v ?? undefined })}
                    />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <Select
                      size="small"
                      className="w-full"
                      aria-label="Basis"
                      disabled={basisOf?.(l) !== undefined}
                      title={basisOf?.(l) !== undefined ? "The same as its buying line" : undefined}
                      value={basisOf?.(l) ?? l.basis ?? "lumpsum"}
                      options={BASIS_OPTIONS}
                      onChange={(basis: ChargeBasis) => patch(i, { basis })}
                    />
                  </td>
                  <td className={`${LINE_TD_CLASS} pl-0`}>
                    <RemoveLineButton
                      label={`Remove ${kind} line ${i + 1}`}
                      onClick={() => {
                        if (onRemove) return onRemove(i);
                        lineKeys.remove(i);
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
      {asked && (
        <ConfirmModal
          open
          onClose={() => setAsked(null)}
          onConfirm={() => {
            patch(asked.index, { description: asked.service });
            setAsked(null);
          }}
          title="Change the description?"
          description={`The description says "${asked.description}". Keep it, or change it to "${asked.service}"?`}
          confirmLabel={`Change to ${asked.service}`}
          cancelLabel="Keep"
        />
      )}
    </LineBlock>
  );
}
