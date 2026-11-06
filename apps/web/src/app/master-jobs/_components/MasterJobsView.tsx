"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { RecordTabs } from "@/components/RecordTabs";
import { BTN, MODAL_TITLE, PAGE_SUBTITLE, REF } from "@/styles/ui";
import { useCreateMasterJob, useMasterJob, useMasterJobs } from "@/hooks/useMasterJobs";
import { MasterJobsList } from "./MasterJobsList";
import { MblDetailsTab } from "./MblDetailsTab";
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

  const { masterJobs, isLoading } = useMasterJobs();
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

  const backToList = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("open");
    const qs = params.toString();
    router.push(qs ? `/master-jobs?${qs}` : "/master-jobs");
  };

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

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto">
        {openId ? (
          <div>
            <div className="flex items-center gap-3.5 mb-4">
              <button type="button" onClick={backToList} className={BTN}>
                <ArrowLeftOutlined /> Master Jobs
              </button>
              {mj && <h1 className={`${MODAL_TITLE} ${REF}`}>{mj.mczNumber}</h1>}
              {mj?.masterBolNumber && (
                <span className={PAGE_SUBTITLE}>MBL {mj.masterBolNumber}</span>
              )}
            </div>
            {mj && (
              <RecordTabs
                tabs={DETAIL_TABS}
                active={detailTab}
                onChange={(key) => setDetailTab(key as DetailTab)}
                label="Master job sections"
                className="mb-4 border-b border-slate-200"
              />
            )}
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
        ) : (
          <MasterJobsList
            masterJobs={masterJobs}
            isLoading={isLoading}
            creating={createMasterJob.isPending}
            onCreate={handleCreate}
          />
        )}
      </div>
    </div>
  );
}
