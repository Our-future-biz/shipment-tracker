"use client";

import { useState } from "react";
import { Modal, Spin } from "antd";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const TH = "text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide px-2 py-1.5 border-b border-slate-200 whitespace-nowrap";
const TD = "px-2 py-2 text-xs text-slate-900 font-medium whitespace-nowrap";
const DASH = <span className="text-slate-300">—</span>;

// The contact person of a shipment party (Shipper / Consignee), shown as a link. Clicking it
// opens the whole contact as saved on that party's customer record: role, e-mail, phone.
// It is only a preview: nothing leads away to the customer database.
// The shipment keeps only the name, so the contact is found by it among the customer's contacts.
export function PartyContactLink({ name, customerId }: { name: string; customerId: string }) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["customer-contacts", customerId],
    queryFn: () => api.customers.contactList(customerId),
    enabled: open,
    staleTime: 60_000,
  });
  const contact = (data?.data ?? []).find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-indigo-600 hover:underline font-medium truncate bg-transparent border-0 p-0 cursor-pointer text-left"
      >
        {name}
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
                    <td className={TD}>{name}</td>
                    <td className={TD}>{contact?.role || DASH}</td>
                    <td className={TD}>
                      {contact?.email ? (
                        <a href={`mailto:${contact.email}`} className="!text-indigo-600 hover:underline">
                          {contact.email}
                        </a>
                      ) : (
                        DASH
                      )}
                    </td>
                    <td className={TD}>
                      {contact?.phone ? (
                        <a href={`tel:${contact.phone.replace(/\s+/g, "")}`} className="!text-indigo-600 hover:underline">
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
              <p className="mt-3 mb-0 text-xs text-red-600">
                The customer&apos;s contacts could not be loaded, so only the name is shown.
              </p>
            ) : !contact && (
              <p className="mt-3 mb-0 text-xs text-slate-500">
                This contact is not saved among the customer&apos;s contacts, so only the name is known.
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
