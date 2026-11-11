"use client";

import { useState, type ReactNode, type Ref } from "react";
import Link from "next/link";
import { Select, type RefSelectProps } from "antd";
import { useCustomers } from "@/hooks/useCustomers";
import { useDebounced } from "@/hooks/useDebounced";

const MIN_SEARCH_LENGTH = 2;

// How many customers the picker offers at a time.
const CUSTOMER_LIMIT = 20;

interface InvoiceCustomerSelectProps {
  placeholder: string;
  disabled: boolean;
  onPick: (customerId: string, companyName: string) => void;
  /** Behind the pencil: it opens at once, focused, and says when it closes. */
  autoOpen?: boolean;
  onClose?: () => void;
  selectRef?: Ref<RefSelectProps>;
}

// The customer an invoice is billed to, out of the whole Customer Database: the server looks for what
// is typed (name, IČO, DIČ, city), so no list of companies is downloaded first and no customer is out of
// reach, however many there are. Only companies with the Customer role are offered (K13).
export function InvoiceCustomerSelect({ placeholder, disabled, onPick, autoOpen = false, onClose, selectRef }: InvoiceCustomerSelectProps) {
  const [typed, setTyped] = useState("");
  const wanted = typed.trim();
  // The request waits until typing pauses.
  const search = useDebounced(wanted, 300);
  const searching = wanted.length >= MIN_SEARCH_LENGTH && search.length >= MIN_SEARCH_LENGTH;
  const { customers, isFetching, isError } = useCustomers({ search, role: "customer" }, { enabled: searching });
  // Only the answer to what is typed is listed, never what the hook still holds from an earlier search.
  const answered = searching && search === wanted && !isFetching;
  const found = answered && !isError ? customers.slice(0, CUSTOMER_LIMIT) : [];

  let emptyText: ReactNode = `Type at least ${MIN_SEARCH_LENGTH} letters to search the Customer Database`;
  if (searching && !answered) emptyText = "Searching…";
  else if (answered && isError) emptyText = "The Customer Database could not be searched";
  else if (answered) {
    emptyText = (
      <span>
        No customers match — add one in the <Link href="/customers">Customer Database</Link>
      </span>
    );
  }

  return (
    <Select
      ref={selectRef}
      size="small"
      showSearch
      placeholder={placeholder}
      value={null}
      // The server has already searched; filtering again here would hide what it found by DIČ or city.
      filterOption={false}
      onSearch={setTyped}
      loading={searching && isFetching}
      onChange={(id: string | null) => {
        const picked = found.find((c) => c.id === id);
        if (picked) onPick(picked.id, picked.companyName);
      }}
      disabled={disabled}
      options={found.map((c) => ({ value: c.id, label: `${c.companyName}${c.ico ? ` · ${c.ico}` : ""}` }))}
      className="w-[220px] max-w-full"
      aria-label="Customer to invoice"
      notFoundContent={<span className="text-[13px]">{emptyText}</span>}
      autoFocus={autoOpen}
      defaultOpen={autoOpen}
      // The box empties itself when the list closes; the search goes with it, or the list would open again on it.
      onOpenChange={(open) => {
        if (open) return;
        setTyped("");
        onClose?.();
      }}
    />
  );
}
