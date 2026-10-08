"use client";

import { Tag } from "antd";
import { MailOutlined, PhoneOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import { CONTACT_ROLE_COLORS } from "../../_lib/constants";

const TEXT_BUTTON_CLASS =
  "bg-transparent border-0 p-0 text-xs font-semibold text-indigo-600 whitespace-nowrap cursor-pointer hover:underline";

const LINK_CLASS = "min-w-0 text-indigo-600 hover:underline [overflow-wrap:anywhere]";

// The colour sits on a wrapper: antd icons always take the text colour of their parent.
const ICON_CLASS = "flex shrink-0 mt-[3px] text-slate-400";

// Only letters have a different lower and upper case; digits and brackets do not.
const startsWithLetter = (word: string) => word.charAt(0).toLowerCase() !== word.charAt(0).toUpperCase();

// First letters of the first and the last name word; a one-word name gives its first two letters.
// Titles ("Ing.", and whatever follows a comma) and words that do not start with a letter ("(CEO)") are not part of the name.
function contactInitials(name: string): string {
  const [beforeComma = ""] = name.split(",");
  const all = beforeComma.trim().split(/\s+/).filter(Boolean);
  // A dotted word longer than an initial ("J.") is a title: "Ing.", "Mgr.", "Dr.".
  const nameWords = all.filter((word) => startsWithLetter(word) && !(word.length > 2 && word.endsWith(".")));
  // Names in a script without letter case would otherwise lose every word.
  const words = nameWords.length > 0 ? nameWords : all;
  const first = words[0] ?? "";
  const last = words[words.length - 1] ?? "";
  const letters = words.length > 1 ? first.charAt(0) + last.charAt(0) : first.slice(0, 2);
  return letters.toUpperCase() || "?";
}

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
        <div className="text-[13px]">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex shrink-0 items-center justify-center w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 text-[13px] font-bold"
            >
              {contactInitials(contact.name)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-slate-800 [overflow-wrap:anywhere]">{contact.name}</span>
                {contact.role && (
                  <Tag color={CONTACT_ROLE_COLORS[contact.role] ?? "default"} className="!m-0">
                    {contact.role}
                  </Tag>
                )}
              </div>
              {!contact.isMain && (
                <div className="mt-0.5 text-[11px] text-slate-400" title="No contact is marked as main, so the first one is shown">
                  Not marked as main
                </div>
              )}
            </div>
          </div>

          {phone || email ? (
            <ul className="mt-3 space-y-1.5">
              {phone && (
                <li className="flex items-start gap-2">
                  <span className={ICON_CLASS}>
                    <PhoneOutlined aria-hidden />
                  </span>
                  <span className="sr-only">Phone:</span>
                  {/* A tel: address must not contain spaces; the number is still shown the way it was typed. */}
                  <a href={`tel:${phone.replace(/\s+/g, "")}`} className={LINK_CLASS}>
                    {phone}
                  </a>
                </li>
              )}
              {email && (
                <li className="flex items-start gap-2">
                  <span className={ICON_CLASS}>
                    <MailOutlined aria-hidden />
                  </span>
                  <span className="sr-only">Email:</span>
                  <a href={`mailto:${email}`} className={LINK_CLASS}>
                    {email}
                  </a>
                </li>
              )}
            </ul>
          ) : (
            <p className="m-0 mt-3 text-slate-400">No phone or email on file</p>
          )}
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
