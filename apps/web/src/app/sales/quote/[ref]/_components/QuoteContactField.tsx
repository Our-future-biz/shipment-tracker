"use client";

import { useRef } from "react";
import { AutoComplete } from "antd";
import type { ContactItem } from "@/hooks/useCustomerContacts";
import { foldIncludes } from "@/lib/fold";
import { contactFields, namedContact } from "@/app/sales/_lib/quoteCustomer";
import type { SalesQuoteData } from "@/app/sales/_lib/types";

interface QuoteContactFieldProps {
  /** The quote's contact person as it stands. */
  name: string;
  /** The contact it is linked to; null or absent when typed by hand. */
  contactId?: string | null;
  /** The quote's e-mail and phone of the person, which a link made on leaving the field must keep. */
  email?: string;
  phone?: string;
  /** Whether the quote is linked to a customer of the Customer Database. */
  customerLinked: boolean;
  /** That customer's contacts (empty without one, or while they are read). */
  contacts: ContactItem[];
  /** The contact's keys of the quote as they are to change. */
  onChange: (patch: Partial<SalesQuoteData>) => void;
}

// The quote's contact person: one of the linked customer's contacts, picked from the list - the
// quote then keeps the contact's id and follows a rename - or a name typed by hand, which is no
// link. Typed text that is exactly one contact's name is linked when the field is left - only
// while the quote's e-mail and phone are empty or already the contact's, as linking writes the
// contact's over them (otherwise the page offers the link, QuoteWorkflow). The x takes the person
// off the quote with their e-mail and phone.
export function QuoteContactField({ name, contactId, email, phone, customerLinked, contacts, onChange }: QuoteContactFieldProps) {
  // The name the field held when it got the focus: a field left as it was links nothing, so an
  // Unlink just made stays.
  const focusedWith = useRef<string | null>(null);
  const linked = !!contactId;

  // Main contact first, then the rest in the order the Customer Database returns them.
  const options = [...contacts]
    .sort((a, b) => Number(b.isMain) - Number(a.isMain))
    .map((c) => ({
      value: c.id,
      search: `${c.name} ${c.email} ${c.phone}`,
      label: (
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-medium text-slate-800 truncate">{c.name || "(unnamed)"}</span>
          {c.role && <span className="text-[11px] text-slate-400 shrink-0">{c.role}</span>}
          <span className="ml-auto text-[11px] text-slate-400 truncate">{c.email || c.phone}</span>
        </div>
      ),
    }));

  return (
    <AutoComplete
      size="small"
      className="w-full"
      aria-label="Contact person"
      value={name}
      options={options}
      // A linked contact shows the whole list to pick another; typed text narrows it.
      filterOption={(input, option) => linked || foldIncludes(option?.search ?? "", input)}
      placeholder={customerLinked ? "Pick a contact or type a name" : undefined}
      notFoundContent={null}
      allowClear
      onFocus={() => {
        focusedWith.current = name;
      }}
      // A pick hands over the contact's id; anything else is typed text.
      onChange={(value?: string) => {
        const picked = contacts.find((c) => c.id === value);
        onChange(picked ? contactFields(picked) : { customerContact: value ?? "", customerContactId: null });
      }}
      onClear={() => onChange({ customerContactId: null, customerContact: undefined, customerEmail: undefined, customerPhone: undefined })}
      onBlur={() => {
        const before = focusedWith.current;
        focusedWith.current = null;
        if (linked || before === name) return;
        const named = namedContact(contacts, { customerContact: name, customerEmail: email, customerPhone: phone });
        if (named?.keepsDetails) onChange(contactFields(named.contact));
      }}
    />
  );
}
