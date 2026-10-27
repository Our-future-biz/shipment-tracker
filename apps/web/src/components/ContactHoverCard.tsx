"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Spin } from "antd";
import { MailOutlined, PhoneOutlined } from "@ant-design/icons";
import { findContact, useCustomerContacts } from "@/hooks/useCustomerContacts";
import { HoverCard } from "./HoverCard";

interface ContactHoverCardProps {
  /** The contact's name as the shipment stores it. */
  name: string;
  /** The contact's id as the shipment stores it; without one the contact is found by name. */
  contactId?: string | null;
  /** The customer whose saved contacts it is looked up in. */
  customerId: string;
  children: ReactNode;
}

// A small card of a customer's contact (name, position, e-mail, phone) that appears when the
// pointer rests on the name for a moment. The contacts load only then, not for every grid row.
export function ContactHoverCard({ name, contactId, customerId, children }: ContactHoverCardProps) {
  const [opened, setOpened] = useState(false);
  const { contacts, isLoading } = useCustomerContacts(opened ? customerId : "");
  const contact = findContact(contacts, contactId, name);
  const fullName = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.name : name;

  const content = isLoading ? (
    <div className="flex justify-center px-6 py-3">
      <Spin size="small" />
    </div>
  ) : (
    <div className="w-[240px]">
      <div className="text-[13px] font-semibold text-slate-800 truncate">{fullName}</div>
      {contact?.role && <div className="mt-0.5 text-[11px] text-slate-500">{contact.role}</div>}
      {contact ? (
        <div className="mt-2.5 flex flex-col gap-1.5 border-t border-slate-100 pt-2.5 text-xs">
          <ContactLine icon={<MailOutlined />} value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
          <ContactLine icon={<PhoneOutlined />} value={contact.phone} href={contact.phone ? `tel:${contact.phone.replace(/\s+/g, "")}` : undefined} />
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-amber-600">Not saved among the customer&apos;s contacts.</div>
      )}
    </div>
  );

  return (
    <HoverCard content={content} onOpen={() => setOpened(true)}>
      {children}
    </HoverCard>
  );
}

function ContactLine({ icon, value, href }: { icon: ReactNode; value: string; href?: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-slate-400 text-[12px] shrink-0">{icon}</span>
      {value && href ? (
        <a href={href} className="!text-indigo-600 hover:underline truncate" onClick={(e) => e.stopPropagation()}>
          {value}
        </a>
      ) : (
        <span className="text-slate-300">—</span>
      )}
    </div>
  );
}
