import { money } from "@/lib/money";

interface ProfitVsEstimateProps {
  /** Real − estimated buying cost: above 0 the cost came out higher than estimated. */
  delta: number;
  currency: string;
  className?: string;
}

// A buying cost against its estimate, read as profit: a real cost above the estimate is Profit
// Burning (red), one below it Profit Optimalization (green), with the difference.
export function ProfitVsEstimate({ delta, currency, className = "" }: ProfitVsEstimateProps) {
  if (Math.abs(delta) < 0.005) return <span className={`text-[12px] text-slate-400 ${className}`}>On estimate</span>;
  const burning = delta > 0;
  return (
    <span className={`text-[12px] font-semibold whitespace-nowrap ${burning ? "text-danger" : "text-ok"} ${className}`}>
      {burning ? "Profit Burning" : "Profit Optimalization"}{" "}
      <span className="tabular-nums">
        {money(Math.abs(delta))} {currency}
      </span>
    </span>
  );
}
