"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SALES_TABS } from "../_lib/tabs";
import { DashboardTab } from "./DashboardTab";
import { QuoteHistoryTab } from "./QuoteHistoryTab";
import { FollowUpTab } from "./FollowUpTab";
import { PipelineTab } from "./PipelineTab";
import { SalesReportTab } from "./SalesReportTab";
import { ShipmentReportsTab } from "./ShipmentReportsTab";
import { TermsTab } from "./TermsTab";

export function SalesView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get("tab");
  const activeTab = SALES_TABS.some((t) => t.key === rawTab) ? (rawTab as string) : "dashboard";

  const goTab = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "dashboard") params.delete("tab");
    else params.set("tab", key);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1600px] mx-auto">
        <h1 className="text-xl font-bold text-slate-800 mb-4">Sales</h1>

        <div className="flex gap-0 mb-5 border-b border-slate-200 overflow-x-auto">
          {SALES_TABS.map((tab) => (
            <div
              key={tab.key}
              onClick={() => goTab(tab.key)}
              className={`px-4 py-2.5 text-sm cursor-pointer whitespace-nowrap transition-all duration-150 border-b-2 ${
                activeTab === tab.key
                  ? "font-semibold text-indigo-500 border-indigo-500"
                  : "font-normal text-slate-400 border-transparent hover:text-slate-600"
              }`}
            >
              {tab.label}
            </div>
          ))}
        </div>

        {activeTab === "dashboard" && <DashboardTab onNavigate={goTab} />}
        {activeTab === "quotes" && <QuoteHistoryTab />}
        {activeTab === "followup" && <FollowUpTab />}
        {activeTab === "pipeline" && <PipelineTab />}
        {activeTab === "report" && <SalesReportTab />}
        {activeTab === "shipments" && <ShipmentReportsTab />}
        {activeTab === "terms" && <TermsTab />}
      </div>
    </div>
  );
}
