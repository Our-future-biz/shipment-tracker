"use client";

import { WarningOutlined } from "@ant-design/icons";
import { useUsers } from "@/hooks/useUsers";
import { userByEmail } from "@/lib/people";

// A customer's sales owner where a list shows it: the owner user by name, the e-mail it is
// recorded by on hover (owner decision, User Council x4/S16: people by name wherever the app has
// it); by e-mail while the users load or for a user without a name. A name typed before
// owners were users that no user could be matched to stays as it was (POST /customers/people/normalize
// leaves it), muted and marked, so it gets picked again on the customer.
export function SalesOwnerText({ owner, linked }: { owner: string; linked: boolean }) {
  const { users } = useUsers();
  const shown = owner.trim();
  if (linked) {
    const name = userByEmail(shown, users)?.displayName.trim();
    return name ? <span title={shown}>{name}</span> : <>{shown}</>;
  }
  if (!shown) return <>{shown}</>;
  const why = `"${shown}" is not a user — pick the sales owner again on the customer`;
  return (
    <span title={why} className="inline-flex max-w-full items-center gap-1 text-slate-400">
      <span className="truncate">{shown}</span>
      <span className="shrink-0">(not linked)</span>
      <WarningOutlined role="img" aria-label={why} className="shrink-0 text-amber-500 text-[11px]" />
    </span>
  );
}
