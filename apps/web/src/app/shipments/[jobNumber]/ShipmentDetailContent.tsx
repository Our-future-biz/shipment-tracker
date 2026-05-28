"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Spin, Dropdown, message } from "antd";
import {
  LeftOutlined,
  CopyOutlined,
  EditOutlined,
  DownOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
  CheckSquareOutlined,
  CalendarOutlined,
  ContainerOutlined,
} from "@ant-design/icons";
import { useShipments } from "@/hooks/useShipments";
import Link from "next/link";
import { CostsTab } from "./tabs/CostsTab";

/* ── Tabs ── */
const TABS = [
  { key: "details", label: "Shipment Details" },
  { key: "costs", label: "Costs Breakdown" },
  { key: "documents", label: "Documents" },
  { key: "warehouse", label: "Warehouse" },
  { key: "tracking", label: "Tracking" },
];

/* ── Stepper stages ── */
const SHIPMENT_STAGES = [
  "Booking confirmed",
  "Cargo ready",
  "In transit",
  "Arrive at POD",
  "Customs clearance",
  "Delivered",
];

function getActiveStageIndex(status: string): number {
  const s = status.toLowerCase();
  if (s.includes("deliver")) return 5;
  if (s.includes("custom")) return 4;
  if (s.includes("arriv")) return 3;
  if (s.includes("transit")) return 2;
  if (s.includes("cargo") || s.includes("ready")) return 1;
  if (s.includes("book") || s.includes("confirm")) return 0;
  return 0;
}

/* ── Default tasks ── */
const DEFAULT_TASKS = [
  "Booking to agent",
  "Booking confirmed",
  "Cargo readiness confirmed",
  "Cargo shipped",
  "Pre-Alert received",
  "Arrival notice sent",
  "Paperwork received",
  "Paperwork provide to customs",
  "Cargo released for further transport",
  "Booked for further transport",
  "Cargo departed from port",
  "Cargo arrived to HUB",
  "Cargo customs cleared",
  "Delivered",
  "Billed",
];

