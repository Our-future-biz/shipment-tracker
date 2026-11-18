"use client";

import { Suspense } from "react";
import { AccountsReceivableView } from "./_components/AccountsReceivableView";

// Finance → Accounts Receivable (Council Outlay 10, D4). The view reads the tab, the period and the open invoice from
// the URL (useSearchParams needs a Suspense boundary).
export default function AccountsReceivablePage() {
  return (
    <Suspense>
      <AccountsReceivableView />
    </Suspense>
  );
}
