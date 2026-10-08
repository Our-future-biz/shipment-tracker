"use client";

import { statusDotClass } from "../_lib/constants";

// CRM status (Active / Prospect / Inactive) as a coloured dot with its name — a different
// shape from the account-type pill, because a new customer is "Prospect" in both.
export function CustomerStatusDot({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-slate-600">
      <span className={`w-2 h-2 rounded-full ${statusDotClass(status)}`} />
      {status}
    </span>
  );
}
