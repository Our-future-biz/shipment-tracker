"use client";

import { useCustomer } from "@/hooks/useCustomers";
import { CustomerAttentionCard } from "../_components/CustomerAttentionCard";
import { CustomerCompanyAnalysisCard } from "../_components/CustomerCompanyAnalysisCard";
import { CustomerCreditSummaryCard } from "../_components/CustomerCreditSummaryCard";
import { CustomerCrmCard } from "../_components/CustomerCrmCard";
import { CustomerHaulierCard } from "../_components/CustomerHaulierCard";
import { CustomerMainContactCard } from "../_components/CustomerMainContactCard";
import { CustomerRecentShipmentsCard } from "../_components/CustomerRecentShipmentsCard";
import { CustomerRegistryCard } from "../_components/CustomerRegistryCard";
import { CustomerSnapshotTiles } from "../_components/CustomerSnapshotTiles";

interface OverviewTabProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// The customer at a glance. Main column, most urgent first: what needs attention, the current state in
// four figures, the latest shipments, then who the company is and its registry record. Side
// column: who to call, a haulier's Trucking status, the credit position, and the CRM record. The all-time totals stay in the header and every
// full list in its own tab; the cards here are summaries that lead there.
export function OverviewTab({ customerId, onSelectTab }: OverviewTabProps) {
  const { customer } = useCustomer(customerId);

  if (!customer) return null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
      <div className="space-y-5 min-w-0">
        <CustomerAttentionCard customerId={customerId} onSelectTab={onSelectTab} />
        <CustomerSnapshotTiles customerId={customerId} onSelectTab={onSelectTab} />
        <CustomerRecentShipmentsCard customerId={customerId} onSelectTab={onSelectTab} />
        {/* Keyed: a pending edit of one customer must not carry over to the next one opened. */}
        <CustomerCompanyAnalysisCard key={customer.id} customer={customer} />
        <CustomerRegistryCard customer={customer} />
      </div>

      <div className="space-y-5">
        <CustomerMainContactCard customerId={customerId} onSelectTab={onSelectTab} />
        {/* Only for a company we subcontract trucking to; its profile lives in Trucking. */}
        {customer.roles.includes("haulier") && <CustomerHaulierCard customerId={customerId} />}
        <CustomerCreditSummaryCard customerId={customerId} onSelectTab={onSelectTab} />
        {/* Keyed so an edit still being saved never carries over to another customer. */}
        <CustomerCrmCard key={customer.id} customer={customer} />
      </div>
    </div>
  );
}
