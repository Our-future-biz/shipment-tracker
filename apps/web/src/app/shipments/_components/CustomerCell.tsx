"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useDebounced } from "@/hooks/useDebounced";
import { AutoComplete } from "antd";
import { EditableLink } from "@/components/EditableLink";
import { CustomerHoverCard } from "@/components/CustomerHoverCard";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EMPTY, LINK } from "@/styles/ui";

// Minimum characters before the customer database is queried — typing one or two
// letters would match most of the database and isn't worth a round trip.
const MIN_QUERY = 3;

interface CustomerCellProps {
  name: string;
  customerId?: string | null;
  textStyle?: React.CSSProperties;
  onChange: (name: string, customerId: string | null) => void;
  /** The user may not change this shipment's details: the name is shown (with its link and card) and not edited. */
  locked?: boolean;
}

// A party column of the shipments list (Customer / Shipper / Consignee):
// double-click to search the customer database (server-side, from 3 characters
// up) and pick a customer, which links the shipment to it. Free text is still
// allowed for a party that isn't in the CRM — it just stays unlinked. Mirrors
// the detail page's CustomerLinkField.
export function CustomerCell({ name, customerId, textStyle, onChange, locked = false }: CustomerCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  // Debounced so holding down a key doesn't fire a request per character.
  const query = useDebounced(draft.trim(), 250);
  const justSelected = useRef(false);

  const enabled = editing && query.length >= MIN_QUERY;
  const { data, isFetching } = useQuery({
    queryKey: ["customers", "lookup", query],
    queryFn: () => api.customers.customerList({ search: query }),
    enabled,
    staleTime: 60_000,
  });
  const matches = enabled ? (data?.data ?? []) : [];

  const options = matches.slice(0, 8).map((c) => ({ key: c.id, value: c.companyName, id: c.id }));

  const startEdit = () => {
    setDraft(name);
    justSelected.current = false;
    setEditing(true);
  };

  // Leaving the field keeps whatever was typed: an exact name match links that
  // customer, an unchanged value keeps the existing link, anything else unlinks.
  const commitFreeText = () => {
    if (justSelected.current) {
      justSelected.current = false;
      setEditing(false);
      return;
    }
    const typed = draft.trim();
    const match = matches.find((c) => c.companyName.toLowerCase() === typed.toLowerCase());
    const id = match ? match.id : typed === name ? (customerId ?? null) : null;
    setEditing(false);
    if (typed !== name || id !== (customerId ?? null)) onChange(typed, id);
  };

  if (editing) {
    return (
      <AutoComplete
        autoFocus
        size="small"
        className="w-full"
        value={draft}
        options={options}
        filterOption={false}
        placeholder="Type customer name…"
        notFoundContent={
          query.length < MIN_QUERY
            ? `Type ${MIN_QUERY}+ characters…`
            : isFetching
              ? "Searching…"
              : "No customer found"
        }
        onChange={(v) => setDraft(v)}
        onSelect={(v, option) => {
          justSelected.current = true;
          setEditing(false);
          onChange(v, (option as { id?: string }).id ?? null);
        }}
        onBlur={commitFreeText}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitFreeText();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  // A conditional-format colour (textStyle) shows instead of the link's own, which "!" would beat.
  const linkClass = `${textStyle?.color ? "hover:!underline" : LINK} font-medium`;
  return (
    <span
      className={`rounded px-1 -mx-1 transition-colors block truncate ${locked ? "" : "cursor-pointer hover:bg-slate-100"}`}
      // A linked customer shows its card on hover instead of this tooltip.
      title={(name && customerId) || locked ? undefined : "Double-click to edit"}
      onDoubleClick={locked ? undefined : startEdit}
    >
      {name ? (
        customerId ? (
          // Click opens the customer, double click changes it (like every other cell).
          <CustomerHoverCard customerId={customerId}>
            {locked ? (
              <Link href={`/customers/${customerId}`} className={linkClass} style={textStyle} onClick={(e) => e.stopPropagation()}>
                {name}
              </Link>
            ) : (
              <EditableLink href={`/customers/${customerId}`} onEdit={startEdit} className={linkClass} style={textStyle}>
                {name}
              </EditableLink>
            )}
          </CustomerHoverCard>
        ) : (
          <span className="text-slate-700" style={textStyle}>{name}</span>
        )
      ) : (
        <span className={EMPTY}>—</span>
      )}
    </span>
  );
}
