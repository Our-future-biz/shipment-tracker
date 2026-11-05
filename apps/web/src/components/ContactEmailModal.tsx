"use client";

import { useState } from "react";
import { Button, Checkbox, Modal } from "antd";
import type { ContactItem } from "@/hooks/useCustomerContacts";
import { canBeCopied } from "@/app/shipments/_lib/shipmentEmail";
import { mailtoLink } from "@/lib/mailto";
import { EMPTY, HINT } from "@/styles/ui";

interface ContactEmailModalProps {
  /** The contact whose e-mail was clicked: the email goes to them. */
  contact: ContactItem;
  /** The customer's other contacts, to tick for copying in. */
  others: ContactItem[];
  subject?: string;
  onClose: () => void;
}

const fullName = (c: ContactItem) => [c.firstName, c.lastName].filter(Boolean).join(" ") || c.name;

// Asked before an email to one of a customer's contacts, when the customer has others: who else to
// copy in. The email itself is written in the user's own email program.
export function ContactEmailModal({ contact, others, subject, onClose }: ContactEmailModalProps) {
  const [picked, setPicked] = useState<string[]>([]);
  const cc = others
    .filter((c) => picked.includes(c.id))
    .map((c) => c.email)
    .join(",");
  const toggle = (id: string, on: boolean) => setPicked((ids) => (on ? [...ids, id] : ids.filter((other) => other !== id)));

  return (
    <Modal
      open
      centered
      width={480}
      title="Add more contacts?"
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        // A real link, opened in a new tab as on the Quote's Email dialog: an email program takes it
        // over from there, and webmail opens beside the shipment. The dialog closes only after the
        // click: a link taken off the page while it is being clicked does not open.
        <Button key="write" type="primary" href={mailtoLink({ to: contact.email, cc, subject })} target="_blank" rel="noreferrer" onClick={() => setTimeout(onClose, 0)}>
          Write email
        </Button>,
      ]}
    >
      <dl className="m-0 grid grid-cols-[64px_1fr] gap-y-1 text-[13px]">
        <dt className={HINT}>To</dt>
        <dd className="m-0 min-w-0 truncate text-slate-900">
          {fullName(contact)} &lt;{contact.email}&gt;
        </dd>
        {subject && (
          <>
            <dt className={HINT}>Subject</dt>
            <dd className="m-0 min-w-0 truncate text-slate-900">{subject}</dd>
          </>
        )}
      </dl>
      <p className={`mt-4 mb-2 ${HINT}`}>Tick anyone else at this customer to put them in copy (CC).</p>
      <ul className="m-0 flex max-h-[280px] list-none flex-col overflow-y-auto rounded-lg border border-slate-200 p-0">
        {others.map((c) => {
          const copyable = canBeCopied(c, contact);
          return (
            <li key={c.id} className="border-b border-slate-100 px-3 py-2 last:border-b-0">
              <Checkbox disabled={!copyable} checked={picked.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)}>
                <span className="text-[13px] font-medium text-slate-900">{fullName(c)}</span>
                {c.role && <span className={`ml-2 ${HINT}`}>{c.role}</span>}
                <span className="block text-[12px]">{c.email.trim() ? <span className="text-slate-500">{c.email}</span> : <span className={EMPTY}>No e-mail saved</span>}</span>
              </Checkbox>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
