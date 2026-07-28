"use client";

import { useRef, useState } from "react";
import { AutoComplete } from "antd";
import Link from "next/link";
import { EditOutlined } from "@ant-design/icons";
import { useCustomers } from "@/hooks/useCustomers";

interface CustomerLinkFieldProps {
  label: string;
  name: string;
  customerId?: string | null;
  onChange: (name: string, customerId: string | null) => void;
}

// A shipment party field (Customer / Shipper / Consignee) linked to the customer
// database: type to search, pick a customer, and the name renders as a link to
// that customer. Free text (a party not in the CRM) is still allowed — it just
// won't be linked.
export function CustomerLinkField({ label, name, customerId, onChange }: CustomerLinkFieldProps) {
  const { customers } = useCustomers();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const justSelected = useRef(false);

  const options = customers
    .filter((c) => c.companyName.toLowerCase().includes(draft.trim().toLowerCase()))
    .slice(0, 8)
    .map((c) => ({ value: c.companyName, id: c.id, label: c.companyName }));

  const startEdit = () => {
    setDraft(name);
    justSelected.current = false;
    setEditing(true);
  };

  const commitFreeText = () => {
    if (justSelected.current) {
      justSelected.current = false;
      setEditing(false);
      return;
    }
    const match = customers.find((c) => c.companyName.toLowerCase() === draft.trim().toLowerCase());
    const id = match ? match.id : draft === name ? customerId ?? null : null;
    onChange(draft.trim(), id);
    setEditing(false);
  };

  return (
    <div className="flex py-1.5 text-xs border-b border-slate-100 last:border-b-0">
      <span className="text-slate-600 font-semibold w-[180px] shrink-0">{label}</span>
      <div className="flex-1 min-w-0">
        {editing ? (
          <AutoComplete
            autoFocus
            size="small"
            className="w-full"
            value={draft}
            options={options}
            filterOption={false}
            placeholder="Type customer name…"
            onChange={(v) => setDraft(v)}
            onSelect={(v, option) => {
              justSelected.current = true;
              onChange(v, (option as { id?: string }).id ?? null);
              setEditing(false);
            }}
            onBlur={commitFreeText}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitFreeText();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <div className="group flex items-center gap-1.5">
            {name ? (
              customerId ? (
                <Link href={`/customers/${customerId}`} className="text-indigo-600 hover:underline font-medium truncate">
                  {name}
                </Link>
              ) : (
                <span className="text-slate-900 font-medium truncate">{name}</span>
              )
            ) : (
              <span className="text-slate-400">—</span>
            )}
            <button
              type="button"
              onClick={startEdit}
              aria-label={`Edit ${label}`}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-500 transition-opacity shrink-0"
            >
              <EditOutlined className="text-[11px]" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
