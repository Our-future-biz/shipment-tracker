"use client";

import { Suspense } from "react";
import { PohodaExportView } from "./_components/PohodaExportView";

// Finance → Accounts Receivable → Export to Pohoda (step 7). A client page with a Suspense boundary, as the other
// Accounts Receivable pages.
export default function PohodaExportPage() {
  return (
    <Suspense>
      <PohodaExportView />
    </Suspense>
  );
}
