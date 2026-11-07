"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Spin } from "antd";
import { CARD } from "@/styles/ui";
import { BackLink } from "@/components/BackLink";
import { useCreateMasterJob, useMasterJob, useMasterJobs } from "@/hooks/useMasterJobs";
import { MasterJobsList } from "./MasterJobsList";
import { MblDetailsTab } from "./MblDetailsTab";
import { MasterJobFacts } from "./MasterJobFacts";
import { jumpTo } from "./MasterJobFields";
import { MasterJobCostsTab } from "./MasterJobCostsTab";
import { MasterJobTrackingTab } from "./MasterJobTrackingTab";

// Tabs of an opened master job; more will follow.
const DETAIL_TABS = [
  { key: "mbl", label: "MBL Details" },
  { key: "costs", label: "Costs Breakdown" },
  { key: "tracking", label: "Tracking" },
] as const;

// Master Jobs in the same shape as Customs: a list, and a master job opened
// inside the page (?open=<id>) with its tabs. Back returns to the list exactly
// as it was left — only the opened master job leaves the URL.
export function MasterJobsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { message } = App.useApp();
  const openId = searchParams.get("open");

  const { masterJobs, isLoading, isError } = useMasterJobs();
  const createMasterJob = useCreateMasterJob();
  const detail = useMasterJob(openId);
  // Every master job opens on its first tab: the chosen tab belongs to the job it was picked on.
  type DetailTab = (typeof DETAIL_TABS)[number]["key"];
  const [tabPick, setTabPick] = useState<{ id: string | null; tab: DetailTab }>({ id: openId, tab: "mbl" });
  const detailTab: DetailTab = tabPick.id === openId ? tabPick.tab : "mbl";
  const setDetailTab = (tab: DetailTab) => setTabPick({ id: openId, tab });

  const openMasterJob = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("open", id);
    router.push(`/master-jobs?${params.toString()}`);
  };

  // Back to the list as it was left: its search and filters stay, only the opened master job goes.
  const listParams = new URLSearchParams(searchParams.toString());
  listParams.delete("open");
  const listQs = listParams.toString();
  const listHref = listQs ? `/master-jobs?${listQs}` : "/master-jobs";

  const handleCreate = async () => {
    try {
      const { masterJob } = await createMasterJob.mutateAsync();
      message.success(`${masterJob.mczNumber} created`);
      openMasterJob(masterJob.id);
    } catch {
      message.error("Creating the master job failed");
    }
  };

  const mj = detail.masterJob;

  // A count in the summary jumps to its card on MBL Details, opening that tab first when another is open.
  const jumpFromFacts = (target: string) => {
    if (detailTab === "mbl") {
      jumpTo(target);
      return;
    }
    setDetailTab("mbl");
    window.setTimeout(() => jumpTo(target), 60);
  };

  // An opened master job: the shipment detail page's shape - a white header band with the
  // actions row, the summary card and the tab strip, then the tab content.
  if (openId) {
    return (
      <div className="bg-slate-50 min-h-full">
        {/* ── Header ── */}
        <div className="bg-white border-b border-slate-200 px-4 md:px-6 pt-3.5 pb-0">
          {/* The way back is the app's back link; the row keeps the height of Shipment Details'
              action row, so the summary card sits where it does there. */}
          <div className="flex items-center justify-between gap-x-6 gap-y-2 flex-wrap min-h-8">
            <BackLink href={listHref}>Master Jobs</BackLink>
          </div>

          {mj && (
            <>
              {/* The master job at a glance - its number first - above the tabs, on every tab */}
              <div className={`${CARD} mt-3 px-5 pt-3 pb-2.5`}>
                <MasterJobFacts
                  masterJob={mj}
                  containers={detail.containers}
                  shipments={detail.shipments}
                  onJump={jumpFromFacts}
                />
              </div>

              {/* Tabs, in the shipment header's look */}
              <nav aria-label="Master job sections" className="flex gap-0 mt-3.5 -mb-px overflow-x-auto">
                {DETAIL_TABS.map((tab) => {
                  const selected = detailTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      aria-current={selected ? "page" : undefined}
                      onClick={() => setDetailTab(tab.key)}
                      className={`px-[9px] min-[1400px]:px-3.5 2xl:px-4 py-2.5 text-[13px] whitespace-nowrap cursor-pointer transition-colors bg-transparent border-0 border-b-2 ${
                        selected
                          ? "font-semibold text-indigo-600 border-indigo-600"
                          : "font-medium text-slate-500 border-transparent hover:text-slate-900"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </>
          )}
          {!mj && <div className="h-3.5" />}
        </div>

        {/* ── Tab content ── */}
        <div className="px-4 md:px-6 pt-4 pb-8">
          {mj ? (
            detailTab === "costs" ? (
              <MasterJobCostsTab masterJob={mj} />
            ) : detailTab === "tracking" ? (
              <MasterJobTrackingTab masterJobId={mj.id} />
            ) : (
              <MblDetailsTab
                masterJob={mj}
                containers={detail.containers}
                shipments={detail.shipments}
                onSave={(data) => detail.update.mutateAsync(data)}
                onSaveContainers={(containers) => detail.setContainers.mutateAsync(containers)}
                onLinkShipments={(ids) => detail.linkShipments.mutateAsync(ids)}
                onUnlinkShipment={(id) => detail.unlinkShipment.mutateAsync(id)}
              />
            )
          ) : detail.isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Spin />
            </div>
          ) : (
            <div className="px-3 py-7 text-center text-[13px] text-slate-400">Master job not found.</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto">
        <MasterJobsList
          masterJobs={masterJobs}
          isLoading={isLoading}
          isError={isError}
          creating={createMasterJob.isPending}
          onCreate={handleCreate}
        />
      </div>
    </div>
  );
}
