"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Drawer } from "antd";
import { useHauliers, useTariffs } from "@/hooks/useTrucking";
import { useConsignments, useTrips } from "@/hooks/useTruckingConsignments";
import { TRUCKING_TABS, tabSearch, type TruckingTab } from "../_lib/tabs";
import { tripsNotConfirmed } from "../_lib/trips";
import { TruckingConsignmentsTab } from "./TruckingConsignmentsTab";
import { TruckingHaulierInvoicesTab } from "./TruckingHaulierInvoicesTab";
import { TruckingHauliersTab } from "./TruckingHauliersTab";
import { TruckingInternalBillingTab } from "./TruckingInternalBillingTab";
import { TruckingPlanningTab } from "./TruckingPlanningTab";
import { TruckingRateCalculatorTab } from "./TruckingRateCalculatorTab";
import { TruckingReadme } from "./TruckingReadme";
import { TruckingReportsTab } from "./TruckingReportsTab";
import { TruckingTabs } from "./TruckingTabs";
import { TruckingTariffsTab } from "./TruckingTariffsTab";
import { TruckingTripsTab } from "./TruckingTripsTab";

// The Trucking module: tabs in work order (?tab=, the first tab keeps the address clean), the work
// queues counted on their tabs, and the Read me in the "?" help drawer.
export const TruckingView = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = TRUCKING_TABS.find((t) => t.key === tabParam) ?? TRUCKING_TABS[0];
  const [helpOpen, setHelpOpen] = useState(false);
  const { hauliers, isLoading: hauliersLoading } = useHauliers();
  const { tariffs, isLoading: tariffsLoading } = useTariffs();
  // Work queues count what waits: consignments that need attention, trips ordered but not confirmed.
  const { counts: consignmentCounts } = useConsignments();
  const { trips, isLoading: tripsLoading } = useTrips();
  const tabCounts: Partial<Record<TruckingTab, number>> = {
    ...(consignmentCounts ? { consignments: consignmentCounts.attention } : {}),
    ...(tripsLoading ? {} : { trips: tripsNotConfirmed(trips) }),
    ...(hauliersLoading ? {} : { hauliers: hauliers.length }),
    ...(tariffsLoading ? {} : { tariffs: tariffs.length }),
  };

  const handleTabChange = (tab: TruckingTab) => {
    const qs = tabSearch(searchParams.toString(), tab);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Trucking</h1>
          <TruckingTabs
            active={activeTab.key}
            counts={tabCounts}
            queues={{ consignments: "need attention", trips: "ordered, not confirmed" }}
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
        {activeTab.key === "reports" && <TruckingReportsTab />}
      </div>
      <Drawer title="Read me" width={760} open={helpOpen} onClose={() => setHelpOpen(false)}>
        <TruckingReadme />
      </Drawer>
    </div>
  );
};
