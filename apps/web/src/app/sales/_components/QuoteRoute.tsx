import { EMPTY_CELL } from "@/components/EmptyCell";

// Where a quote's cargo goes, as one piece of text: "Shanghai → Praha". A place nobody filled in
// is a dash; with neither there is no route to show.
export function QuoteRoute({ origin, destination }: { origin?: string; destination?: string }) {
  if (!origin && !destination) return EMPTY_CELL;
  return (
    <span className="text-slate-600">
      {origin || "—"} <span className="text-slate-300">→</span> {destination || "—"}
    </span>
  );
}
