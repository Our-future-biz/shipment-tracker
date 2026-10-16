"use client";

import { Select } from "antd";
import { SectionCard } from "@/components/SectionCard";
import type { CustomerItem } from "@/hooks/useCustomers";
import type { interfaces } from "@/lib/api/client";
import { useToast } from "@/lib/toast";
import { CUSTOMER_LABELS, CUSTOMER_ROLE_OPTIONS, CUSTOMER_STATUSES } from "../../_lib/constants";
import { CustomerInfoRow } from "./CustomerInfoRow";
import { EditableText } from "./EditableText";
import { SELECT_PROPS, SELECT_WRAPPER_CLASS } from "./inlineSelect";
import { useCustomerEdits } from "./useCustomerEdits";
import { useCanManageCustomers } from "@/lib/auth/AuthContext";
import { useModules } from "@/lib/auth/AuthContext";

const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

const STATUS_OPTIONS = toOptions(CUSTOMER_STATUSES);
const ACCOUNT_TYPE_OPTIONS = toOptions(CUSTOMER_LABELS);

interface CustomerCrmCardProps {
  customer: CustomerItem;
}

// The CRM fields of a customer: roles (customer / haulier), status, account type and website (currency and payment terms are on the Finance
// tab). Every change saves itself.
export function CustomerCrmCard({ customer }: CustomerCrmCardProps) {
  const { isEnabled: isModuleOn } = useModules();
  const { shown, save } = useCustomerEdits(customer);
  // The account type is a manager's decision; the server refuses anyone else.
  const canManage = useCanManageCustomers();
  const toast = useToast();

  // A company is always a customer, a haulier or both, so the last role cannot be removed.
  const handleRolesChange = (roles: interfaces.CustomerRole[]) => {
    if (roles.length === 0) {
      toast.error("A company needs at least one role");
      return;
    }
    save({ roles });
  };

  return (
    <SectionCard title="CRM">
      <div>
        {/* Roles say who is a haulier: a Trucking matter, shown only with the Trucking Concept. */}
        {isModuleOn("trucking_concept") && (
          <CustomerInfoRow label="Roles" narrow>
            <div className={SELECT_WRAPPER_CLASS}>
              <Select
                {...SELECT_PROPS}
                mode="multiple"
                aria-label="Roles"
                value={shown.roles}
                options={CUSTOMER_ROLE_OPTIONS}
                onChange={handleRolesChange}
              />
            </div>
          </CustomerInfoRow>
        )}
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
