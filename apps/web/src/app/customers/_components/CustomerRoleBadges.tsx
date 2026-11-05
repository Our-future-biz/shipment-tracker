import { Badge } from "@/components/Badge";
import type { interfaces } from "@/lib/api/client";
import { CUSTOMER_ROLE_LABELS } from "../_lib/constants";

interface CustomerRoleBadgesProps {
  roles: interfaces.CustomerRole[];
  /** Also show the customer role (the All view); otherwise only the supplier roles get a badge. */
  withCustomer?: boolean;
}

// What a company is to us, one badge per role: the supplier roles in the app's indigo, and the
// customer role in grey where the list mixes both.
export function CustomerRoleBadges({ roles, withCustomer = false }: CustomerRoleBadgesProps) {
  const shown = roles.filter((role) => withCustomer || role !== "customer");
  if (shown.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {shown.map((role) => (
        <Badge key={role} tone={role === "customer" ? "" : "i"}>
          {CUSTOMER_ROLE_LABELS[role]}
        </Badge>
      ))}
    </span>
  );
}
