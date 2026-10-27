"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Spin } from "antd";
import { useCustomer } from "@/hooks/useCustomers";
import { flagOf } from "@/lib/countries";
import { CustomerAccountTypeBadge } from "@/app/customers/_components/CustomerAccountTypeBadge";
import { HoverCard } from "./HoverCard";

interface CustomerHoverCardProps {
  /** The customer (Customer Database id). */
  customerId: string;
  children: ReactNode;
}

// A small card of a customer for a quick look while working on a job (name, account type,
// address, sales owner, payment terms) that appears when the pointer
// rests on its name for a moment, like the contact card of Customer's PIC. Loaded only then.
export function CustomerHoverCard({ customerId, children }: CustomerHoverCardProps) {
  const [opened, setOpened] = useState(false);
  const { customer, isLoading } = useCustomer(opened ? customerId : null);

  const content =
    isLoading || !customer ? (
      <div className="flex justify-center px-6 py-3">{isLoading ? <Spin size="small" /> : <span className="text-xs text-slate-400">Not found</span>}</div>
    ) : (
      // As wide as its content (a long address stays on one line), between 280 and 480px.
      <div className="w-max min-w-[280px] max-w-[480px]">
        {/* The country sits in the top right corner, beside the name. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-[13px] font-semibold text-slate-800">{customer.companyName}</div>
          {customer.country && (
            <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">
              {flagOf(customer.country)} {customer.country}
            </span>
          )}
        </div>
        {/* Who they are to us at a glance: the account type, as in the Customer Database. */}
        {customer.label && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <CustomerAccountTypeBadge label={customer.label} />
          </div>
        )}
        <dl className="mt-2.5 mb-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2.5 text-xs">
          <dt className="text-slate-500">Address</dt>
          <dd className="m-0 text-slate-800">
            {customer.registeredAddress || customer.city || <span className="text-slate-300">—</span>}
          </dd>
          <dt className="text-slate-500">Sales Owner</dt>
          <dd className="m-0 text-slate-800 break-all">{customer.salesOwner || <span className="text-slate-300">—</span>}</dd>
          <dt className="text-slate-500">Payment Terms</dt>
          <dd className="m-0 text-slate-800">{customer.paymentTerms || <span className="text-slate-300">—</span>}</dd>
        </dl>
      </div>
    );

  return (
    <HoverCard content={content} onOpen={() => setOpened(true)}>
      {children}
    </HoverCard>
  );
}
