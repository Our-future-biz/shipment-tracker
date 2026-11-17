"use client";

import { Suspense } from "react";
import { DocumentsView } from "./_components/DocumentsView";

// The workflow reads ?destination= from the URL (Accounts Payable's "Read an invoice"), and useSearchParams
// needs a Suspense boundary.
export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsView />
    </Suspense>
  );
}
