"use client";

import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Spin } from "antd";
import { MailOutlined, PhoneOutlined } from "@ant-design/icons";
import { canBeCopied, otherContacts } from "@/app/shipments/_lib/shipmentEmail";
import { findContact, useCustomerContacts } from "@/hooks/useCustomerContacts";
import { mailtoLink } from "@/lib/mailto";
import { ContactEmailModal } from "./ContactEmailModal";
import { HoverCard } from "./HoverCard";
import { EMPTY, LINK } from "@/styles/ui";

interface ContactHoverCardProps {
  /** The contact's name as the shipment stores it. */
  name: string;
  /** The contact's id as the shipment stores it; without one the contact is found by name. */
  contactId?: string | null;
  /** The customer whose saved contacts it is looked up in. */
  customerId: string;
  /** The subject of an email started from the card. */
  emailSubject?: string;
  children: ReactNode;
}

// A small card of a customer's contact (name, position, e-mail, phone) that appears when the
// pointer rests on the name for a moment. The contacts load only then, not for every grid row.
// Its e-mail starts an email with `emailSubject`, first asking who else to copy in when the customer
// has another contact with an address of its own (ContactEmailModal).
export function ContactHoverCard({ name, contactId, customerId, emailSubject, children }: ContactHoverCardProps) {
  const [opened, setOpened] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [choosingCopies, setChoosingCopies] = useState(false);
  const { contacts, isLoading } = useCustomerContacts(opened ? customerId : "");
  const contact = findContact(contacts, contactId, name);
  const fullName = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.name : name;
  const others = contact ? otherContacts(contacts, contact) : [];

  // The card would stay above the dialog (and with the pointer gone from it, stay open): it closes.
  const askWhoToCopy = (e: MouseEvent) => {
    if (!contact || !others.some((c) => canBeCopied(c, contact))) return;
    e.preventDefault();
    setCardOpen(false);
    setChoosingCopies(true);
  };

  const content = isLoading ? (
    <div className="flex justify-center px-6 py-3">
      <Spin size="small" />
    </div>
  ) : (
    <div className="w-[240px]">
      <div className="text-[13px] font-semibold text-slate-900 truncate">{fullName}</div>
      {contact?.role && <div className="mt-0.5 text-[11px] text-slate-500">{contact.role}</div>}
      {contact ? (
        <div className="mt-2.5 flex flex-col gap-1.5 border-t border-slate-100 pt-2.5 text-xs">
          <ContactLine
            icon={<MailOutlined />}
            value={contact.email}
            href={contact.email ? mailtoLink({ to: contact.email, subject: emailSubject }) : undefined}
            onClick={askWhoToCopy}
          />
          <ContactLine icon={<PhoneOutlined />} value={contact.phone} href={contact.phone ? `tel:${contact.phone.replace(/\s+/g, "")}` : undefined} />
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-amber-700">Not saved among the customer&apos;s contacts.</div>
      )}
    </div>
  );

  return (
    <>
      <HoverCard content={content} onOpen={() => setOpened(true)} open={cardOpen} onOpenChange={setCardOpen}>
        {children}
      </HoverCard>
      {choosingCopies && contact && (
        // The dialog is a portal: clicks in it stay in it, or they would reach the cell around the name.
        <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <ContactEmailModal contact={contact} others={others} subject={emailSubject} onClose={() => setChoosingCopies(false)} />
        </span>
      )}
    </>
  );
}

function ContactLine({ icon, value, href, onClick }: { icon: ReactNode; value: string; href?: string; onClick?: (e: MouseEvent) => void }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-slate-400 text-[12px] shrink-0">{icon}</span>
      {value && href ? (
        <a
          href={href}
          className={`${LINK} truncate`}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.(e);
          }}
        >
          {value}
        </a>
      ) : (
        <span className={EMPTY}>—</span>
      )}
    </div>
  );
}
