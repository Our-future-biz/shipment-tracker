"use client";

import { WarningOutlined } from "@ant-design/icons";
import { useUsers } from "@/hooks/useUsers";
import { isUnlinkedPerson } from "@/lib/people";
import { shipmentOwnerOf } from "../_lib/owner";

// The Shipment Owner in a grid, as the user's e-mail. An older value that is no user (a name,
// free text) is shown as it is and marked, so somebody picks a user in the job's Overview.
export function OwnerCell({ value }: { value: string | null | undefined }) {
  const { users, isLoading } = useUsers();
  const owner = shipmentOwnerOf(value);
  if (!owner) return <span className="text-slate-300">—</span>;
  const why = !isLoading && isUnlinkedPerson(owner, users) ? `"${owner}" is not a user — pick one in the job's Overview` : "";
  return (
    <span className="inline-flex items-center gap-1 text-slate-600" title={why || undefined}>
      {owner}
      {why && (
        <span role="img" aria-label={why} className="shrink-0 text-amber-500 text-[11px] leading-none">
          <WarningOutlined />
        </span>
      )}
    </span>
  );
}
