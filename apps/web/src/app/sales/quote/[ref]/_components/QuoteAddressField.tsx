"use client";

import { Select } from "antd";
import { LINK_CLASS } from "@/components/linkClass";
import { useCustomerAddresses } from "@/hooks/useCustomerAddresses";
import { quoteAddressOptions, type QuoteAddressType } from "@/app/sales/_lib/quoteAddress";

interface QuoteAddressFieldProps {
  /** "Pickup Address" */
  label: string;
  /** Which of the customer's addresses it offers */
  type: QuoteAddressType;
  /** The quote's customer in the Customer Database; absent when its name was only typed. */
  customerId?: string | null;
  /** The address as the quote keeps it */
  value?: string;
  onChange: (text: string) => void;
}

interface AddressPlaceholderState {
  /** The quote's customer is one of the Customer Database */
  linked: boolean;
  isLoading: boolean;
  isError: boolean;
  /** "pickup" / "delivery" */
  kind: string;
  /** The customer has addresses of the kind to pick from */
  offered: boolean;
}

// What the empty field says: why there is nothing to pick yet, or what to pick.
function addressPlaceholder({ linked, isLoading, isError, kind, offered }: AddressPlaceholderState): string {
  if (!linked) return "Link the customer to the Customer Database first";
  if (isLoading) return "Loading…";
  if (isError) return "Could not load the customer's addresses";
  return offered ? `Pick a ${kind} address` : `No ${kind} address in the Customer Database`;
}

// The quote's Pickup or Delivery Address: one of the customer's Pickup (Delivery) addresses in the
// Customer Database, nothing typed by hand. An address the quote already has that is not one of
// them (typed before, copied from a shipment, or of another customer) stays shown until another
// is picked or it is cleared, and says so.
export function QuoteAddressField({ label, type, customerId, value, onChange }: QuoteAddressFieldProps) {
  const { addresses, isLoading, isError } = useCustomerAddresses(customerId ?? "");
  const options = quoteAddressOptions(addresses, type);
  const kind = type.toLowerCase();
  // Only once the customer's addresses are read: without a linked customer, or while they could
  // not be read, nothing is known to set the value apart from.
  const stray = !!value && !!customerId && !isLoading && !isError && !options.some((o) => o.value === value);
  const placeholder = addressPlaceholder({ linked: !!customerId, isLoading, isError, kind, offered: options.length > 0 });
  const addHere = customerId ? `/customers/${customerId}?tab=addresses` : null;

  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <Select
        size="small"
        className="w-full"
        aria-label={label}
        placeholder={placeholder}
        disabled={!customerId}
        loading={isLoading}
        allowClear
        showSearch
        optionFilterProp="label"
        value={value || undefined}
        onChange={(v?: string) => onChange(v ?? "")}
        options={stray ? [{ value, label: value }, ...options] : options}
        notFoundContent={<span className="text-slate-500">No {kind} address of the customer matches</span>}
      />
      {stray && <span className="text-[11px] text-amber-700">Not one of the customer&apos;s {kind} addresses in the Customer Database: pick one of them.</span>}
      {addHere && !isLoading && !isError && (stray || !options.length) && (
        // A new tab: the quote's unsaved changes stay where they are.
        <a href={addHere} target="_blank" rel="noreferrer" className={`text-[11px] ${LINK_CLASS}`}>
          Add a {kind} address in the Customer Database
        </a>
      )}
    </div>
  );
}
