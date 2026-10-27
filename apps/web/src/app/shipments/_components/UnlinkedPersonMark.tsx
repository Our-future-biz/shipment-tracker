"use client";

import { WarningOutlined } from "@ant-design/icons";
import { useUsers } from "@/hooks/useUsers";
import { isUnlinkedPerson } from "@/lib/people";
import { splitPersonStamp } from "@/app/shipments/_lib/personFields";

/**
 * Marks a person field holding an old name or free text instead of a user, so it gets picked
 * again; `hint` says where. An approval stamp is judged by who is in it, not by its date.
 */
export function UnlinkedPersonMark({ value, hint }: { value: string | null | undefined; hint: string }) {
  const { users, isLoading } = useUsers();
  const { person } = splitPersonStamp(value);
  if (isLoading || !isUnlinkedPerson(person, users)) return null;
  const why = `"${person}" is not a user — ${hint}`;
  return (
    <span role="img" aria-label={why} title={why} className="ml-1 shrink-0 self-center text-amber-500 text-[11px] leading-none">
      <WarningOutlined />
    </span>
  );
}
