"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Spin } from "antd";
import { RecordTabs } from "@/components/RecordTabs";
import { useCustomer } from "@/hooks/useCustomers";
import { CUSTOMER_DETAIL_TABS, CUSTOMER_TAB_ALIASES } from "../_lib/constants";
import { useCustomerListHref } from "../_lib/customerListHref";
import { CustomerHeader } from "./_components/CustomerHeader";
import { OverviewTab } from "./_tabs/OverviewTab";
import { AddressesTab } from "./_tabs/AddressesTab";
import { ContactsTab } from "./_tabs/ContactsTab";
import { SitesTab } from "./_tabs/SitesTab";
import { ShipmentsTab } from "./_tabs/ShipmentsTab";
import { QuotesTab } from "./_tabs/QuotesTab";
import { TruckingTab } from "./_tabs/TruckingTab";
import { FinanceTab } from "./_tabs/FinanceTab";
import { DocumentsTab } from "./_tabs/DocumentsTab";
import { CommunicationTab } from "./_tabs/CommunicationTab";
import { useCanSeeConcepts } from "@/lib/auth/AuthContext";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import { isSupplierOnly } from "../_lib/supplierStatus";
import { CustomerHaulierInvoicesCard } from "./_components/CustomerHaulierInvoicesCard";

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
  // The Trucking tab only while the company has the Trucking Concept (Platform → Companies).
  const canSeeConcepts = useCanSeeConcepts();
  // A supplier only: what it owes us (sales invoices) still shows; what we owe a haulier is Trucking's, a concept.
  const { invoices } = useCustomerInvoices(id);
  const supplierOnly = !!customer && isSupplierOnly(customer.roles);
  const owedByHaulier = supplierOnly && !!customer?.roles.includes("haulier") && canSeeConcepts;
  const hasSalesInvoices = invoices.length > 0;
  // Trucking and its loading/unloading Sites belong to Trucking Concept (superadmins only). A supplier only is
  // nobody's customer: no Shipments or Quotes of its own, and Finance only when there is money to show.
  const detailTabs = CUSTOMER_DETAIL_TABS.filter((t) => {
    if (!canSeeConcepts && (t.key === "trucking" || t.key === "sites")) return false;
    if (!supplierOnly) return true;
    if (t.key === "shipments" || t.key === "quotes") return false;
    if (t.key === "finance") return owedByHaulier || hasSalesInvoices;
    return true;
  });
  const activeTab = detailTabs.some((t) => t.key === tabKey) ? tabKey : DEFAULT_TAB;

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

        <RecordTabs label="Customer sections" tabs={detailTabs} active={activeTab} onChange={handleSelectTab} className="mt-4" />
      </div>

      <div className="p-6">
        {activeTab === "overview" && <OverviewTab customerId={id} onSelectTab={handleSelectTab} />}
        {activeTab === "contacts" && <ContactsTab customerId={id} country={customer.country} />}
        {activeTab === "sites" && <SitesTab customerId={id} />}
        {activeTab === "addresses" && <AddressesTab customerId={id} />}
        {activeTab === "shipments" && <ShipmentsTab customerId={id} />}
        {activeTab === "quotes" && <QuotesTab customerId={id} />}
        {activeTab === "trucking" && <TruckingTab customerId={id} />}
        {activeTab === "finance" && (
          <div className="space-y-5">
            {owedByHaulier && <CustomerHaulierInvoicesCard customerId={id} />}
            {(!supplierOnly || hasSalesInvoices) && <FinanceTab customerId={id} onSelectTab={handleSelectTab} />}
          </div>
        )}
        {activeTab === "documents" && <DocumentsTab customerId={id} />}
        {activeTab === "communication" && <CommunicationTab customerId={id} />}
      </div>
    </div>
  );
}
