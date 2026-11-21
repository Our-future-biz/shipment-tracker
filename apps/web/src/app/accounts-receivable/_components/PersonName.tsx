"use client";

import { useUsers } from "@/hooks/useUsers";
import { userByEmail } from "@/lib/people";

// A person of a job or an invoice (Person in Charge, Holiday Cover, who issued it) where Accounts Receivable shows them:
// the user by name, the e-mail they are stored by on hover - people by name wherever the app has it, as SalesOwnerText
// does (mock test run). By e-mail while the users load, or for one that is no user's.
export function PersonName({ email, className }: { email: string; className?: string }) {
  const { users } = useUsers();
  const shown = email.trim();
  const name = userByEmail(shown, users)?.displayName.trim();
  return (
    <span className={className} title={shown || undefined}>
      {name || shown}
    </span>
  );
}
