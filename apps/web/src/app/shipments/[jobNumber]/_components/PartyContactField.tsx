"use client";

import { useRef, useState } from "react";
import { AutoComplete } from "antd";
import { PartyContactLink } from "./PartyContactLink";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import { FadeText } from "@/components/FadeText";

interface PartyContactFieldProps {
  label: string;
  fieldKey: string;
  value: string;
  // CRM customer this party is linked to; without it there are no saved
  // contacts to offer and the field stays free text.
  customerId?: string | null;
  onCommit: (fieldKey: string, value: string) => void;
}

// The Contact row under Shipper / Consignee. Clicking it opens the contacts
// saved on that party's customer record, so the person can be picked instead of
// typed. Anything typed by hand is still kept — a contact that isn't in the CRM
// is perfectly valid.
export function PartyContactField({ label, fieldKey, value, customerId, onCommit }: PartyContactFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const justSelected = useRef(false);

  // Loaded only once the field is being edited ("" keeps the query off).
  const { contacts } = useCustomerContacts(editing && customerId ? customerId : "");

  // Main contact first, then the rest in the order the CRM returns them.
  const options = [...contacts]
    .sort((a, b) => Number(b.isMain) - Number(a.isMain))
    .map((c) => ({
      key: c.id,
      value: c.name,
      label: (
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-slate-800">{c.name || "(unnamed)"}</span>
          {c.role && <span className="text-[11px] text-slate-400">{c.role}</span>}
          <span className="ml-auto text-[11px] text-slate-400 truncate">{c.email || c.phone}</span>
        </div>
      ),
    }));

  const startEdit = () => {
    setDraft(value);
    justSelected.current = false;
    setEditing(true);
  };

  const commit = (next: string) => {
    setEditing(false);
    if (next !== value) onCommit(fieldKey, next);
  };

  const commitDraft = () => {
    if (justSelected.current) {
      justSelected.current = false;
      setEditing(false);
      return;
    }
    commit(draft.trim());
  };

  return (
    <div className="flex gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0">
      <span className="w-[140px] shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
      <div className="flex-1 min-w-0">
        {editing ? (
          <AutoComplete
            autoFocus
            defaultOpen
            size="small"
            className="w-full"
            value={draft}
            options={options}
            filterOption={(input, option) =>
              String(option?.value ?? "").toLowerCase().includes(input.toLowerCase())
            }
            placeholder={customerId ? "Pick a saved contact or type one…" : "Type a contact…"}
            notFoundContent={
              customerId ? "No contacts saved for this customer" : "Link this party to a customer to see its contacts"
            }
            onChange={(v) => setDraft(v ?? "")}
            onSelect={(v) => {
              justSelected.current = true;
              commit(v);
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDraft();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : value && customerId ? (
          // A contact of a linked party: a click opens the whole contact (role, e-mail, phone),
          // a double click anywhere on the row changes it, like on the party's own row.
          <div
            className="flex items-center gap-1.5 cursor-pointer rounded px-1 -mx-1 hover:bg-slate-100 transition-colors"
            onDoubleClick={startEdit}
          >
            <PartyContactLink name={value} customerId={customerId} onEdit={startEdit} />
          </div>
        ) : (
          <span
            className="cursor-pointer rounded px-1 -mx-1 hover:bg-slate-100 transition-colors block"
            title={value ? undefined : "Double-click to pick a saved contact"}
            onDoubleClick={startEdit}
          >
            {value ? (
              <FadeText className="text-slate-900 font-medium" title="Double-click to pick a saved contact">
                {value}
              </FadeText>
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
