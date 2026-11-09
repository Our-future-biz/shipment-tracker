"use client";

import { SectionCard } from "@/components/SectionCard";
import type { CustomerItem } from "@/hooks/useCustomers";
import { formatDate } from "@/lib/date";
import { isDataStale, legalFormText, parseNaceCodes } from "../../_lib/companyAnalysis";
import { CustomerInfoRow } from "./CustomerInfoRow";

const MAX_NACE_CODES = 8;

interface CustomerRegistryCardProps {
  customer: CustomerItem;
}

// What the Czech business registry (ARES) returned when the customer was created. Read-only.
export function CustomerRegistryCard({ customer }: CustomerRegistryCardProps) {
  const czech = customer.country === "CZ";
  const legalForm = legalFormText(customer.legalForm);
  const naceCodes = parseNaceCodes(customer.nace);
  const naceText = naceCodes.slice(0, MAX_NACE_CODES).join(", ") + (naceCodes.length > MAX_NACE_CODES ? "…" : "");
  const lastUpdate = formatDate(customer.lastRegistryUpdate);
  const stale = isDataStale(customer.lastRegistryUpdate);

  return (
    // Two columns where the card is wide enough, as Company analysis above it: the company on the left,
    // where it is and where the record comes from on the right. Narrower, they stack.
    <SectionCard title="Registry (ARES)" bodyClassName="p-4 @container">
      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-x-8">
        <div>
          {/* A foreign customer, typed in by hand, has its own country's registration number and VAT ID. */}
          <CustomerInfoRow label={czech ? "IČO" : "Registration number"}>{customer.ico}</CustomerInfoRow>
          <CustomerInfoRow label={czech ? "DIČ" : "VAT ID"}>{customer.dic}</CustomerInfoRow>
          <CustomerInfoRow label="Legal form">
            {customer.legalForm ? (
              <>
                {legalForm}
                {/* A known code follows its name in grey; an unknown code is already the whole value. */}
                {legalForm !== customer.legalForm && <span className="ml-1.5 font-normal text-slate-400">{customer.legalForm}</span>}
              </>
            ) : null}
          </CustomerInfoRow>
          <CustomerInfoRow label="Registration date">{formatDate(customer.registrationDate)}</CustomerInfoRow>
          <CustomerInfoRow label="NACE codes">
            {/* One line, cut with "…" where the column is narrow; every code on hover. */}
            {naceText && (
              <span className="block truncate" title={naceCodes.join(", ")}>
                {naceText}
              </span>
            )}
          </CustomerInfoRow>
        </div>

        <div className="border-t border-slate-100 @3xl:border-t-0">
          <CustomerInfoRow label="Registered address">{customer.registeredAddress}</CustomerInfoRow>
          <CustomerInfoRow label="City">{customer.city}</CustomerInfoRow>
          <CustomerInfoRow label="Country">{customer.country}</CustomerInfoRow>
          <CustomerInfoRow label="Data source">{customer.dataSource}</CustomerInfoRow>
          <CustomerInfoRow label="Last update">
            {lastUpdate && stale ? (
              <span className="text-amber-600" title="Registry data is more than 90 days old">
                {lastUpdate}
              </span>
            ) : (
              lastUpdate
            )}
          </CustomerInfoRow>
        </div>
      </div>
    </SectionCard>
  );
}
