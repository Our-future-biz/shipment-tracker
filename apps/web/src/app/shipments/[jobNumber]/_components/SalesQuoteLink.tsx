"use client";

import Link from "next/link";
import { SplitCellsOutlined } from "@ant-design/icons";
import { apiErrorMessage } from "@/lib/api";
import { useSalesQuote } from "@/hooks/useSalesQuote";
import { useToast } from "@/lib/toast";

// The sales quote a shipment names in its Sales Number, in the shipment's header: a link to the
// quote's page when there is such a quote, the bare reference when there is none - a typed
// number need not be one - or while that is not known.
//
// A quote remembers its shipment in another database, and telling it can fail after the shipment
// was saved. While the quote has no shipment at all although this one names it, that is said
// here, with the way to repair it at once instead of waiting for the server's hourly comparison.
interface SalesQuoteLinkProps {
  shipmentId: string;
  quoteNumber: string;
}

export function SalesQuoteLink({ shipmentId, quoteNumber }: SalesQuoteLinkProps) {
  const toast = useToast();
  const { quote, notFound, isFetching, saving, linkQuote, isLinking } = useSalesQuote(quoteNumber, shipmentId);

  const handleLink = () => {
    linkQuote()
      .then((synced) => {
        if (!synced.found) toast.warning(`There is no sales quote ${quoteNumber}`);
        else if (synced.status === "won") toast.success(`Quote ${quoteNumber} now knows this shipment`);
        else toast.success(`Quote ${quoteNumber} now knows this shipment - mark it Won on its page if the customer ordered`);
      })
      .catch((err) => {
        toast.error(`Quote ${quoteNumber} was not linked - ${apiErrorMessage(err)}`);
      });
  };

  const label = `Quote ${quoteNumber}`;
  if (!quote) {
    return (
      <span className="text-xs text-slate-500 whitespace-nowrap" title={notFound ? "There is no sales quote with this number" : undefined}>
        {label}
      </span>
    );
  }

  // Said only of a copy that is up to date: one kept from before a write, or being read again
  // after it, may be from before the link. It stays while "Link now" itself is at work.
  const unknown = quote.shipmentId === null && (isLinking || (!isFetching && !saving));
  return (
    // The note sits under the link, so the header's row keeps its width and the two read as one
    // sentence: "Quote QCZ... does not know this shipment yet - Link now".
    <span className="flex flex-col items-end gap-0.5">
      <Link
        href={`/sales/quote/${quoteNumber}`}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 text-slate-600 whitespace-nowrap"
      >
        <SplitCellsOutlined />
        {label}
      </Link>
      {unknown && (
        <span className="text-[11px] text-amber-700 whitespace-nowrap">
          does not know this shipment yet -{" "}
          <button
            type="button"
            disabled={isLinking}
            onClick={handleLink}
            className="font-semibold underline bg-transparent border-none p-0 cursor-pointer text-amber-700 disabled:opacity-50"
          >
            Link now
          </button>
        </span>
      )}
    </span>
  );
}
