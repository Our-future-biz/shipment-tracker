"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dropdown, Spin, Tooltip } from "antd";
import { ArrowLeftOutlined, DownOutlined } from "@ant-design/icons";
import { useGateMovement, type GateMovement, type GateStampKind } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { controllers } from "@/lib/api/client";
import { errorMessage, freeDaysOver } from "../../_lib/gate";
import { downloadWarehouseLabel } from "../../_lib/labelPdf";
import { btnDanger, btnDefault, btnPrimary } from "./fields";
import { OverviewTab } from "./OverviewTab";
import { SurveyTab } from "./SurveyTab";
import { ShipmentManagementTab } from "./ShipmentManagementTab";

type Tab = "overview" | "survey" | "shipman";

const cardLabel = "text-[11px] font-bold text-slate-500 uppercase tracking-wide";

// Status cards under the header: customs status, storage (free days left) and the vehicle at the gate.
function StatusCards({ m }: { m: GateMovement }) {
  const over = freeDaysOver(m.loadInDate, m.freeDays);
  const storage =
    over == null
      ? { value: m.freeDays == null ? "—" : String(m.freeDays), tone: "text-slate-900", hint: "Free storage days — set the load-in date to count down" }
      : over > 0
        ? { value: `+${over}`, tone: "text-red-600", hint: `${over} chargeable day${over === 1 ? "" : "s"} past free storage` }
        : { value: String(-over), tone: -over <= 3 ? "text-amber-600" : "text-emerald-600", hint: `${-over} free storage day${over === -1 ? "" : "s"} left` };

  const inLeg = m.transportLegs.find((l) => l.leg === "IN");
  const driver = inLeg?.driver || m.driver;
  const plate = inLeg?.plate || m.plate;
  const gateIn = inLeg?.gateTime || (m.gateIn ? formatDateTime(m.gateIn) : "");

  const card = "bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 min-w-0";
  const line = (k: string, v: string, mono = false) => (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-slate-500 shrink-0">{k}</span>
      <span className={`ml-auto text-right font-semibold text-slate-900 break-words ${mono ? "font-mono" : ""}`}>{v || "—"}</span>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
      <div className={card}>
        <div className={cardLabel}>Customs status</div>
        <div className="mt-1.5 text-[15px] font-bold leading-snug text-slate-900 break-words">{m.customsStatus || "Not set"}</div>
      </div>
      <Tooltip title={storage.hint}>
        <div className={card}>
          <div className={cardLabel}>Storage</div>
          <div className={`mt-1 text-[26px] leading-tight font-bold font-mono ${storage.tone}`}>{storage.value}</div>
        </div>
      </Tooltip>
      <div className={card}>
        <div className={cardLabel}>Vehicle</div>
        <div className="mt-1.5 flex flex-col gap-0.5">
          {line("Driver's name", driver)}
          {line("Plate number", plate, true)}
          {line("Gate in time", gateIn, true)}
        </div>
      </div>
    </div>
  );
}

