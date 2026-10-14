"use client";

import { useCustomer } from "@/hooks/useCustomers";
import { CustomerAttentionCard } from "../_components/CustomerAttentionCard";
import { CustomerCompanyAnalysisCard } from "../_components/CustomerCompanyAnalysisCard";
import { CustomerCreditSummaryCard } from "../_components/CustomerCreditSummaryCard";
import { CustomerCrmCard } from "../_components/CustomerCrmCard";
import { CustomerLastInteractionCard } from "../_components/CustomerLastInteractionCard";
import { CustomerMainContactCard } from "../_components/CustomerMainContactCard";
import { CustomerNextStepsCard } from "../_components/CustomerNextStepsCard";
import { CustomerRecentShipmentsCard } from "../_components/CustomerRecentShipmentsCard";
import { CustomerRegistryCard } from "../_components/CustomerRegistryCard";
import { CustomerSnapshotTiles } from "../_components/CustomerSnapshotTiles";

interface OverviewTabProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// The customer at a glance. Main column, most urgent first: what needs attention, the current state in
// four figures, the latest shipments and interaction, then who the company is. Side column: who to call,
// the credit position, and the CRM and registry records. The all-time totals stay in the header and every
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
        {/* "Next steps" hides itself when everything is done; "Last interaction" then takes the whole row. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start lg:[&>*:only-child]:col-span-2">
          <CustomerNextStepsCard customer={customer} onSelectTab={onSelectTab} />
          <CustomerLastInteractionCard customerId={customerId} onSelectTab={onSelectTab} />
        </div>
        <CustomerCompanyAnalysisCard customer={customer} />
      </div>

      <div className="space-y-5">
        <CustomerMainContactCard customerId={customerId} onSelectTab={onSelectTab} />
        <CustomerCreditSummaryCard customerId={customerId} onSelectTab={onSelectTab} />
        {/* Keyed so an edit still being saved never carries over to another customer. */}
        <CustomerCrmCard key={customer.id} customer={customer} />
        <CustomerRegistryCard customer={customer} />
      </div>
    </div>
  );
}
