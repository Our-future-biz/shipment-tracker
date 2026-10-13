"use client";

import { Button, Select } from "antd";
import { KpiTile } from "@/components/KpiTile";
import { useUsers } from "@/hooks/useUsers";
import type { interfaces } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthContext";

// Who owns the quote: one of the company's users. How far the signed-in user may change that is
// the server's answer (permissions.canChangeOwner) - a manager reassigns freely, the owner may
// hand the quote over or give it up, anybody may take a quote that belongs to no user, and a
// colleague's quote can only be looked at. A change is asked of the server at once; the tile
// shows what the server stored.
export function OwnerTile({
  quote,
  changing,
  onChange,
}: {
  quote: interfaces.SalesQuoteItem;
  // The change is on its way: the control waits for the server's answer.
  changing: boolean;
  onChange: (ownerUserId: string | null) => void;
}) {
  const { users } = useUsers();
  const { user } = useAuth();
  const right = quote.permissions.canChangeOwner;
  // A name from before owners were users, which fitted none of them.
  const unlinked = !quote.ownerUserId && quote.ownerLabel ? `${quote.ownerLabel} (not linked to a user)` : "";

  if (right === "any" || right === "own") {
    // Named as Sales names a user everywhere (apps/api/services/quotes/services/userNames.ts).
    const options = users.map((u) => ({ value: u.id, label: u.displayName || u.email }));
    // The owner stays selectable by name while the users load, and when they are no longer among them.
    if (quote.ownerUserId && !users.some((u) => u.id === quote.ownerUserId)) {
      options.unshift({ value: quote.ownerUserId, label: quote.ownerName });
    }
    return (
      <KpiTile
        label="Sales owner"
        size="text"
        value={
          <Select
            showSearch
            allowClear
            size="small"
            className="flex-1 min-w-0"
            aria-label="Sales owner"
            placeholder="Select a user"
            optionFilterProp="label"
            loading={changing}
            disabled={changing}
            value={quote.ownerUserId ?? undefined}
            onChange={(id?: string) => onChange(id ?? null)}
            options={options}
          />
        }
        hint={unlinked ? <span title={unlinked}>{unlinked}</span> : "Saved at once"}
      />
    );
  }

  const owner = quote.ownerUserId ? quote.ownerName : unlinked;
  const name = owner ? (
    <span className="min-w-0 truncate" title={owner}>
      {owner}
    </span>
  ) : (
    <span className="font-normal text-slate-400">No owner</span>
  );

  if (right === "claim") {
    return (
      <KpiTile
        label="Sales owner"
        size="text"
        value={name}
        action={
          <Button size="small" loading={changing} disabled={!user} onClick={() => user && onChange(user.id)}>
            Assign to me
          </Button>
        }
      />
    );
  }

  const managersOnly = "Only a manager can reassign this quote";
  return <KpiTile label="Sales owner" size="text" value={name} hint={<span title={managersOnly}>{managersOnly}</span>} />;
}
