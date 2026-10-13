import { PILL_CLASS } from "@/components/Pill";
import { QUOTE_STATUS_MAP } from "../_lib/types";

// What a status this version has no name for is drawn in.
const NEUTRAL = { bg: "#f1f5f9", text: "#64748b" };

// The status of a quote wherever it is shown - the lists, the quote page, the customer page, the
// New Shipment wizard - in the Sales colours. It is given the status that counts - Expired for a
// Quoted or Feedback quote whose validity has passed, which the server works out
// (SalesQuote.status) - not the one the quote's document still carries.
export function QuoteStatusPill({ status }: { status: string }) {
  const def = QUOTE_STATUS_MAP[status];
  const color = def?.color ?? NEUTRAL;
  return (
    <span className={PILL_CLASS} style={{ backgroundColor: color.bg, color: color.text }}>
      {def?.label ?? status}
    </span>
  );
}
