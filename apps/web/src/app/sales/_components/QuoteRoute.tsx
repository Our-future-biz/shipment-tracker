import { EMPTY_CELL } from "@/components/EmptyCell";
import { routeEnds } from "../_lib/printQuote";
import type { SalesQuoteData } from "../_lib/types";

interface QuoteRouteProps {
  data: Pick<SalesQuoteData, "origin" | "destination" | "pol" | "pod">;
}

// Where a quote's cargo goes, as one piece of text: "Shanghai → Praha". An Origin or Destination
// left blank (Routing's "Keep blank") reads as the port or airport of loading or discharge, as the
// customer's document and the e-mail read it (routeEnds; mock council S2-5). A place nobody filled
// in is a dash; with neither there is no route to show.
export function QuoteRoute({ data }: QuoteRouteProps) {
  const [origin, destination] = routeEnds(data);
  if (!origin && !destination) return EMPTY_CELL;
  return (
    <span className="text-slate-700">
      {origin || "—"} <span className="text-slate-300">→</span> {destination || "—"}
    </span>
  );
}
