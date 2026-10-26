"use client";

import { Select } from "antd";
import type { SelectProps } from "antd";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import { fold } from "@/lib/fold";

// A customer's person (Customer's PIC) is one of the contacts saved on that customer in the
// Customer Database, picked by name; nothing else can be entered. Without a linked customer
// there is nothing to pick. A stored value that is no contact (old free text) is shown, marked.
export interface CustomerContactPickerProps
  extends Pick<SelectProps, "size" | "variant" | "className" | "autoFocus" | "defaultOpen" | "onBlur" | "popupMatchSelectWidth" | "style"> {
  /** The shipment's customer (Customer Database id); null when none is linked. */
  customerId?: string | null;
  /** The stored contact name ("" for nobody). */
  value?: string | null;
  /** The picked contact's name, "" when cleared. */
  onChange?: (name: string) => void;
  "aria-label"?: string;
}

export function CustomerContactPicker({ customerId, value, onChange, "aria-label": ariaLabel, ...rest }: CustomerContactPickerProps) {
  const { contacts, isLoading } = useCustomerContacts(customerId ?? "");
  const current = (value ?? "").trim();
  const known = contacts.find((c) => c.name.trim().toLowerCase() === current.toLowerCase());
  const unlinked = !!current && !isLoading && !!customerId && !known;

  // Main contact first, then the rest in the order the Customer Database returns them.
  const options = [...contacts]
    .sort((a, b) => Number(b.isMain) - Number(a.isMain))
    .map((c) => ({ value: c.name, label: c.name, role: c.role, reach: c.email || c.phone }));

  return (
    <Select
      {...rest}
      aria-label={ariaLabel}
      showSearch
      allowClear
      loading={isLoading}
      disabled={!customerId && !current}
      placeholder={customerId ? "Pick a contact" : "Link the customer first"}
      value={known ? known.name : current || undefined}
      status={unlinked ? "warning" : undefined}
      title={unlinked ? `"${current}" is not a contact of this customer — pick one from the list` : undefined}
      options={options}
      filterOption={(input, option) => fold(`${option?.label ?? ""} ${option?.reach ?? ""}`).includes(fold(input.trim()))}
      optionRender={(option) => (
        <span className="flex items-baseline gap-2">
          <span className="font-medium text-slate-800">{option.data.label}</span>
          {option.data.role && <span className="text-[11px] text-slate-400">{option.data.role}</span>}
          {option.data.reach && <span className="ml-auto text-[11px] text-slate-400 truncate">{option.data.reach}</span>}
        </span>
      )}
      notFoundContent={
        !customerId
          ? "Link the shipment to a customer first"
          : isLoading
            ? "Loading contacts…"
            : "No contact matches — add one to the customer in the Customer Database"
      }
      onChange={(name?: string) => onChange?.(name ?? "")}
    />
  );
}
