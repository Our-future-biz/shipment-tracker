"use client";

import type { ReactNode } from "react";
import { fmtMoney } from "@/lib/money";
import type { LineSide } from "@/app/sales/_lib/costPairs";
import { isTruckingLine } from "@/app/sales/_lib/roadQuote";
import type { CostLine } from "@/app/sales/_lib/types";
import { RemoveLineButton } from "./QuoteButtons";
import { LINE_TD_CLASS, LINE_TH_CLASS, LINE_TH_RIGHT_CLASS, LineBlock, LineTable } from "./LineBlock";

interface FclTruckingBlockProps {
  buyingLines: readonly CostLine[];
  sellingLines: readonly CostLine[];
  /** The quote's currency */
  currency: string;
  /** A line in the quote's currency (a selling line with the ROE %); null while a rate it needs is missing. */
  amountOf: (line: CostLine, side: LineSide) => number | null;
  /** The marks under a line's description ("Tariff v3", "Override"). */
  lineTag?: (line: CostLine, side: LineSide) => ReactNode;
  onRemove: (side: LineSide, index: number) => void;
  /** Under the lines: that they no longer add up to what the tariff priced. */
  notes?: ReactNode;
}

const SIDE_LABEL: Record<LineSide, string> = { buying: "Buying", selling: "Selling" };

// The trucking lines of an FCL-priced quote. The trucking tariffs price them, buying and selling
// both (the road card above prices them again), so FCL pricing leaves them out of its blocks; they
// are listed here so Pricing shows every line the totals add up. Removing one asks about its
// counterpart on the other side, as on the other quotes.
export function FclTruckingBlock({ buyingLines, sellingLines, currency, amountOf, lineTag, onRemove, notes }: FclTruckingBlockProps) {
  const rowsOf = (side: LineSide, lines: readonly CostLine[]) =>
    lines.flatMap((line, index) => (isTruckingLine(line) ? [{ side, line, index }] : []));
  const rows = [...rowsOf("buying", buyingLines), ...rowsOf("selling", sellingLines)];
  if (!rows.length) return null;

  return (
    <LineBlock title="Road transport - priced by the trucking tariffs">
      <LineTable minWidthClass="min-w-[720px]">
        <colgroup>
          <col className="w-20" />
          <col />
          <col className="w-[140px]" />
          <col className="w-[120px]" />
          <col className="w-[120px]" />
          <col className="w-10" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={LINE_TH_CLASS}>Side</th>
            <th scope="col" className={LINE_TH_CLASS}>Description</th>
            <th scope="col" className={LINE_TH_CLASS}>Supplier</th>
            <th scope="col" className={LINE_TH_RIGHT_CLASS}>Amount</th>
            <th scope="col" className={LINE_TH_RIGHT_CLASS}>In {currency}</th>
            <th scope="col" aria-label="Remove line" className={LINE_TH_CLASS} />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ side, line, index }) => {
            const tag = lineTag?.(line, side);
            const amount = amountOf(line, side);
            return (
              <tr key={`${side}-${index}`}>
                <td className={`${LINE_TD_CLASS} text-slate-600`}>{SIDE_LABEL[side]}</td>
                <td className={LINE_TD_CLASS}>
                  {line.description?.trim() || line.type}
                  {tag && <div className="mt-1 flex flex-wrap items-center gap-1">{tag}</div>}
                </td>
                <td className={`${LINE_TD_CLASS} truncate text-slate-600`}>{line.supplier || "—"}</td>
                <td className={`${LINE_TD_CLASS} text-right tabular-nums whitespace-nowrap`}>{fmtMoney(Number(line.amount) || 0, line.currency)}</td>
                <td className={`${LINE_TD_CLASS} text-right tabular-nums whitespace-nowrap ${amount === null ? "text-red-600" : "font-semibold text-slate-800"}`}>
                  {amount === null ? "no rate" : fmtMoney(amount, currency)}
                </td>
                <td className={`${LINE_TD_CLASS} pl-0`}>
                  <RemoveLineButton label={`Remove the ${side} line ${line.description || line.type}`} onClick={() => onRemove(side, index)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </LineTable>
      {notes && <div className="flex flex-col gap-1 px-3 py-2 border-t border-slate-200">{notes}</div>}
    </LineBlock>
  );
}
