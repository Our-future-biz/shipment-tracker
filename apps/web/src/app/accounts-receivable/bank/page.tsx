"use client";

import { Suspense } from "react";
import { BankStatementsView } from "./_components/BankStatementsView";

// Finance → Accounts Receivable → Bank statements (step 7). The view reads the open statement from the URL
// (?statement=…; useSearchParams needs a Suspense boundary).
export default function BankStatementsPage() {
  return (
    <Suspense>
      <BankStatementsView />
    </Suspense>
  );
}
