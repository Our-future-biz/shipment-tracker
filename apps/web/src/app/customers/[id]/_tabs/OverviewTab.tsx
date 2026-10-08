"use client";

import { useCustomer } from "@/hooks/useCustomers";
import { CustomerBanners } from "../_components/CustomerBanners";
import { CustomerCompanyAnalysisCard } from "../_components/CustomerCompanyAnalysisCard";
import { CustomerCrmCard } from "../_components/CustomerCrmCard";
import { CustomerLastInteractionCard } from "../_components/CustomerLastInteractionCard";
import { CustomerNextStepsCard } from "../_components/CustomerNextStepsCard";
import { CustomerRegistryCard } from "../_components/CustomerRegistryCard";

interface OverviewTabProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// Who the customer is: the analysis and what to do next in the main column, the CRM editor and the registry
// data in the side column. Totals live in the header and every list in its own tab, so none is repeated here.
export function OverviewTab({ customerId, onSelectTab }: OverviewTabProps) {
  const { customer } = useCustomer(customerId);

  if (!customer) return null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
      <div className="space-y-5 min-w-0">
        <CustomerBanners customer={customer} />
        <CustomerCompanyAnalysisCard customer={customer} />
        {/* "Next steps" hides itself when everything is done; "Last interaction" then takes the whole row. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start lg:[&>*:only-child]:col-span-2">
          <CustomerNextStepsCard customer={customer} onSelectTab={onSelectTab} />
          <CustomerLastInteractionCard customerId={customerId} onSelectTab={onSelectTab} />
        </div>
      </div>

      <div className="space-y-5">
        {/* Keyed so an edit still being saved never carries over to another customer. */}
        <CustomerCrmCard key={customer.id} customer={customer} />
        <CustomerRegistryCard customer={customer} />
      </div>
    </div>
  );
}
