import type { ReactNode } from "react";
import { KPI_TONE_CLASS, type KpiTone } from "@/components/KpiTile";
import { fmtMoney } from "@/lib/money";
import { LABEL_TEXT } from "@/styles/ui";
import type { QuoteTotals } from "../../../_lib/salesQuote";

interface QuoteFigureProps {
  label: ReactNode;
  value: ReactNode;
  // The colour of the figure.
  tone?: KpiTone;
}

// One figure of the strip under the quote's lifecycle (LifecycleBar): a small caps label over its
// figure, from the left, as the facts of the summary above it stand. The figure is a size above
// those facts, not the 20px of a KPI tile: it stays in proportion to its label.
export function QuoteFigure({ label, value, tone }: QuoteFigureProps) {
  return (
    <div className="min-w-0 px-4 py-2.5">
      <div className={`${LABEL_TEXT} truncate`}>{label}</div>
      <div className={`mt-0.5 text-[16px] leading-6 font-semibold tabular-nums ${tone ? KPI_TONE_CLASS[tone] : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

interface QuotePriceTileProps {
  totals: QuoteTotals;
  // The colour of the profit, by its margin.
  profitTone?: KpiTone;
  // The colour of its label, when the label is what says how the profit stands.
  labelTone?: KpiTone;
}

// An amount as a figure; one too long for its column is cut, and hovering it shows all of it.
const figure = (amount: string) => (
  <span className="block truncate" title={amount}>
    {amount}
  </span>
);

// The quote's price at a glance, before the win probability: its buying and its selling, all lines
// in one figure each, and the profit between them - the first three figures of the strip. The same
// totals as under Pricing.
export const QuotePriceTile = ({ totals, profitTone, labelTone }: QuotePriceTileProps) => (
  <>
    <QuoteFigure label="Buying (all-in)" value={figure(fmtMoney(totals.buying, totals.currency))} />
    <QuoteFigure label="Selling (all-in)" value={figure(fmtMoney(totals.selling, totals.currency))} />
    <QuoteFigure
      label={<span className={labelTone ? KPI_TONE_CLASS[labelTone] : undefined}>{totals.margin === null ? "Profit" : `Profit (${totals.margin}%)`}</span>}
      value={figure(fmtMoney(totals.profit, totals.currency))}
      tone={profitTone}
    />
  </>
);
