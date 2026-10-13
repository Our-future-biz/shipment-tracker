"use client";

import Link from "next/link";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SplitCellsOutlined } from "@ant-design/icons";
import { api, apiErrorMessage, isNotFound } from "@/lib/api";
import { invalidateQuoteLists } from "@/hooks/useSalesQuotes";
import { useToast } from "@/lib/toast";

// The sales quote a shipment names in its Sales Number, in the shipment's header: a link to the
// quote's page when there is such a quote, the bare reference when there is none - a typed
// number need not be one - or while that is not known.
//
// A quote remembers its shipment in another database, and telling it can fail after the shipment
// was saved. While the quote has no shipment at all although this one names it, that is said
// here, with the way to repair it at once instead of waiting for the hourly comparison.
export function SalesQuoteLink({ shipmentId, quoteNumber }: { shipmentId: string; quoteNumber: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  // A write is on its way - the Sales Number itself may just have been typed, and the quote is
  // told only once the shipment is saved.
  const saving = useIsMutating() > 0;

  const query = useQuery({
    // The copy of the quote its own page and the bulk actions leave behind; every write of a
    // quote made in this browser marks it out of date (invalidateQuoteLists).
    queryKey: ["sales-quote", quoteNumber],
    queryFn: () => api.quotes.salesQuoteGet(quoteNumber),
    // Read anew whenever the header appears, however fresh the copy: a link the server made by
    // itself - the comparison a list of shipments starts - or a colleague's write marks nothing
    // out of date here, and the note below would be said of a quote that knows the shipment.
    refetchOnMount: "always",
    // Not asked while a write is on its way: an answer from before the write was finished would
    // say that the quote does not know the shipment, and would be kept. It is asked right after.
    enabled: !saving,
    // "Not found" is an answer, not a failure worth asking about again.
    retry: (failures, err) => !isNotFound(err) && failures < 1,
  });
  // A request that failed says nothing about the quote: no link is offered on the copy read before it.
  const quote = query.isError ? undefined : query.data?.quote;

  // Links without marking the quote Won - a typed Sales Number is not an order. A quote that has
  // a shipment offers Won itself.
  const link = useMutation({
    mutationFn: () => api.shipments.shipmentQuoteLink(shipmentId, {}),
    onSuccess: (synced) => {
      if (!synced.found) toast.warning(`There is no sales quote ${quoteNumber}`);
      else if (synced.status === "won") toast.success(`Quote ${quoteNumber} now knows this shipment`);
      else toast.success(`Quote ${quoteNumber} now knows this shipment - mark it Won on its page if the customer ordered`);
      return invalidateQuoteLists(queryClient);
    },
    // A block, so the toast is not returned: it is a thenable that settles only when the toast
    // closes, and the mutation - with it "Link now" - would stay busy until then.
    onError: (err) => {
      toast.error(`Quote ${quoteNumber} was not linked - ${apiErrorMessage(err)}`);
    },
  });

  const label = `Quote ${quoteNumber}`;
  if (!quote) {
    return (
      <span className="text-xs text-slate-500 whitespace-nowrap" title={isNotFound(query.error) ? "There is no sales quote with this number" : undefined}>
        {label}
      </span>
    );
  }

  // Said only of a copy that is up to date: one kept from before a write, or being read again
  // after it, may be from before the link. It stays while "Link now" itself is at work.
  const unknown = quote.shipmentId === null && (link.isPending || (!query.isFetching && !saving));
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
            disabled={link.isPending}
            onClick={() => link.mutate()}
            className="font-semibold underline bg-transparent border-none p-0 cursor-pointer text-amber-700 disabled:opacity-50"
          >
            Link now
          </button>
        </span>
      )}
    </span>
  );
}
