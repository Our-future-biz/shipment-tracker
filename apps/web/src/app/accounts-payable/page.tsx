"use client";

import { Suspense } from "react";
import { AccountsPayableView } from "./_components/AccountsPayableView";

// Finance → Accounts Payable (Council Outlay 9, D4). The view reads the tab and the open invoice from the URL
// (useSearchParams needs a Suspense boundary).
export default function AccountsPayablePage() {
  return (
    <Suspense>
      <AccountsPayableView />
    </Suspense>
  );
}
