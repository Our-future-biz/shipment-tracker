import type { KpiTone } from "@/components/KpiTile";
import { fmtMoney } from "@/lib/money";
import type { QuoteTotals } from "../../../_lib/salesQuote";

const TONE_CLASS: Record<KpiTone, string> = {
  red: "text-red-600",
  green: "text-green-600",
  amber: "text-amber-600",
};

interface QuotePriceTileProps {
  totals: QuoteTotals;
  // The colour of the profit, by its margin.
  profitTone?: KpiTone;
}

// The quote's price at a glance, beside Valid until: its buying over its selling, all lines in one
// figure each, and the profit between them. The same totals as under Pricing.
export function QuotePriceTile({ totals, profitTone }: QuotePriceTileProps) {
  const amount = (label: string, value: number) => (
    <div className="flex items-baseline justify-between gap-3 min-w-0">
      <span className="text-[11px] text-slate-400 uppercase tracking-wide truncate">{label}</span>
      <span className="text-lg font-bold text-slate-800 tabular-nums whitespace-nowrap">{fmtMoney(value, totals.currency)}</span>
    </div>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 min-w-0 flex items-center gap-4">
      <div className="flex-[2] min-w-0">
        {amount("Buying · all-in", totals.buying)}
        <div aria-hidden className="my-1 h-0.5 bg-slate-800" />
        {amount("Selling · all-in", totals.selling)}
      </div>
      <div aria-hidden className="self-stretch w-px bg-slate-200" />
      {/* The profit in the middle of the space from the dividing line to the tile's edge. */}
      <div className="flex-1 min-w-[6.5rem] text-center">
        <div className="text-[11px] text-slate-400 uppercase tracking-wide whitespace-nowrap">
          {totals.margin === null ? "Profit" : `Profit · ${totals.margin}%`}
        </div>
        <div className={`mt-0.5 text-lg font-bold tabular-nums whitespace-nowrap ${profitTone ? TONE_CLASS[profitTone] : "text-slate-800"}`}>
          {fmtMoney(totals.profit, totals.currency)}
        </div>
      </div>
    </div>
  );
}
