"use client";

import { Suspense } from "react";
import { MonthEndView } from "./_components/MonthEndView";

// Finance → Accounts Receivable → Month-end (step 7). The view reads the day from the URL (?day=…; useSearchParams
// needs a Suspense boundary).
export default function MonthEndPage() {
  return (
    <Suspense>
      <MonthEndView />
    </Suspense>
  );
}
