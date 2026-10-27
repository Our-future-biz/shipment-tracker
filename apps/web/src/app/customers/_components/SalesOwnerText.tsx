"use client";

import { WarningOutlined } from "@ant-design/icons";

// A customer's sales owner where a list shows it: the owner user's e-mail. A name typed before
// owners were users that no user could be matched to stays as it was (POST /customers/people/normalize
// leaves it), muted and marked, so it gets picked again on the customer.
export function SalesOwnerText({ owner, linked }: { owner: string; linked: boolean }) {
  const shown = owner.trim();
  if (linked || !shown) return <>{shown}</>;
  const why = `"${shown}" is not a user — pick the sales owner again on the customer`;
  return (
    <span title={why} className="inline-flex max-w-full items-center gap-1 text-slate-400">
      <span className="truncate">{shown}</span>
      <span className="shrink-0">(not linked)</span>
      <WarningOutlined role="img" aria-label={why} className="shrink-0 text-amber-500 text-[11px]" />
    </span>
  );
}
