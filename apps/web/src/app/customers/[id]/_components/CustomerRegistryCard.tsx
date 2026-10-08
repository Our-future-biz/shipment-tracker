"use client";

import { SectionCard } from "@/components/SectionCard";
import type { CustomerItem } from "@/hooks/useCustomers";
import { formatDate } from "@/lib/date";
import { isDataStale, isRegistryActive, legalFormText, parseNaceCodes } from "../../_lib/companyAnalysis";
import { CustomerInfoRow } from "./CustomerInfoRow";

const MAX_NACE_CODES = 8;

interface CustomerRegistryCardProps {
  customer: CustomerItem;
}

// What the Czech business registry (ARES) returned when the customer was created. Read-only.
export function CustomerRegistryCard({ customer }: CustomerRegistryCardProps) {
  const legalForm = legalFormText(customer.legalForm);
  const naceCodes = parseNaceCodes(customer.nace);
  const naceText = naceCodes.slice(0, MAX_NACE_CODES).join(", ") + (naceCodes.length > MAX_NACE_CODES ? "…" : "");
  const lastUpdate = formatDate(customer.lastRegistryUpdate);
  const stale = isDataStale(customer.lastRegistryUpdate);

  return (
    <SectionCard title="Registry (ARES)">
      <CustomerInfoRow label="IČO" narrow>{customer.ico}</CustomerInfoRow>
      <CustomerInfoRow label="DIČ" narrow>{customer.dic}</CustomerInfoRow>
      <CustomerInfoRow label="Legal form" narrow>
        {customer.legalForm ? (
          <>
            {legalForm}
            {/* A known code follows its name in grey; an unknown code is already the whole value. */}
            {legalForm !== customer.legalForm && <span className="ml-1.5 font-normal text-slate-400">{customer.legalForm}</span>}
          </>
        ) : null}
      </CustomerInfoRow>
      <CustomerInfoRow label="Registry status" narrow>
        {isRegistryActive(customer.companyStatus) ? customer.companyStatus : <span className="text-red-600">{customer.companyStatus}</span>}
      </CustomerInfoRow>
      <CustomerInfoRow label="Registered address" narrow>{customer.registeredAddress}</CustomerInfoRow>
      <CustomerInfoRow label="City" narrow>{customer.city}</CustomerInfoRow>
      <CustomerInfoRow label="Country" narrow>{customer.country}</CustomerInfoRow>
      <CustomerInfoRow label="Registration date" narrow>{formatDate(customer.registrationDate)}</CustomerInfoRow>
      <CustomerInfoRow label="NACE codes" narrow>{naceText}</CustomerInfoRow>
      <CustomerInfoRow label="Data source" narrow>{customer.dataSource}</CustomerInfoRow>
      <CustomerInfoRow label="Last update" narrow>
        {lastUpdate && stale ? (
          <span className="text-amber-600" title="Registry data is more than 90 days old">
            {lastUpdate}
          </span>
        ) : (
          lastUpdate
        )}
      </CustomerInfoRow>
    </SectionCard>
  );
}
