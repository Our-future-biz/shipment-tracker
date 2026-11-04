import { PILL_CLASS } from "@/components/Pill";
import type { interfaces } from "@/lib/api/client";
import { CUSTOMER_ROLE_LABELS } from "../_lib/constants";

interface CustomerRoleBadgesProps {
  roles: interfaces.CustomerRole[];
  /** Also show the customer role (the All view); otherwise only the supplier roles get a badge. */
  withCustomer?: boolean;
}

// What a company is to us, one pill per role: the supplier roles in teal, as the haulier badge was,
// and the customer role in grey where the list mixes both.
export function CustomerRoleBadges({ roles, withCustomer = false }: CustomerRoleBadgesProps) {
  const shown = roles.filter((role) => withCustomer || role !== "customer");
  if (shown.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {shown.map((role) => (
        <span key={role} className={`${PILL_CLASS} ${role === "customer" ? "bg-slate-100 text-slate-600" : "bg-teal-100 text-teal-700"}`}>
          {CUSTOMER_ROLE_LABELS[role]}
        </span>
      ))}
    </span>
  );
}
