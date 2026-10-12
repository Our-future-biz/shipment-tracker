"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useCreateMasterJob, useMasterJob, useMasterJobs } from "@/hooks/useMasterJobs";
import { MasterJobsList } from "./MasterJobsList";
import { MblDetailsTab } from "./MblDetailsTab";

// Tabs of an opened master job; more will follow.
const DETAIL_TABS = [{ key: "mbl", label: "MBL Details" }] as const;

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
  const [detailTab, setDetailTab] = useState<(typeof DETAIL_TABS)[number]["key"]>("mbl");
  // Every master job opens on its first tab.
  useEffect(() => setDetailTab("mbl"), [openId]);

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
              <button
                type="button"
                onClick={backToList}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-[#d8dce6] bg-white text-slate-900 text-[17px] font-bold cursor-pointer hover:bg-[#f4f5f9] hover:text-[#46506b] transition-colors"
              >
                <ArrowLeftOutlined /> Master Jobs
              </button>
              {mj && (
                <span className="font-mono text-[18px] font-bold tracking-[.02em] text-[#10141f]">{mj.mczNumber}</span>
              )}
              {mj?.masterBolNumber && (
                <span className="text-[13px] font-semibold text-slate-600">MBL {mj.masterBolNumber}</span>
              )}
            </div>
            {mj && (
              <div className="flex gap-0 mb-4 border-b border-slate-200" role="tablist">
                {DETAIL_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={detailTab === tab.key}
                    onClick={() => setDetailTab(tab.key)}
                    className={`px-4 py-2.5 text-sm cursor-pointer transition-all duration-150 border-b-2 -mb-px bg-transparent ${
                      detailTab === tab.key
                        ? "font-semibold text-indigo-500 border-indigo-500"
                        : "font-normal text-slate-400 border-transparent hover:text-slate-600"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
            {mj ? (
              detailTab === "mbl" && (
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
              <div className="px-3 py-7 text-center text-sm text-slate-400">Master job not found.</div>
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
