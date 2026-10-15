"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Drawer } from "antd";
import { useHauliers, useTariffs } from "@/hooks/useTrucking";
import { TRUCKING_TABS, type TruckingTab } from "../_lib/tabs";
import { TruckingConsignmentsTab } from "./TruckingConsignmentsTab";
import { TruckingEmptyTab } from "./TruckingEmptyTab";
import { TruckingHaulierInvoicesTab } from "./TruckingHaulierInvoicesTab";
import { TruckingHauliersTab } from "./TruckingHauliersTab";
import { TruckingInternalBillingTab } from "./TruckingInternalBillingTab";
import { TruckingPlanningTab } from "./TruckingPlanningTab";
import { TruckingRateCalculatorTab } from "./TruckingRateCalculatorTab";
import { TruckingReadme } from "./TruckingReadme";
import { TruckingTabs } from "./TruckingTabs";
import { TruckingTariffsTab } from "./TruckingTariffsTab";
import { TruckingTripsTab } from "./TruckingTripsTab";

const FIRST_TAB: TruckingTab = TRUCKING_TABS[0].key;

// The Trucking module: tabs in work order (?tab=, the first tab keeps the address clean) and the
// Read me in the "?" help drawer.
export const TruckingView = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = TRUCKING_TABS.find((t) => t.key === tabParam) ?? TRUCKING_TABS[0];
  const [helpOpen, setHelpOpen] = useState(false);
  const { hauliers, isLoading: hauliersLoading } = useHauliers();
  const { tariffs, isLoading: tariffsLoading } = useTariffs();

  const handleTabChange = (tab: TruckingTab) => {
    const params = new URLSearchParams(searchParams.toString());
    // A tab's own filters (?status=, ?view=, ?side=, ?kind=, ?month=) do not follow the user into another tab.
    params.delete("status");
    params.delete("month");
    params.delete("view");
    params.delete("side");
    params.delete("kind");
    if (tab === FIRST_TAB) params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Trucking</h1>
          {/* Counts only for the tabs whose phase is built. */}
          <TruckingTabs
            active={activeTab.key}
            counts={{ ...(hauliersLoading ? {} : { hauliers: hauliers.length }), ...(tariffsLoading ? {} : { tariffs: tariffs.length }) }}
            onChange={handleTabChange}
            onHelp={() => setHelpOpen(true)}
          />
        </div>
        {activeTab.key === "consignments" && <TruckingConsignmentsTab />}
        {activeTab.key === "planning" && <TruckingPlanningTab />}
        {activeTab.key === "trips" && <TruckingTripsTab />}
        {activeTab.key === "haulierInvoices" && <TruckingHaulierInvoicesTab />}
        {activeTab.key === "internalBilling" && <TruckingInternalBillingTab />}
        {activeTab.key === "hauliers" && <TruckingHauliersTab />}
        {activeTab.key === "tariffs" && <TruckingTariffsTab />}
        {activeTab.key === "calculator" && <TruckingRateCalculatorTab />}
        {!("live" in activeTab && activeTab.live) && <TruckingEmptyTab tab={activeTab} />}
      </div>
      <Drawer title="Read me" width={760} open={helpOpen} onClose={() => setHelpOpen(false)}>
        <TruckingReadme />
      </Drawer>
    </div>
  );
};
