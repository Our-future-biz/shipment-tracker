import { PILL_CLASS } from "@/components/Pill";
import { NEUTRAL_STATUS_TONE, QUOTE_STATUS_MAP, type QuoteStatus } from "../_lib/types";

interface QuoteStatusPillProps {
  status: QuoteStatus;
}

// The status of a quote wherever it is shown - the lists, the quote page, the customer page, the
// New Shipment wizard - in the Sales colours. It is given the status that counts - Expired for a
// Quoted or Feedback quote whose validity has passed, which the server works out
// (SalesQuote.status) - not the one the quote's document still carries.
export function QuoteStatusPill({ status }: QuoteStatusPillProps) {
  const def = QUOTE_STATUS_MAP[status];
  const tone = def?.tone ?? NEUTRAL_STATUS_TONE;
  return (
    <span className={`${PILL_CLASS} ${tone.pill}`}>
      {def?.label ?? status}
    </span>
  );
}
