"use client";

import { Tag } from "antd";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import { contactRoleColor } from "../../_lib/constants";
import { CustomerInfoRow } from "./CustomerInfoRow";

const TEXT_BUTTON_CLASS =
  "bg-transparent border-0 p-0 text-xs font-semibold text-indigo-600 whitespace-nowrap cursor-pointer hover:underline";

const LINK_CLASS = "min-w-0 text-indigo-600 hover:underline [overflow-wrap:anywhere]";

interface CustomerMainContactCardProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// Who to call or write to first, without opening the Contacts tab.
export function CustomerMainContactCard({ customerId, onSelectTab }: CustomerMainContactCardProps) {
  const { contacts, isLoading } = useCustomerContacts(customerId);
  // The first row of the Contacts tab: the contact flagged as main, otherwise the one added first.
  const contact = contacts.find((c) => c.isMain) ?? contacts[0];
  const phone = (contact?.phone ?? "").trim();
  const email = (contact?.email ?? "").trim();

  const handleOpenContacts = () => onSelectTab("contacts");

  return (
    <SectionCard
      title="Main contact"
      extra={
        <button type="button" onClick={handleOpenContacts} className={TEXT_BUTTON_CLASS}>
          All contacts
        </button>
      }
    >
      {contact ? (
        // A grid of one fact per row, with lines between them, as the CRM and Registry cards below.
        <div>
          <CustomerInfoRow label="Name" narrow>
            {contact.name}
            {!contact.isMain && (
              <span className="block text-[11px] font-normal text-slate-400" title="No contact is marked as main, so the first one is shown">
                Not marked as main
              </span>
            )}
          </CustomerInfoRow>
          <CustomerInfoRow label="Role" narrow>
            {contact.role && (
              <Tag color={contactRoleColor(contact.role)} className="!m-0">
                {contact.role}
              </Tag>
            )}
          </CustomerInfoRow>
          <CustomerInfoRow label="Phone" narrow>
            {/* A tel: address must not contain spaces; the number is still shown the way it was typed. */}
            {phone && (
              <a href={`tel:${phone.replace(/\s+/g, "")}`} className={LINK_CLASS}>
                {phone}
              </a>
            )}
          </CustomerInfoRow>
          <CustomerInfoRow label="Email" narrow>
            {email && (
              <a href={`mailto:${email}`} className={LINK_CLASS}>
                {email}
              </a>
            )}
          </CustomerInfoRow>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <span className="text-slate-400">{isLoading ? "Loading…" : "No contacts yet."}</span>
          {!isLoading && (
            <button type="button" onClick={handleOpenContacts} className={TEXT_BUTTON_CLASS}>
              Add a contact
            </button>
          )}
        </div>
      )}
    </SectionCard>
  );
}
