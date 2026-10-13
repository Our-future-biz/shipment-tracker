import { Suspense } from "react";
import type { Metadata } from "next";
import { QuotesList } from "../_components/QuotesList";
import { SalesPage } from "../_components/SalesPage";
import { SALES_PAGES } from "../_lib/tabs";

export const metadata: Metadata = { title: SALES_PAGES.quotes.label };

export default function SalesQuotesPage() {
  return (
    // The list reads its search, filters, sort and page from the URL, and draws the page frame
    // itself: its title row holds the views. Until it is there the frame stands with the title alone.
    <Suspense fallback={<SalesPage title={SALES_PAGES.quotes.label}>{null}</SalesPage>}>
      <QuotesList />
    </Suspense>
  );
}
