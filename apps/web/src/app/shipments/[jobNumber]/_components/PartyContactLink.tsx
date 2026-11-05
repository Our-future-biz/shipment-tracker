"use client";

import { useState } from "react";
import { Modal, Spin } from "antd";
import { findContact, useCustomerContacts } from "@/hooks/useCustomerContacts";
import { FadeText } from "@/components/FadeText";
import { useSingleOrDouble } from "@/components/EditableLink";
import { EMPTY, HINT, LINK, TD, TH } from "@/styles/ui";

const CELL = `${TD} whitespace-nowrap`;
const DASH = <span className={EMPTY}>—</span>;

// The contact person of a shipment party (Shipper / Consignee), shown as a link. Clicking it
// opens the whole contact as saved on that party's customer record: role, e-mail, phone.
// It is only a preview: nothing leads away to the customer database.
// The contact is found among the customer's contacts by the id the shipment keeps, else (a contact
// typed or stored before ids were kept) by its name; the preview shows its current name.
// With `onEdit`, a double click changes the contact instead (a click still opens the preview).
export function PartyContactLink({
  name,
  contactId,
  customerId,
  onEdit,
}: {
  name: string;
  contactId?: string | null;
  customerId: string;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const clicks = useSingleOrDouble({ onSingle: () => setOpen(true), onDouble: () => onEdit?.() });

  // Loaded only once the preview opens ("" keeps the query off).
  const { contacts, isLoading, isError } = useCustomerContacts(open ? customerId : "");
  const contact = findContact(contacts, contactId, name);

  return (
    <>
      <button
        type="button"
        onClick={onEdit ? clicks.onClick : () => setOpen(true)}
        onDoubleClick={onEdit ? clicks.onDoubleClick : undefined}
        onKeyDown={onEdit ? clicks.onKeyDown : undefined}
        className={`${LINK} min-w-0 max-w-full bg-transparent border-0 p-0 cursor-pointer text-left`}
      >
        <FadeText>{name}</FadeText>
      </button>
      <Modal open={open} onCancel={() => setOpen(false)} footer={null} title="Contact" width={680} centered destroyOnHidden>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spin />
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Name", "Role", "E-mail", "Phone"].map((h) => (
                      <th key={h} className={TH}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={CELL}>{contact?.name || name}</td>
                    <td className={CELL}>{contact?.role || DASH}</td>
                    <td className={CELL}>
                      {contact?.email ? (
                        <a href={`mailto:${contact.email}`} className={LINK}>
                          {contact.email}
                        </a>
                      ) : (
                        DASH
                      )}
                    </td>
                    <td className={CELL}>
                      {contact?.phone ? (
                        <a href={`tel:${contact.phone.replace(/\s+/g, "")}`} className={LINK}>
                          {contact.phone}
                        </a>
                      ) : (
                        DASH
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {isError ? (
              <p className="mt-3 mb-0 text-[12px] text-red-600">
                The customer&apos;s contacts could not be loaded, so only the name is shown.
              </p>
            ) : !contact && (
              <p className={`mt-3 mb-0 ${HINT}`}>
                This contact is not saved among the customer&apos;s contacts, so only the name is known.
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
