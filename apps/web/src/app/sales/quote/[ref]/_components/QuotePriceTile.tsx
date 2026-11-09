import { KPI_TILE_CLASS, KPI_TONE_CLASS, type KpiTone } from "@/components/KpiTile";
import { fmtMoney } from "@/lib/money";
import { KPI_VALUE, LABEL_TEXT } from "@/styles/ui";
import type { QuoteTotals } from "../../../_lib/salesQuote";

interface QuotePriceTileProps {
  totals: QuoteTotals;
  // The colour of the profit, by its margin.
  profitTone?: KpiTone;
  // The colour of its label, when the label is what says how the profit stands.
  labelTone?: KpiTone;
}

// The quote's price at a glance, beside Valid until: its buying over its selling, all lines in one
// figure each, and the profit between them. The same totals as under Pricing.
export const QuotePriceTile = ({ totals, profitTone, labelTone }: QuotePriceTileProps) => {
  const amount = (label: string, value: number) => (
    <div className="flex items-baseline justify-between gap-3 min-w-0">
      <span className={`${LABEL_TEXT} truncate`}>{label}</span>
      <span className={`${KPI_VALUE} whitespace-nowrap`}>{fmtMoney(value, totals.currency)}</span>
    </div>
  );

  return (
    <div className={`${KPI_TILE_CLASS} flex items-center gap-4`}>
      <div className="flex-[2] min-w-0">
        {amount("Buying · all-in", totals.buying)}
        <div aria-hidden className="my-1 h-0.5 bg-slate-900" />
        {amount("Selling · all-in", totals.selling)}
      </div>
      <div aria-hidden className="self-stretch w-px bg-slate-200" />
      {/* The profit in the middle of the space from the dividing line to the tile's edge. */}
      <div className="flex-1 min-w-[6.5rem] text-center">
        <div className={`${LABEL_TEXT} whitespace-nowrap`}>
          <span className={labelTone ? KPI_TONE_CLASS[labelTone] : undefined}>{totals.margin === null ? "Profit" : `Profit · ${totals.margin}%`}</span>
        </div>
        <div className={`mt-0.5 text-[20px] leading-7 font-bold tabular-nums whitespace-nowrap ${profitTone ? KPI_TONE_CLASS[profitTone] : "text-slate-900"}`}>
          {fmtMoney(totals.profit, totals.currency)}
        </div>
      </div>
    </div>
  );
};