// Gate log job: header with the WH stamps, status cards, and the Overview, Survey and
// Shipment Management tabs. Fields save as you leave them.
export function GateJobView({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { movement: m, isLoading, update, stamp, requestRelease, requestMrn, saveSurvey, remove } = useGateMovement(id);
  const [tab, setTab] = useState<Tab>("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (!m) {
    return (
      <div className="p-10 text-center text-slate-500">
        Movement not found.{" "}
        <Link href="/warehouse/gate-log" className="text-indigo-500">
          Back to Gate Log
        </Link>
      </div>
    );
  }

  const save = (data: Omit<controllers.GateMovementUpdateRequest, "id">) =>
    update.mutateAsync(data).catch((e) => toast.error(errorMessage(e, "Failed to save")));

  const doStamp = async (kind: GateStampKind, label: string, at: string | null) => {
    // An already stamped movement is not an error — the stamp is final, so just say so.
    if (at) {
      toast.info(`${label} was already stamped ${formatDateTime(at)}`);
      return;
    }
    try {
      await stamp.mutateAsync(kind);
      toast.success(`${label} stamped — filed to Documents`);
    } catch (e) {
      toast.error(errorMessage(e, `Failed to stamp ${label}`));
    }
  };

  // Survey is flagged red: the cargo condition has to be recorded before the gate closes.
  const tabs: { key: Tab; label: string; count?: number; alert?: boolean }[] = [
    { key: "overview", label: "Overview" },
    { key: "survey", label: "Survey", count: m.containers.length || undefined, alert: true },
    { key: "shipman", label: "Shipment Management" },
  ];

  const stampButton = (kind: GateStampKind, label: string, at: string | null, primary = false) => (
    <button
      type="button"
      className={primary ? btnPrimary : btnDefault}
      title={at ? `${label} stamped ${formatDateTime(at)}` : undefined}
      onClick={() => doStamp(kind, label, at)}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-slate-50 min-h-full">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-0">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex items-start gap-2 flex-1 min-w-[240px]">
            <button
              onClick={() => router.push("/warehouse/gate-log")}
              aria-label="Back to Gate Log"
              className="mt-1 text-slate-400 hover:text-indigo-500 cursor-pointer bg-transparent border-none p-1"
            >
              <ArrowLeftOutlined />
            </button>
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold text-slate-800 m-0 font-mono">{m.gateRef}</h1>
              <div className="text-xs text-slate-500 mt-0.5">
                Customer <span className="font-semibold text-slate-800">{m.customer || "—"}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            {/* Downloads the warehouse label (PDF) led by the WCZ reference. */}
            <button
              type="button"
              className={btnDanger}
              onClick={() => downloadWarehouseLabel(m).catch(() => toast.error("Failed to create the label"))}
            >
              Create Label
            </button>
            {stampButton("expReceipt", "WH receipt", m.expReceipt)}
            {stampButton("expDraft", "WH Draft Receipt", m.expDraft)}
            {stampButton("impRelease", "WH release", m.impRelease, true)}
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "delete", label: "Delete", danger: true, onClick: () => setDeleteOpen(true) },
                ],
              }}
            >
              <button type="button" className={btnDefault}>
                Actions <DownOutlined className="text-[10px]" />
              </button>
            </Dropdown>
          </div>
        </div>

        <StatusCards m={m} />

        {/* Tabs */}
        <div className="flex gap-0 mt-4">
          {tabs.map((t) => (
            <div
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm cursor-pointer transition-all duration-150 border-b-2 ${
                tab === t.key
                  ? `font-semibold ${t.alert ? "text-red-600 border-red-500" : "text-indigo-500 border-indigo-500"}`
                  : `font-normal border-transparent ${t.alert ? "text-red-500 hover:text-red-600" : "text-slate-400 hover:text-slate-600"}`
              }`}
            >
              {t.label}
              {t.alert && (
                <span className="ml-1 font-bold text-red-600" aria-hidden>
                  !
                </span>
              )}
              {t.count ? (
                <span className={`ml-1.5 rounded-full px-1.5 text-[11px] font-semibold ${tab === t.key ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>
                  {t.count}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="p-6">
        {tab === "overview" && (
          <OverviewTab
            m={m}
            save={save}
            saving={update.isPending}
            requestRelease={() =>
              requestRelease
                .mutateAsync()
                .then(() => toast.success("Release requested — logged on the movement"))
                .catch((e) => toast.error(errorMessage(e, "Failed to ask for release")))
            }
            requesting={requestRelease.isPending}
            requestMrn={() =>
              requestMrn
                .mutateAsync()
                .then(() => toast.success("MRN requested — logged on the movement"))
                .catch((e) => toast.error(errorMessage(e, "Failed to ask for the MRN")))
            }
            requestingMrn={requestMrn.isPending}
          />
        )}
        {tab === "survey" && <SurveyTab m={m} saveSurvey={(survey) => saveSurvey.mutateAsync(survey)} />}
        {tab === "shipman" && <ShipmentManagementTab m={m} save={save} />}
      </div>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          try {
            await remove.mutateAsync();
            toast.success("Movement deleted");
            router.push("/warehouse/gate-log");
          } catch (e) {
            toast.error(errorMessage(e, "Failed to delete"));
          }
        }}
        title="Delete movement"
        description={`Delete gate movement ${m.gateRef}? It is archived, not erased.`}
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}
