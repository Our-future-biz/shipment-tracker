"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import { useWarehouse } from "@/hooks/useWarehouse";
import { useGateLog } from "@/hooks/useGateLog";
import { formatDate } from "@/lib/date";
import { FieldRow, Section } from "@/app/warehouse/gate-log/_components/job/fields";

// Warehouse task view: three boards styled like the Gate Log job's sections (e.g. Gate overview).
// Details shows the position; the other two boards are placeholders still to be defined.
// Placeholder label/value rows per board column, same row height as the Gate overview fields.
const EMPTY_ROWS = 6;

// Same tabs as a shipment job (its Warehouse tab left out — this page is the warehouse).
// Only Shipment Details has content so far; the rest are placeholders still to be defined.
const TABS = [
  { key: "details", label: "Shipment Details" },
  { key: "container", label: "Container Details" },
  { key: "cargo", label: "Cargo Details" },
  { key: "costs", label: "Costs Breakdown" },
  { key: "customs", label: "Customs" },
  { key: "documents", label: "Documents" },
  { key: "tracking", label: "Tracking" },
  { key: "claim", label: "Claim" },
];

function EmptyTab({ title }: { title: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <div className="text-xs text-slate-400 mt-1">Coming soon.</div>
    </div>
  );
}

// Read-only value in a board row; empty values show a dash.
const value = (v: ReactNode, mono = false) => (
  <div
    className={`min-h-[25px] flex items-center text-xs font-medium text-slate-900 break-words ${mono ? "font-mono" : ""}`}
  >
    {v === "" || v == null ? <span className="text-slate-300">—</span> : v}
  </div>
);
const num = (v: number | null | undefined, digits = 0) =>
  v
    ? v
        .toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })
        .replace(/,/g, " ")
    : "";

export function WarehouseTaskDetailContent() {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab = TABS.some((t) => t.key === rawTab) ? rawTab! : "details";
  const setActiveTab = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "details") params.delete("tab");
    else params.set("tab", key);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };
  const { tasks, isLoading } = useWarehouse();
  const task = tasks.find((t) => t.id === taskId);
  // The position's data lives on its gate movement only (job values were copied in when it was recorded).
  const { movements, isLoading: movementsLoading } = useGateLog();
  const m = movements.find((x) => x.warehouseTaskId === taskId);

  if (isLoading || movementsLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-10 text-center text-slate-500">
        Task not found.{" "}
        <Link href="/warehouse" className="text-indigo-500">
          Back to Warehouse
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/warehouse")}
            aria-label="Back to Warehouse"
            className="text-slate-400 hover:text-indigo-500 cursor-pointer bg-transparent border-none p-1"
          >
            <ArrowLeftOutlined />
          </button>
          <h1 className="text-[22px] font-bold text-slate-800 m-0 font-mono">{task.taskId}</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-4 overflow-x-auto" role="tablist">
          {TABS.map((tab) => (
            <div
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
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
      </div>
      {activeTab !== "details" && (
        <div className="p-6">
          <EmptyTab title={TABS.find((t) => t.key === activeTab)!.label} />
        </div>
      )}
      {activeTab === "details" && (
        <div className="p-6 space-y-5">
          <Section title="Details">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              <div>
                <FieldRow label="Warehouse ref.">{value(task.taskId, true)}</FieldRow>
                <FieldRow label="Job number">{value(m?.jobNumber, true)}</FieldRow>
                <FieldRow label="Customer">{value(m?.customer)}</FieldRow>
                <FieldRow label="Customer ref.">{value(m?.customerRef)}</FieldRow>
                <FieldRow label="Customer contact">{value(m?.customerContact)}</FieldRow>
                <FieldRow label="Ship. owner">{value(m?.shipmentOwner)}</FieldRow>
                <FieldRow label="Trade direction">{value(m?.handling)}</FieldRow>
                <FieldRow label="Freight mode">{value(m?.freightMode)}</FieldRow>
                <FieldRow label="Load type">{value(m?.loadType)}</FieldRow>
                <FieldRow label="Operation">{value(m?.operationType)}</FieldRow>
                <FieldRow label="POL / POD">
                  {value([m?.pol, m?.pod].filter(Boolean).join(" → "))}
                </FieldRow>
                <FieldRow label="ETD / ETA">
                  {value(
                    [m?.etd, m?.eta].some(Boolean)
                      ? `${formatDate(m?.etd) || "—"} / ${formatDate(m?.eta) || "—"}`
                      : "",
                  )}
                </FieldRow>
                <FieldRow label="Vessel / voyage">
                  {value([m?.vessel, m?.voyage].filter(Boolean).join(" / "))}
                </FieldRow>
              </div>
              <div>
                <FieldRow label="Status">{value(m?.status)}</FieldRow>
                <FieldRow label="Customs status">{value(m?.customsStatus)}</FieldRow>
                <FieldRow label="Customs procedure">{value(m?.customsMode)}</FieldRow>
                <FieldRow label="MRN number">{value(m?.mrn, true)}</FieldRow>
                <FieldRow label="Total pieces">{value(num(m?.colli))}</FieldRow>
                <FieldRow label="Type of packages">{value(m?.packing)}</FieldRow>
                <FieldRow label="Gross weight (kg)">{value(num(m?.weightKg))}</FieldRow>
                <FieldRow label="Volume (m³)">{value(num(m?.measureCbm, 2))}</FieldRow>
                <FieldRow label="Commodity">{value(m?.commodity)}</FieldRow>
                <FieldRow label="Container / seal">
                  {value([m?.containerNumber, m?.sealNumber].filter(Boolean).join(" / "), true)}
                </FieldRow>
                <FieldRow label="Booking no.">{value(m?.bookingNumber, true)}</FieldRow>
                <FieldRow label="HBL / MBL">
                  {value([m?.hblNumber, m?.mblNumber].filter(Boolean).join(" / "), true)}
                </FieldRow>
                <FieldRow label="Created">{value(formatDate(task.createdAt))}</FieldRow>
              </div>
            </div>
          </Section>
          {[1, 2].map((i) => (
            <Section key={i} title={"\u00a0"}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                {[0, 1].map((col) => (
                  <div key={col}>
                    {Array.from({ length: EMPTY_ROWS }, (_, row) => (
                      <FieldRow key={row} label="">
                        <div className="h-[25px]" />
                      </FieldRow>
                    ))}
                  </div>
                ))}
              </div>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
