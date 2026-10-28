"use client";

import { Select } from "antd";
import { SectionCard } from "@/components/SectionCard";
import type { CustomerItem } from "@/hooks/useCustomers";
import type { interfaces } from "@/lib/api/client";
import { useToast } from "@/lib/toast";
import { CUSTOMER_LABELS, CUSTOMER_STATUSES, customerRoleOptions } from "../../_lib/constants";
import { CustomerInfoRow } from "./CustomerInfoRow";
import { EditableText } from "./EditableText";
import { SELECT_PROPS, SELECT_WRAPPER_CLASS } from "./inlineSelect";
import { useCustomerEdits } from "./useCustomerEdits";
import { useCanManageCustomers } from "@/lib/auth/AuthContext";
import { useCanSeeConcepts } from "@/lib/auth/AuthContext";

const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

const STATUS_OPTIONS = toOptions(CUSTOMER_STATUSES);
const ACCOUNT_TYPE_OPTIONS = toOptions(CUSTOMER_LABELS);

interface CustomerCrmCardProps {
  customer: CustomerItem;
}

// The CRM fields of a customer: roles (customer / haulier / rail operator), status, account type and website (currency and payment terms are
// on the Finance tab). Every change saves itself.
export function CustomerCrmCard({ customer }: CustomerCrmCardProps) {
  const canSeeConcepts = useCanSeeConcepts();
  const { shown, save } = useCustomerEdits(customer);
  // The account type is a manager's decision; the server refuses anyone else.
  const canManage = useCanManageCustomers();
  const toast = useToast();

  // Roles the user cannot see (Haulier without the Trucking Concept) are kept as they are.
  const roleOptions = customerRoleOptions(canSeeConcepts);
  const shownRoles = shown.roles.filter((r) => roleOptions.some((o) => o.value === r));
  const hiddenRoles = shown.roles.filter((r) => !shownRoles.includes(r));

  // A company always has at least one role, so the last one cannot be removed.
  const handleRolesChange = (picked: interfaces.CustomerRole[]) => {
    const roles = [...picked, ...hiddenRoles];
    if (roles.length === 0) {
      toast.error("A company needs at least one role");
      return;
    }
    save({ roles });
  };

  return (
    <SectionCard title="CRM">
      <div>
        {/* Roles say who is a supplier (rail operator, and haulier with the Trucking Concept); a manager's decision, like the account type. */}
        <CustomerInfoRow label="Roles" narrow>
          <div className={SELECT_WRAPPER_CLASS}>
            <Select
              {...SELECT_PROPS}
              mode="multiple"
              aria-label="Roles"
              disabled={!canManage}
              title={canManage ? undefined : "Only a manager can change the roles"}
              value={shownRoles}
              options={roleOptions}
              onChange={handleRolesChange}
            />
          </div>
        </CustomerInfoRow>
        <CustomerInfoRow label="Status" narrow>
          <div className={SELECT_WRAPPER_CLASS}>
            <Select
              {...SELECT_PROPS}
              aria-label="Status"
              value={shown.status}
              options={STATUS_OPTIONS}
              onChange={(value: interfaces.CustomerStatus) => save({ status: value })}
            />
          </div>
        </CustomerInfoRow>
        <CustomerInfoRow label="Account type" narrow>
          <div className={SELECT_WRAPPER_CLASS}>
            <Select
              {...SELECT_PROPS}
              aria-label="Account type"
              disabled={!canManage}
              title={canManage ? undefined : "Only a manager can change the account type"}
              value={shown.label}
              options={ACCOUNT_TYPE_OPTIONS}
              onChange={(value: interfaces.CustomerLabel) => save({ label: value })}
            />
          </div>
        </CustomerInfoRow>
      </div>

      <CustomerInfoRow label="Website" narrow>
        <EditableText
          value={shown.companyWebsite}
          onCommit={(value) => save({ companyWebsite: value })}
          placeholder="add…"
          label="Website"
        />
      </CustomerInfoRow>
    </SectionCard>
  );
}
