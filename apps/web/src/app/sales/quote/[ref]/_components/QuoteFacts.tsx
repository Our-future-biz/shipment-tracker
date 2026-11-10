import type { ReactNode } from "react";
import { CopyButton } from "@/components/CopyButton";
import { formatDate } from "@/lib/date";
import { EMPTY, LABEL_TEXT, PAGE_TITLE, REF } from "@/styles/ui";
import { serviceTypeLabel, type QuoteStatus } from "../../../_lib/types";
import { QuoteStatusPill } from "../../../_components/QuoteStatusPill";

interface FactProps {
  label: string;
  className?: string;
  children: ReactNode;
  // Small print under the value, as a shipment's Port of Discharge has its destination.
  note?: ReactNode;
}

// One fact of the summary: a small caps label over its value (as ShipmentFacts has it). Label and
// value keep to one line each: the columns are wide enough for every label, and a value too long
// for its column is cut, all of it shown on hover.
export function Fact({ label, className = "", children, note }: FactProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className={`${LABEL_TEXT} truncate`} title={label}>
        {label}
      </div>
      <div className="mt-0.5 min-h-[22px] flex items-center text-[13px] font-medium text-slate-900 min-w-0">{children}</div>
      {note && <div className="text-[12px] leading-4 text-slate-500 truncate">{note}</div>}
    </div>
  );
}

const dash = <span className={EMPTY}>—</span>;

/** A plain value that fades out instead of widening its column. */
const text = (v: string | null | undefined) => (v ? <span className="truncate" title={v}>{v}</span> : dash);

interface QuoteFactsProps {
  quoteNumber: string;
  // The status that counts: Expired for a Quoted or Feedback quote whose validity has passed.
  status: QuoteStatus;
  // Who the quote is for: the name as the page shows it (a link to the customer, or plain text).
  customer: ReactNode;
  direction?: string;
  serviceType?: string;
  incoterm?: string;
  // The ports, as Routing has them.
  pol?: string;
  pod?: string;
  // The quote's Valid until, as the server keeps it (YYYY-MM-DD); null when none is set.
  validUntil: string | null;
  // The owner's fact (OwnerFact), last: it holds its own control.
  owner: ReactNode;
}

/**
 * The quote at a glance, at the top of its page as the summary of a shipment is at the top of
 * its: a table of two rows, a small caps label over each value. The first row says which quote -
 * the reference, the page's title - for whom, and how the cargo goes and on which terms; the
 * second between which ports, how long the quote holds, where it stands and whose it is. Only the
 * owner is changed here, at once; every other value is changed in the steps below.
 */
export function QuoteFacts({ quoteNumber, status, customer, direction, serviceType, incoterm, pol, pod, validUntil, owner }: QuoteFactsProps) {
  // Red only on a quote that is Expired: the date of a quote that was won, lost or is being
  // reworked is a fact about it, not an alarm.
  const expired = status === "expired";

  return (
    // Five columns from a laptop screen up, with a line across between the two rows, as on a
    // shipment; the owner in the bottom right corner. The first column is as wide as the
    // reference at least, so the reference is never cut; no other value widens its column.
    <div className="grid grid-cols-2 lg:grid-cols-[minmax(max-content,1fr)_minmax(0,1.25fr)_minmax(0,1.2fr)_minmax(0,0.85fr)_minmax(0,1.3fr)] gap-x-6 gap-y-3 lg:gap-y-1.5 [&>*:not(:first-child)]:[contain:inline-size]">
      <Fact label="Sales Reference" className="col-span-2 lg:col-span-1">
        {/* The reference is the page's title, as the job number is on a shipment. */}
        <div className="flex items-center gap-1 min-w-0">
          <h1 className={`${PAGE_TITLE} ${REF} truncate`} title={quoteNumber}>
            {quoteNumber}
          </h1>
          <CopyButton text={quoteNumber} what="reference" />
        </div>
      </Fact>
      <Fact label="Customer" className="col-span-2 lg:col-span-1">
        {customer}
      </Fact>
      <Fact label="Trade Direction">{text(direction)}</Fact>
      <Fact label="Freight Mode">{text(serviceType && serviceTypeLabel(serviceType))}</Fact>
      <Fact label="Incoterms">{text(incoterm)}</Fact>
      <div aria-hidden className="hidden lg:block col-span-full h-px bg-indigo-100" />
      <Fact label="Port of Loading">{text(pol)}</Fact>
      <Fact label="Port of Discharge">{text(pod)}</Fact>
      <Fact label="Valid until">
        {/* The date in the weight of a shipment's ETD and ETA. */}
        {validUntil ? <span className={`tabular-nums text-[14px] font-semibold ${expired ? "text-red-600" : ""}`}>{formatDate(validUntil)}</span> : dash}
      </Fact>
      <Fact label="Status">
        <QuoteStatusPill status={status} />
      </Fact>
      {owner}
    </div>
  );
}
