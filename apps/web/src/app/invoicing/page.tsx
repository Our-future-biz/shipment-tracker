"use client";

import { Suspense } from "react";
import { InvoicingView } from "./_components/InvoicingView";

// InvoicingView reads the chosen shipment from the URL (useSearchParams needs a Suspense boundary).
export default function InvoicingPage() {
  return (
    <Suspense>
      <InvoicingView />
    </Suspense>
  );
}
