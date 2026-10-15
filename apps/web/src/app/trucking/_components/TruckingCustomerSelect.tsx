"use client";

import { useState, type ReactNode } from "react";
import { Select, Spin } from "antd";
import { useCustomers } from "@/hooks/useCustomers";
import { useDebounced } from "@/hooks/useDebounced";

const MIN_SEARCH_LENGTH = 2;
const CUSTOMER_LIMIT = 20;

interface TruckingCustomerSelectProps {
  value: string | null;
  /** The name of the customer in `value`, for a value set before anything was searched. */
  valueName?: string | null;
  onChange: (customerId: string | null, name: string | null) => void;
  ariaLabel: string;
  placeholder?: string;
}

// A customer of the Customer Database, searched on the server as the user types (name, IČO, DIČ,
// city); the whole database is never downloaded for it.
export const TruckingCustomerSelect = ({ value, valueName, onChange, ariaLabel, placeholder = "Type a company name or IČO…" }: TruckingCustomerSelectProps) => {
  const [text, setText] = useState("");
  const [pickedName, setPickedName] = useState<string | null>(valueName ?? null);
  const search = useDebounced(text, 300).trim();
  const searching = search.length >= MIN_SEARCH_LENGTH;
  const { customers, isFetching, isError } = useCustomers({ search }, { enabled: searching });
  // Only the answer to what is typed is offered, never what the hook still holds from before.
  const answered = searching && search === text.trim() && !isFetching;

  const options = (answered ? customers.slice(0, CUSTOMER_LIMIT) : []).map((c) => ({
    value: c.id,
    name: c.companyName,
    label: (
      <span>
        {c.companyName}
        <span className="ml-2 text-xs text-slate-400">{[c.city, c.ico].filter(Boolean).join(" · ")}</span>
      </span>
    ),
  }));
  if (value && !options.some((o) => o.value === value)) options.unshift({ value, name: pickedName ?? value, label: <span>{pickedName ?? value}</span> });

  let notFound: ReactNode = `Type ${MIN_SEARCH_LENGTH} letters or more`;
  if (searching && !answered) notFound = <Spin size="small" />;
  else if (answered) notFound = isError ? "The Customer Database could not be searched" : "No customer found";

  return (
    <Select
      showSearch
      allowClear
      aria-label={ariaLabel}
      placeholder={placeholder}
      className="w-full"
      value={value ?? undefined}
      filterOption={false}
      searchValue={text}
      onSearch={setText}
      options={options}
      optionLabelProp="name"
      notFoundContent={notFound}
      onChange={(id: string | undefined, option) => {
        const name = id ? ((Array.isArray(option) ? option[0] : option) as { name?: string } | undefined)?.name ?? null : null;
        setPickedName(name);
        setText("");
        onChange(id ?? null, name);
      }}
    />
  );
};
