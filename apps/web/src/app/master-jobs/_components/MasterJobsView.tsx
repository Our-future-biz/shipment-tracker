"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Button, Spin } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { CARD } from "@/styles/ui";
import { BackLink } from "@/components/BackLink";
import { useCreateMasterJob, useMasterJob, useMasterJobs } from "@/hooks/useMasterJobs";
import { MasterJobsList } from "./MasterJobsList";
import { MJ_ANCHORS, MblDetailsTab } from "./MblDetailsTab";
import { MasterJobShipments } from "./MasterJobShipments";
import { MasterJobContainers } from "./MasterJobContainers";
import { FULL_LOAD } from "@/lib/enums";
import { MasterJobFacts } from "./MasterJobFacts";
import { CARD_BODY_PADDED, MasterJobCard, jumpTo } from "./MasterJobFields";
import { MasterJobCostsTab } from "./MasterJobCostsTab";
import { MasterJobTrackingTab } from "./MasterJobTrackingTab";

// Tabs of an opened master job; more will follow.
const DETAIL_TABS = [
  { key: "mbl", label: "MBL Details" },
  { key: "containers", label: "Container Details" },
  { key: "shipments", label: "Linked Shipments" },
  { key: "costs", label: "Costs Breakdown" },
  { key: "tracking", label: "Tracking" },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]["key"];
const isDetailTab = (key: string | null): key is DetailTab => DETAIL_TABS.some((t) => t.key === key);

// Master Jobs in the same shape as Customs: a list, and a master job opened
// inside the page (?open=<id>) with its tabs (?tab=<key>). Back returns to the
// list exactly as it was left — only the opened master job and its tab leave the URL.
export function MasterJobsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { message } = App.useApp();
  const openId = searchParams.get("open");

  const { masterJobs, isLoading, isError } = useMasterJobs();
  const createMasterJob = useCreateMasterJob();
  const detail = useMasterJob(openId);
  // The tab is in the URL, as on a shipment: a reload or a link opens it. MBL Details, the
  // first, is left out, so a master job opened from the list starts there.
  const rawTab = searchParams.get("tab");
  const detailTab: DetailTab = isDetailTab(rawTab) ? rawTab : "mbl";
  const setDetailTab = (tab: DetailTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "mbl") params.delete("tab");
    else params.set("tab", tab);
    router.replace(`/master-jobs?${params.toString()}`, { scroll: false });
  };

  const openMasterJob = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("open", id);
    params.delete("tab");
    router.push(`/master-jobs?${params.toString()}`);
  };

  // Back to the list as it was left: its search and filters stay, only the opened master job and its tab go.
  const listParams = new URLSearchParams(searchParams.toString());
  listParams.delete("open");
  listParams.delete("tab");
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

  // A date that waits for MBL Details: the tab follows the URL, so it is shown a moment later.
  const pendingJump = useRef<string | null>(null);
  useEffect(() => {
    if (detailTab !== "mbl" || !pendingJump.current) return;
    jumpTo(pendingJump.current);
    pendingJump.current = null;
  }, [detailTab]);

  // A count in the summary opens its tab (Container Details, Linked Shipments); a date jumps to its
  // row on MBL Details, opening that tab first when another is open.
  const jumpFromFacts = (target: string) => {
    if (target === MJ_ANCHORS.shipments || target === MJ_ANCHORS.containers) {
      setDetailTab(target === MJ_ANCHORS.shipments ? "shipments" : "containers");
      return;
    }
    if (detailTab === "mbl") {
      jumpTo(target);
      return;
    }
    pendingJump.current = target;
    setDetailTab("mbl");
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
                <MasterJobFacts masterJob={mj} shipments={detail.shipments} onJump={jumpFromFacts} />
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
                      onClick={() => {
                        // A tab picked by hand drops a date's jump still on its way.
                        pendingJump.current = null;
                        setDetailTab(tab.key);
                      }}
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
            detailTab === "containers" ? (
              // The master job's containers, which go on to its houses (as the card used to show them on MBL Details).
              <MasterJobContainers
                id={MJ_ANCHORS.containers}
                fromShipments={mj.loadType === FULL_LOAD}
                containers={detail.containers}
                shipments={detail.shipments}
                onSave={(containers) => detail.setContainers.mutateAsync(containers)}
              />
            ) : detailTab === "shipments" ? (
              // The houses on this master job, with Add and Remove: who they are (Details) or where each
              // one stands (Status), switched inside the card.
              <MasterJobCard
                id={MJ_ANCHORS.shipments}
                icon={<InboxOutlined />}
                title={`Linked shipments (${detail.shipments.length})`}
                bodyClassName={CARD_BODY_PADDED}
              >
                <MasterJobShipments
                  masterJob={mj}
                  shipments={detail.shipments}
                  onLink={(ids) => detail.linkShipments.mutateAsync(ids)}
                  onUnlink={(id) => detail.unlinkShipment.mutateAsync(id)}
                />
              </MasterJobCard>
            ) : detailTab === "costs" ? (
              <MasterJobCostsTab masterJob={mj} />
            ) : detailTab === "tracking" ? (
              <MasterJobTrackingTab />
            ) : (
              <MblDetailsTab masterJob={mj} onSave={(data) => detail.update.mutateAsync(data)} />
            )
          ) : detail.isLoading ? (
            <div className="flex justify-center p-20">
              <Spin size="large" />
            </div>
          ) : (
            <div className="p-10 text-center text-slate-500">
              {/* "Not found" is said only when the server said so; a request that failed is tried again. */}
              {detail.isError ? (
                <>
                  Could not load the master job - {detail.error}.{" "}
                  <Button size="small" onClick={() => detail.reload()}>
                    Retry
                  </Button>
                </>
              ) : (
                "Master job not found."
              )}
            </div>
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
