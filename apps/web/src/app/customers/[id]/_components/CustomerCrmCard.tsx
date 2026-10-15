"use client";

import { Select } from "antd";
import { SectionCard } from "@/components/SectionCard";
import type { CustomerItem } from "@/hooks/useCustomers";
import type { interfaces } from "@/lib/api/client";
import { CUSTOMER_LABELS, CUSTOMER_STATUSES } from "../../_lib/constants";
import { CustomerInfoRow } from "./CustomerInfoRow";
import { EditableText } from "./EditableText";
import { SELECT_PROPS, SELECT_WRAPPER_CLASS } from "./inlineSelect";
import { useCustomerEdits } from "./useCustomerEdits";

const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

const STATUS_OPTIONS = toOptions(CUSTOMER_STATUSES);
const ACCOUNT_TYPE_OPTIONS = toOptions(CUSTOMER_LABELS);

interface CustomerCrmCardProps {
  customer: CustomerItem;
}

// The CRM fields of a customer: status, account type and website (currency and payment terms are on the Finance
// tab). Every change saves itself.
export function CustomerCrmCard({ customer }: CustomerCrmCardProps) {
  const { shown, save } = useCustomerEdits(customer);

  return (
    <SectionCard title="CRM">
      <div>
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
