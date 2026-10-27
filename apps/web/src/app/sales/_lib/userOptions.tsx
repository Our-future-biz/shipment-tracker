import type { ReactNode } from "react";
import { sortedUsers, userMatches, type PickableUser } from "@/lib/people";

// The pickers that choose a user by id - a quote's owner, a follow-up task's assignee, a
// customer's sales owner - show the user as every picked person is shown: by e-mail (owner
// decision, 26 Oct 2026). Like UserPicker, the list gives the name above the e-mail and typing a
// name or an e-mail finds the user.

/** A user as an option of an antd Select keyed by user id. */
export interface UserIdOption {
  value: string;
  /** The e-mail: what the field shows once the user is picked. */
  label: string;
  /** The display name, shown in the list above the e-mail; "" when there is none. */
  name?: string;
}

/** The company's users as options keyed by id, labelled by e-mail, in the order a picker lists them. */
export function userIdOptions(users: readonly PickableUser[]): UserIdOption[] {
  return sortedUsers(users).map((u) => ({ value: u.id, label: u.email, name: u.displayName }));
}

/** filterOption of such a Select: the option fits every word typed, in its name or e-mail. Other options ("Me", "No owner") are found by their label. */
export function matchesUserOption(input: string, option?: { label?: ReactNode; name?: string }): boolean {
  const label = typeof option?.label === "string" ? option.label : "";
  return userMatches({ id: "", email: label, displayName: option?.name ?? "" }, input);
}

interface UserOptionLabelProps {
  label: ReactNode;
  name?: string;
}

/** How an option is listed (optionRender): the name with the e-mail under it, or the label alone. */
export function UserOptionLabel({ label, name }: UserOptionLabelProps) {
  if (!name) return <span className="text-slate-800">{label}</span>;
  return (
    <span className="flex flex-col leading-tight py-0.5 min-w-0">
      <span className="text-slate-800 truncate">{name}</span>
      <span className="text-[11px] text-slate-500 truncate">{label}</span>
    </span>
  );
}
