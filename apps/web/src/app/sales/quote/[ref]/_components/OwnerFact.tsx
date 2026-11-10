"use client";

import { Button, Select } from "antd";
import { useUsers } from "@/hooks/useUsers";
import type { interfaces } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthContext";
import { matchesUserOption, userIdOptions, UserOptionLabel, type UserIdOption } from "../../../_lib/userOptions";
import { Fact } from "./QuoteFacts";

interface OwnerFactProps {
  quote: interfaces.SalesQuoteItem;
  // The change is on its way: the control waits for the server's answer.
  changing: boolean;
  onChange: (ownerUserId: string | null) => void;
}

// Who owns the quote: one of the company's users, shown by e-mail (typing a name or an e-mail finds
// them; the quote stores the user). How far the signed-in user may change that is
// the server's answer (permissions.canChangeOwner) - a manager reassigns freely, the owner may
// hand the quote over or give it up, anybody may take a quote that belongs to no user, and a
// colleague's quote can only be looked at. A closed quote's owner can only be looked at too: it
// keeps its owner (the server's reason, ownerChangeBlockedReason, is not shown). A change is
// asked of the server at once; the fact shows what the server stored. It is the last fact of the
// summary at the top of the quote (QuoteFacts); only an owner no user was matched to gets small
// print under it.
export function OwnerFact({
  quote,
  changing,
  onChange,
}: OwnerFactProps) {
  const { users } = useUsers();
  const { user } = useAuth();
  const right = quote.permissions.canChangeOwner;
  // A name from before owners were users, which fitted none of them.
  const unlinked = !quote.ownerUserId && quote.ownerLabel ? `${quote.ownerLabel} (not linked to a user)` : "";

  if (right === "any" || right === "own") {
    const options: UserIdOption[] = userIdOptions(users);
    // The owner stays selectable as the server names them (ownerName) while the users load, and when
    // they are no longer among them.
    if (quote.ownerUserId && !users.some((u) => u.id === quote.ownerUserId)) {
      options.unshift({ value: quote.ownerUserId, label: quote.ownerName });
    }
    return (
      <Fact label="Sales owner" note={unlinked && <span title={unlinked}>{unlinked}</span>}>
        <Select
          showSearch
          allowClear
          size="small"
          className="flex-1 min-w-0"
          aria-label="Sales owner"
          placeholder="Select a user"
          filterOption={matchesUserOption}
          optionRender={(option) => <UserOptionLabel label={option.label} name={option.data.name} />}
          popupMatchSelectWidth={260}
          loading={changing}
          disabled={changing}
          value={quote.ownerUserId ?? undefined}
          onChange={(id?: string) => onChange(id ?? null)}
          options={options}
        />
      </Fact>
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
      <Fact label="Sales owner">
        <span className="flex items-center gap-2 min-w-0 w-full">
          {name}
          <Button size="small" className="ml-auto shrink-0" loading={changing} disabled={!user} onClick={() => user && onChange(user.id)}>
            Assign to me
          </Button>
        </span>
      </Fact>
    );
  }

  return <Fact label="Sales owner">{name}</Fact>;
}
