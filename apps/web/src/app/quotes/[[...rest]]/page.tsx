import { redirect } from "next/navigation";
import { quoteHref } from "@/app/sales/_lib/quoteHref";
import { isSalesQuoteRef } from "@/app/sales/_lib/salesQuote";
import { SALES_PAGES } from "@/app/sales/_lib/tabs";

type Props = { params: Promise<{ rest?: string[] }> };

// The old Quotes page is gone: quotes are made and kept in Sales. This keeps its old links and
// bookmarks working - an address that names a sales quote opens that quote, every other one the
// Quotes list.
export default async function OldQuotesRedirectPage({ params }: Props) {
  const { rest } = await params;
  const ref = rest?.[0] ?? "";
  redirect(isSalesQuoteRef(ref) ? quoteHref(ref) : SALES_PAGES.quotes.path);
}
