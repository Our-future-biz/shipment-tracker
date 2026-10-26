"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Select } from "antd";
import { useCustomer } from "@/hooks/useCustomers";
import type { CustomerItem } from "@/hooks/useCustomers";
import { useUsers } from "@/hooks/useUsers";
import { useToast } from "@/lib/toast";
import { apiErrorMessage } from "@/lib/api";
import { useCanManageCustomers } from "@/lib/auth/AuthContext";
import { SALES_OWNER_FIELD_ID } from "../../_lib/customerAttention";
import { matchesUserOption, userIdOptions, UserOptionLabel, type UserIdOption } from "@/app/sales/_lib/userOptions";

// First letters of the first and the last word of a name ("Martin Koubek" -> "MK"); one word gives two letters.
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1
      ? words[0]!.charAt(0) + words[words.length - 1]!.charAt(0)
      : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "?";
}

interface OwnerNameProps {
  /** What is shown: the owner's e-mail. */
  email: string;
  /** The display name, for the initials; the e-mail gives them when there is none. */
  name?: string;
}

function OwnerName({ email, name }: OwnerNameProps) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold"
      >
        {initialsOf(name || email)}
      </span>
      <span className="truncate font-medium text-slate-800">{email}</span>
    </span>
  );
}

// Who owns the customer: one of the company's users, picked in the page header and shown by e-mail (typing a
// name or an e-mail finds them); the customer stores the user. Locked against a stray click:
// a double click (or Enter) opens the list, and picking or leaving it locks the field again. The choice shows
// at once and is saved straight away; a failed save puts the previous owner back.
interface CustomerSalesOwnerSelectProps {
  customer: CustomerItem;
}

// Only a manager (or admin) may change it — the server refuses anyone else — so for others it stays locked.
export function CustomerSalesOwnerSelect({ customer }: CustomerSalesOwnerSelectProps) {
  const toast = useToast();
  const canChange = useCanManageCustomers();
  const { users, isLoading } = useUsers();
  const { updateCustomer } = useCustomer(customer.id);
  // The owner picked here while its save is on the way; undefined when the loaded customer is shown.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const ownerId = picked !== undefined ? picked : customer.salesOwnerUserId;

  // Shown by e-mail as everywhere else; the owner stays shown as stored while the users load, or once it is no
  // longer one of them.
  const options: UserIdOption[] = userIdOptions(users);
  if (customer.salesOwnerUserId && !users.some((user) => user.id === customer.salesOwnerUserId)) {
    options.unshift({ value: customer.salesOwnerUserId, label: customer.salesOwner });
  }
  // A name typed before owners were users: shown so it can be matched, but it is no user.
  const unlinked = customer.salesOwnerUserId ? "" : customer.salesOwner.trim();

  const owner = options.find((option) => option.value === ownerId);
  const ownerEmail = owner?.label ?? "";
  const placeholder = unlinked ? `${unlinked} (not linked)` : "Select a user";

  const handleUnlockKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!canChange || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    setEditing(true);
  };

  const handleChange = (userId?: string) => {
    const next = userId ?? null;
    setEditing(false);
    setPicked(next);
    // The saved customer goes straight into the cache (useCustomer), so dropping the pick shows it.
    updateCustomer({ salesOwnerUserId: next }).then(
      () => setPicked(undefined),
      (err: unknown) => {
        setPicked(undefined);
        toast.error(`Failed to save the sales owner: ${apiErrorMessage(err)}`);
      },
    );
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white pl-3 pr-1 pt-1 pb-0.5 w-[220px] max-w-full">
      <label htmlFor={SALES_OWNER_FIELD_ID} className="block text-[11px] text-slate-500 leading-4">
        Sales Owner
      </label>
      {!editing ? (
        <div
          id={SALES_OWNER_FIELD_ID}
          role="button"
          tabIndex={0}
          aria-label={
            canChange
              ? `Sales owner: ${ownerEmail || "none"}. Double-click or press Enter to change.`
              : `Sales owner: ${ownerEmail || "none"}.`
          }
          title={canChange ? "Double-click to change" : "Only a manager can change the sales owner"}
          onDoubleClick={() => canChange && setEditing(true)}
          onKeyDown={handleUnlockKey}
          className="flex items-center h-6 mb-0.5 pr-2 rounded cursor-default select-none outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {ownerEmail ? (
            <OwnerName email={ownerEmail} name={owner?.name} />
          ) : (
            <span className="text-[13px] text-slate-400 truncate">{placeholder}</span>
          )}
        </div>
      ) : (
        <Select
          id={SALES_OWNER_FIELD_ID}
          autoFocus
          defaultOpen
          onBlur={() => setEditing(false)}
          variant="borderless"
          size="small"
          showSearch
          allowClear
          filterOption={matchesUserOption}
          className="w-full [&_.ant-select-selector]:!px-0"
          popupMatchSelectWidth={260}
          placeholder={<span className="text-slate-400">{placeholder}</span>}
          loading={isLoading}
          value={ownerId ?? undefined}
          options={options}
          labelRender={({ label, value }) => (
            <OwnerName email={String(label ?? "")} name={options.find((option) => option.value === value)?.name} />
          )}
          optionRender={(option) => <UserOptionLabel label={option.label} name={option.data.name} />}
          onChange={handleChange}
        />
      )}
    </div>
  );
}
