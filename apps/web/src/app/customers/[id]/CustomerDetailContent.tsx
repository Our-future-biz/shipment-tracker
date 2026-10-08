"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Spin } from "antd";
import { useCustomer } from "@/hooks/useCustomers";
import { CUSTOMER_DETAIL_TABS, CUSTOMER_TAB_ALIASES } from "../_lib/constants";
import { useCustomerListHref } from "../_lib/customerListHref";
import { CustomerHeader } from "./_components/CustomerHeader";
import { OverviewTab } from "./_tabs/OverviewTab";
import { ContactsTab } from "./_tabs/ContactsTab";
import { ShipmentsTab } from "./_tabs/ShipmentsTab";
import { QuotesTab } from "./_tabs/QuotesTab";
import { FinanceTab } from "./_tabs/FinanceTab";
import { DocumentsTab } from "./_tabs/DocumentsTab";
import { CommunicationTab } from "./_tabs/CommunicationTab";

const DEFAULT_TAB = "overview";

// The single page about a customer: one header, one tab strip, and every list exactly once.
export function CustomerDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { customer, isLoading, isLoadError, refetch } = useCustomer(id);
  const listHref = useCustomerListHref();

  // The active tab lives in the URL (?tab=) so it survives a reload and can be linked to.
  const rawTab = searchParams.get("tab") ?? DEFAULT_TAB;
  const tabKey = CUSTOMER_TAB_ALIASES[rawTab] ?? rawTab;
  const activeTab = CUSTOMER_DETAIL_TABS.some((t) => t.key === tabKey) ? tabKey : DEFAULT_TAB;

  const handleSelectTab = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    // A tab's own sub-view (?view=) must not follow the user into another tab or back into this one.
    params.delete("view");
    if (key === DEFAULT_TAB) params.delete("tab");
    else params.set("tab", key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }

  if (!customer && isLoadError) {
    return (
      <div className="p-10 text-center text-slate-500">
        Could not load the customer.{" "}
        <Button size="small" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-10 text-center text-slate-500">
        Customer not found.{" "}
        <Link href={listHref} className="text-indigo-500">
          Back to list
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-0">
        <CustomerHeader customer={customer} />

        <nav aria-label="Customer sections" className="flex gap-0 mt-4 overflow-x-auto">
          {CUSTOMER_DETAIL_TABS.map((tab) => {
            const selected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-current={selected ? "page" : undefined}
                onClick={() => handleSelectTab(tab.key)}
                className={`px-4 py-2.5 text-sm whitespace-nowrap cursor-pointer bg-transparent border-0 border-b-2 transition-all duration-150 ${
                  selected
                    ? "font-semibold text-indigo-500 border-indigo-500"
                    : "font-normal text-slate-400 border-transparent hover:text-slate-600"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === "overview" && <OverviewTab customerId={id} onSelectTab={handleSelectTab} />}
        {activeTab === "contacts" && <ContactsTab customerId={id} />}
        {activeTab === "shipments" && <ShipmentsTab customerId={id} />}
        {activeTab === "quotes" && <QuotesTab customerId={id} />}
        {activeTab === "finance" && <FinanceTab customerId={id} onSelectTab={handleSelectTab} />}
        {activeTab === "documents" && <DocumentsTab customerId={id} />}
        {activeTab === "communication" && <CommunicationTab customerId={id} />}
      </div>
    </div>
  );
}
