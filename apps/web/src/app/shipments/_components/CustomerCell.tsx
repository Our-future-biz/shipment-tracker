"use client";

import { useEffect, useRef, useState } from "react";
import { AutoComplete } from "antd";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Minimum characters before the customer database is queried — typing one or two
// letters would match most of the database and isn't worth a round trip.
const MIN_QUERY = 3;

interface CustomerCellProps {
  name: string;
  customerId?: string | null;
  textStyle?: React.CSSProperties;
  onChange: (name: string, customerId: string | null) => void;
}

// A party column of the shipments list (Customer / Shipper / Consignee):
// double-click to search the customer database (server-side, from 3 characters
// up) and pick a customer, which links the shipment to it. Free text is still
// allowed for a party that isn't in the CRM — it just stays unlinked. Mirrors
// the detail page's CustomerLinkField.
export function CustomerCell({ name, customerId, textStyle, onChange }: CustomerCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [query, setQuery] = useState("");
  const justSelected = useRef(false);

  // Debounce so holding down a key doesn't fire a request per character.
  useEffect(() => {
    const t = setTimeout(() => setQuery(draft.trim()), 250);
    return () => clearTimeout(t);
  }, [draft]);

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
    setQuery("");
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

  return (
    <span
      className="cursor-pointer rounded px-1 -mx-1 hover:bg-slate-100 transition-colors block truncate"
      title="Double-click to edit"
      onDoubleClick={startEdit}
    >
      {name ? (
        customerId ? (
          <Link
            href={`/customers/${customerId}`}
            className="text-indigo-500 hover:underline font-medium"
            style={textStyle}
            onClick={(e) => e.stopPropagation()}
          >
            {name}
          </Link>
        ) : (
          <span className="text-slate-600" style={textStyle}>{name}</span>
        )
      ) : (
        <span className="text-slate-300">—</span>
      )}
    </span>
  );
}