/* ── Stepper component ── */
function ShipmentStepper({ status }: { status: string }) {
  const activeIndex = getActiveStageIndex(status);

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-5">
      <div className="flex items-center">
        {SHIPMENT_STAGES.map((label, i) => {
          const isCompleted = i < activeIndex;
          const isCurrent = i === activeIndex;
          const isLast = i === SHIPMENT_STAGES.length - 1;

          return (
            <div key={label} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center">
                {/* Circle */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                    isCompleted
                      ? "bg-indigo-500 text-white"
                      : isCurrent
                        ? "bg-white border-2 border-indigo-500 text-indigo-500"
                        : "bg-white border-2 border-slate-200 text-slate-400"
                  }`}
                >
                  {isCompleted ? "✓" : i + 1}
                </div>
                {/* Label */}
                <span
                  className={`text-[10px] mt-1.5 whitespace-nowrap ${
                    isCompleted || isCurrent
                      ? "text-indigo-500 font-medium"
                      : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </div>
              {/* Connector line */}
              {!isLast && (
                <div
                  className={`h-0.5 flex-1 mx-2 mt-[-14px] ${
                    isCompleted ? "bg-indigo-500" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Shared UI pieces ── */

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span className="text-indigo-500 text-base">{icon}</span>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider m-0">
        {title}
      </h3>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex py-2 text-xs border-b border-slate-100 last:border-b-0">
      <span className="text-slate-400 w-[120px] shrink-0">{label}</span>
      <span className="text-slate-700 font-medium">
        {value || "—"}
      </span>
    </div>
  );
}

function FieldPair({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="py-2">
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-xs text-slate-700 font-medium">
        {value || "—"}
      </div>
    </div>
  );
}

function AddressBlock({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3.5">
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
        {label}
      </div>
      {value ? (
        <div className="text-xs text-slate-700 leading-relaxed">{value}</div>
      ) : (
        <div className="text-xs text-slate-300 italic">Not specified</div>
      )}
    </div>
  );
}

/* ── Route dots ── */
function RouteLine({ segments }: { segments: string[] }) {
  if (segments.length === 0) return null;

  return (
    <div className="flex items-center gap-2 mt-1">
      {segments.map((city, i) => {
        const isFirst = i === 0;
        const isLast = i === segments.length - 1;
        const dotColor = isFirst || isLast ? "bg-indigo-500" : "bg-slate-400";

        return (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-slate-300 text-xs">→</span>}
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${dotColor}`} />
              <span className="text-xs text-slate-500">{city}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Main component ── */

export function ShipmentDetailContent() {
  const { jobNumber } = useParams<{ jobNumber: string }>();
  const router = useRouter();
  const { shipments, isLoading } = useShipments();
  const [activeTab, setActiveTab] = useState("details");

  const shipment = shipments.find((s) => s.id === jobNumber);

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="p-10 text-center text-slate-500">
        Shipment not found.{" "}
        <Link href="/shipments" className="text-indigo-500">
          Back to list
        </Link>
      </div>
    );
  }

  const status = shipment.status ?? "";
  const hasEra = !!(shipment.estimatedDeparture && shipment.estimatedArrival);
  const routeSegments = [shipment.pol, shipment.pod, shipment.destination].filter(Boolean);

  const handleCopy = () => {
    navigator.clipboard.writeText(shipment.jobNumber ?? shipment.id);
    message.success("Copied to clipboard");
  };

  const actionsMenu = {
    items: [
      {
        key: "delete",
        label: "Delete shipment",
        danger: true,
      },
    ],
  };

  return (
    <div className="bg-slate-50 min-h-full">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-0">
        {/* Back link */}
        <Link
          href="/shipments"
          className="flex items-center gap-1.5 text-sm text-indigo-500 hover:underline cursor-pointer mb-3 w-fit no-underline"
        >
          <LeftOutlined className="text-[10px]" />
          <span>Back to Shipments</span>
        </Link>

        {/* Title row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-bold text-slate-800 m-0">
              {shipment.jobNumber ?? shipment.id}
            </h1>
            <button
              onClick={handleCopy}
              className="text-slate-400 hover:text-indigo-500 cursor-pointer bg-transparent border-none p-1"
            >
              <CopyOutlined />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* ERA badge */}
            <span className="text-[11px] font-semibold bg-slate-100 border border-slate-200 rounded px-2.5 py-1">
              {hasEra ? "ERA KNOWN" : "ERA UNKNOWN"}
            </span>

            {/* ETD / ETA */}
            <span className="text-xs text-slate-500">
              ETD {shipment.estimatedDeparture || "--"} / ETA {shipment.estimatedArrival || "--"}
            </span>

            {/* Edit button */}
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 cursor-pointer text-slate-600">
              <EditOutlined />
              Edit
            </button>

            {/* Actions dropdown */}
            <Dropdown menu={actionsMenu} trigger={["click"]}>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 cursor-pointer text-slate-600">
                Actions <DownOutlined className="text-[10px]" />
              </button>
            </Dropdown>

            {/* Save button */}
            <button className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded border-none cursor-pointer">
              Save Changes
            </button>
          </div>
        </div>

        {/* Route line */}
        <RouteLine segments={routeSegments} />

        {/* Tabs */}
        <div className="flex gap-0 mt-4">
          {TABS.map((tab) => (
            <div
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm cursor-pointer transition-all duration-150 border-b-2 ${
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

      {/* ── Stepper (details tab only) ── */}
      {activeTab === "details" && <ShipmentStepper status={status} />}

      {/* ── Tab content ── */}
      <div className="p-6">
        {activeTab === "details" && (
          <>
            {/* Top section: two-column grid */}
            <div className="grid grid-cols-[1fr_380px] gap-6 mb-6">
              {/* Left column */}
              <div className="space-y-6">
                {/* SHIPMENT OVERVIEW */}
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <SectionHeader icon={<ContainerOutlined />} title="Shipment Overview" />
                  <FieldRow label="Customer" value={shipment.customer} />
                  <FieldRow label="Shipper" value={shipment.shipper} />
                  <FieldRow label="Consignee" value={shipment.consignee} />
                  <FieldRow label="Incoterm" value={shipment.incotermOrigin} />
                  <FieldRow label="Container" value={shipment.containerNumber} />
                  <FieldRow label="Carrier" value={shipment.shippingLine} />
                  <FieldRow label="MBL" value={shipment.masterBolNumber} />
                </div>

                {/* ADDRESSES */}
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <SectionHeader icon={<EnvironmentOutlined />} title="Addresses" />
                  <div className="grid grid-cols-2 gap-3">
                    <AddressBlock label="Shipper" value={shipment.shipper} />
                    <AddressBlock label="Consignee" value={shipment.consignee} />
                    <AddressBlock label="Pick Up Address" value={shipment.pickupAddress} />
                    <AddressBlock label="Delivery Address" value={shipment.deliveryAddress} />
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="self-start">
                {/* TASKS */}
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <SectionHeader icon={<CheckSquareOutlined />} title="Tasks" />
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-3">
                    Support Workflow
                  </div>
                  <div className="space-y-2.5">
                    {DEFAULT_TASKS.map((task, i) => (
                      <label
                        key={i}
                        className="flex items-center gap-2.5 text-xs text-slate-600 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="w-[18px] h-[18px] rounded border-slate-300 accent-indigo-500"
                          readOnly
                        />
                        {task}
                      </label>
                    ))}
                  </div>
                  <button className="mt-4 text-xs text-indigo-500 hover:underline bg-transparent border-none cursor-pointer p-0">
                    + Add Task
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom section: two-column equal grid */}
            <div className="grid grid-cols-2 gap-6">
              {/* BASIC INFORMATION */}
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <SectionHeader icon={<InfoCircleOutlined />} title="Basic Information" />
                <div className="grid grid-cols-2 gap-x-6">
                  <FieldPair label="Internal Reference" value={shipment.jobNumber} />
                  <FieldPair label="Person in Charge" value={shipment.personInCharge} />
                  <FieldPair
                    label="Master Job"
                    value={shipment.masterJobMczNumber ? `#${shipment.masterJobMczNumber}` : null}
                  />
                  <FieldPair label="Holiday Cover" value={shipment.holidayCover} />
                  <FieldPair label="Department" value={shipment.department} />
                  <FieldPair label="Customer" value={shipment.customer} />
                </div>
              </div>

              {/* KEY DATES */}
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <SectionHeader icon={<CalendarOutlined />} title="Key Dates" />
                <div className="grid grid-cols-2 gap-x-6">
                  <FieldPair label="ETD Estimated" value={shipment.estimatedDeparture} />
                  <FieldPair label="ETA Estimated" value={shipment.estimatedArrival} />
                  <FieldPair label="ATD Actual" value={null} />
                  <FieldPair label="ATA Actual" value={null} />
                  <FieldPair label="Arrived at POD" value={null} />
                  <FieldPair label="Delivered" value={null} />
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "costs" && <CostsTab shipment={shipment} />}

        {activeTab === "documents" && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-500">
            Documents will be available in a future update.
          </div>
        )}

        {activeTab === "warehouse" && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-500">
            Warehouse will be available in a future update.
          </div>
        )}

        {activeTab === "tracking" && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-500">
            Tracking will be available in a future update.
          </div>
        )}
      </div>
    </div>
  );
}
