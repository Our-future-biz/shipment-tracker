"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Spin, Dropdown, message, Modal, Tag, Drawer, Tooltip } from "antd";
import { api } from "@/lib/api";
import {
  CopyOutlined,
  DownOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
  CheckSquareOutlined,
  CalendarOutlined,
  ContainerOutlined,
  SplitCellsOutlined,
  PaperClipOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { useShipments, getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import { COLUMN_MAP } from "@/lib/columnConfig";
import { useShipmentTasks } from "@/hooks/useShipmentTasks";
import { getTasksForDirection, getActiveStageFromTasks } from "./_components/taskDefinitions";
import Link from "next/link";
import { CostsTab } from "./tabs/CostsTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { TrackingTab } from "./tabs/TrackingTab";
import { WarehouseTab } from "./tabs/WarehouseTab";
import { EditableCell } from "./_components/EditableCell";
import { TasksPanel } from "./_components/TasksPanel";
import { MasterJobDetailModal } from "../_components/MasterJobDetailModal";
import { MasterJobDialog } from "../_components/MasterJobDialog";
import { LinkedQuotePanel } from "../_components/LinkedQuotePanel";
import { AttachmentsPanel } from "../_components/AttachmentsPanel";
import { AllFieldsModal } from "../_components/AllFieldsModal";
import { NotesDrawer } from "../_components/NotesDrawer";

type CommitFn = (fieldKey: string, value: string) => void;

/* ── Tabs ── */
const TABS = [
  { key: "details", label: "Shipment Details" },
  { key: "cargo", label: "Cargo Details" },
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

function statusTagColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("deliver") || s.includes("billed")) return "green";
  if (s.includes("custom")) return "gold";
  if (s.includes("transit") || s.includes("shipped") || s.includes("transport")) return "blue";
  if (s.includes("cargo") || s.includes("ready")) return "cyan";
  if (s.includes("book") || s.includes("confirm") || s.includes("pending")) return "geekblue";
  return "default";
}

/* ── Stepper component (driven by completed tasks) ── */
function ShipmentStepper({ shipment }: { shipment: ShipmentItem }) {
  const { byKey } = useShipmentTasks(shipment.id);
  const taskList = getTasksForDirection(shipment.tradeDirection);
  const activeIndex = getActiveStageFromTasks(taskList, (key) => !!byKey.get(key)?.completed);

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
    <div className="flex items-center gap-2.5 mb-3">
      <span className="text-indigo-500 text-base">{icon}</span>
      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider m-0">
        {title}
      </h3>
    </div>
  );
}

function FieldRow({
  label,
  value,
  fieldKey,
  onCommit,
}: {
  label: string;
  value?: string | null;
  fieldKey: string;
  onCommit: CommitFn;
}) {
  return (
    <div className="flex py-1.5 text-xs border-b border-slate-100 last:border-b-0">
      <span className="text-slate-600 font-semibold w-[180px] shrink-0">{label}</span>
      <EditableCell
        className="flex-1 min-w-0"
        fieldKey={fieldKey}
        value={value}
        onCommit={onCommit}
        placeholder="—"
        displayClassName="text-slate-900 font-medium"
      />
    </div>
  );
}

function FieldPair({
  label,
  value,
  fieldKey,
  onCommit,
}: {
  label: string;
  value?: string | null;
  fieldKey?: string;
  onCommit?: CommitFn;
}) {
  return (
    <div className="py-1.5">
      <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
        {label}
      </div>
      {fieldKey && onCommit ? (
        <EditableCell
          fieldKey={fieldKey}
          value={value}
          onCommit={onCommit}
          placeholder="—"
          displayClassName="text-xs text-slate-900 font-medium"
        />
      ) : (
        <div className="text-xs text-slate-900 font-medium">{value || "—"}</div>
      )}
    </div>
  );
}

function AddressBlock({
  label,
  value,
  fieldKey,
  onCommit,
}: {
  label: string;
  value?: string | null;
  fieldKey: string;
  onCommit: CommitFn;
}) {
  return (
    <div className="bg-slate-50 rounded-lg p-3.5">
      <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-2">
        {label}
      </div>
      <EditableCell
        multiline
        fieldKey={fieldKey}
        value={value}
        onCommit={onCommit}
        placeholder="Not specified"
        displayClassName="text-xs text-slate-900 leading-relaxed"
        emptyClassName="text-xs text-slate-300 italic"
      />
    </div>
  );
}

/* ── All remaining DB fields, grouped for the details tab ── */
const DETAIL_SECTIONS: { title: string; icon: React.ReactNode; keys: string[] }[] = [
  {
    title: "References & Routing",
    icon: <EnvironmentOutlined />,
    keys: ["personalReference", "bookingNumber", "pol", "pod", "origin", "destination", "cargoOrigin", "countryCode"],
  },
  {
    title: "Cargo & Commercial",
    icon: <ContainerOutlined />,
    keys: [
      "loadType", "tradeDirection", "freightMode", "serviceType", "pcs", "hsCode",
      "cargoDescription", "commercialInvoice", "commercialInvoiceValue", "insurance", "creditCheck", "approvedBy",
    ],
  },
  {
    title: "Status & Meta",
    icon: <InfoCircleOutlined />,
    keys: ["status", "customsStatus", "shipmentsDate", "freeComments"],
  },
  {
    title: "Parties & Agents",
    icon: <InfoCircleOutlined />,
    keys: ["customerPic", "customerReference", "agent", "agentPic", "supplierPic", "equipmentDelivery", "bookingConfirmation", "customsProcedure"],
  },
  {
    title: "Carrier & Bill of Lading",
    icon: <SplitCellsOutlined />,
    keys: ["vessel", "voyage", "incotermDestination", "houseBolNumber", "houseBolType", "masterBolType"],
  },
  {
    title: "Compliance",
    icon: <CheckSquareOutlined />,
    keys: ["vgm", "shippingInstructions", "ams", "isf", "bolDraft"],
  },
  {
    title: "Switch BoL",
    icon: <SplitCellsOutlined />,
    keys: ["switchBol", "switchBolApprovedBy", "switchBolNumber"],
  },
  {
    title: "Containers",
    icon: <ContainerOutlined />,
    keys: [
      "containerCount1", "containerLength1", "containerType1",
      "containerCount2", "containerLength2", "containerType2",
      "containerCount3", "containerLength3", "containerType3",
      "containerCount4", "containerLength4", "containerType4",
    ],
  },
  {
    title: "Additional Dates",
    icon: <CalendarOutlined />,
    keys: ["pickupDate", "pickupTime", "plannedDeliveryTime"],
  },
  {
    title: "Quote",
    icon: <FileTextOutlined />,
    keys: ["salesNumber", "selling", "quoteValidity", "validityStatus"],
  },
  {
    title: "Other",
    icon: <FileTextOutlined />,
    keys: ["claim", "createdBy"],
  },
];

/* ── Cargo-specific sections shown in the Cargo Details tab ── */
const CARGO_SECTION_TITLES = ["Cargo & Commercial", "Containers"];

function FieldGridSection({
  icon,
  title,
  fieldKeys,
  shipment,
  onCommit,
}: {
  icon: React.ReactNode;
  title: string;
  fieldKeys: string[];
  shipment: ShipmentItem;
  onCommit: CommitFn;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <SectionHeader icon={icon} title={title} />
      <div className="grid grid-cols-2 gap-x-6">
        {fieldKeys.map((key) => {
          const col = COLUMN_MAP.get(key);
          if (!col) return null;
          const editable = !col.readonly;
          return (
            <FieldPair
              key={key}
              label={col.title}
              value={getFieldValue(shipment, key)}
              fieldKey={editable ? key : undefined}
              onCommit={editable ? onCommit : undefined}
            />
          );
        })}
      </div>
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
  const searchParams = useSearchParams();
  const { shipments, isLoading, updateField, deleteShipment, linkMasterJob, unlinkMasterJob } = useShipments();
  const [masterJobOpen, setMasterJobOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [quotePanelOpen, setQuotePanelOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [allFieldsOpen, setAllFieldsOpen] = useState(false);

  const shipment = shipments.find((s) => s.id === jobNumber);

  const { data: invoicingData } = useQuery({
    queryKey: ["invoicing", shipment?.id],
    queryFn: () => api.invoicing.invoicingGet(shipment!.id),
    enabled: !!shipment,
  });
  const linkedQuote = invoicingData?.billingSettings?.quoteRef ?? "";

  const TAB_KEYS = TABS.map((t) => t.key);
  const rawTab = searchParams.get("tab");
  const activeTab = rawTab && TAB_KEYS.includes(rawTab) ? rawTab : "details";

  const setActiveTab = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "details") {
      params.delete("tab");
    } else {
      params.set("tab", key);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

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

  const handleCommit: CommitFn = (fieldKey, value) => updateField(shipment.id, fieldKey, value);

  const status = shipment.status ?? "";
  const hasEra = !!(shipment.estimatedDeparture && shipment.estimatedArrival);
  const routeSegments = [shipment.pol, shipment.pod, shipment.destination].filter(Boolean);

  const handleCopy = () => {
    navigator.clipboard.writeText(shipment.jobNumber ?? shipment.id);
    message.success("Copied to clipboard");
  };

  const handleAssignMasterJob = async (ids: string[], mczNumber: string) => {
    try {
      await Promise.all(ids.map((id) => linkMasterJob({ shipmentId: id, mczNumber })));
      message.success(`Linked to ${mczNumber}`);
      setAssignOpen(false);
    } catch {
      message.error("Failed to link to master job");
    }
  };

  const handleUnlinkMasterJob = async () => {
    try {
      await unlinkMasterJob(shipment.id);
      message.success("Removed from master job");
    } catch {
      message.error("Failed to remove from master job");
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: "Delete shipment",
      content: `Delete ${shipment.jobNumber ?? shipment.id}? This cannot be undone.`,
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteShipment(shipment.id);
          message.success("Shipment deleted");
          router.push("/shipments");
        } catch {
          message.error("Failed to delete shipment");
        }
      },
    });
  };

  const actionsMenu = {
    items: [
      {
        key: "allFields",
        label: "View all fields",
      },
      {
        type: "divider" as const,
      },
      {
        key: "delete",
        label: "Delete shipment",
        danger: true,
      },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "delete") handleDelete();
      if (key === "allFields") setAllFieldsOpen(true);
    },
  };

  return (
    <div className="bg-slate-50 min-h-full">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-0">
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
            {/* Status badge */}
            {status && <Tag color={statusTagColor(status)} className="m-0 !text-[12px] !font-semibold">{status}</Tag>}

            {/* ERA badge */}
            {hasEra && (
              <span className="text-[11px] font-semibold bg-slate-100 border border-slate-200 rounded px-2.5 py-1">
                ERA KNOWN
              </span>
            )}

            {/* ETD / ETA */}
            <span className="text-xs text-slate-500">
              ETD {shipment.estimatedDeparture || "--"} / ETA {shipment.estimatedArrival || "--"}
            </span>

            {/* Linked Quote */}
            {linkedQuote && (
              <button
                onClick={() => setQuotePanelOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 cursor-pointer text-slate-600"
              >
                <SplitCellsOutlined />
                Linked Quote
              </button>
            )}

            {/* Notes */}
            <Tooltip title="Notes">
              <button
                onClick={() => setNotesOpen(true)}
                className="flex items-center justify-center w-8 h-8 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 cursor-pointer text-slate-600"
              >
                <FileTextOutlined />
              </button>
            </Tooltip>

            {/* Attachments */}
            <Tooltip title="Attachments">
              <button
                onClick={() => setAttachmentsOpen(true)}
                className="flex items-center justify-center w-8 h-8 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 cursor-pointer text-slate-600"
              >
                <PaperClipOutlined />
              </button>
            </Tooltip>

            {/* Actions dropdown */}
            <Dropdown menu={actionsMenu} trigger={["click"]}>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 cursor-pointer text-slate-600">
                Actions <DownOutlined className="text-[10px]" />
              </button>
            </Dropdown>
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
      {activeTab === "details" && <ShipmentStepper shipment={shipment} />}

      {/* ── Tab content ── */}
      <div className="p-6">
        {activeTab === "details" && (
          <>
            {/* Top section: two-column grid */}
            <div className="grid grid-cols-[1fr_380px] gap-4 mb-4">
              {/* Left column */}
              <div className="space-y-4">
                {/* SHIPMENT OVERVIEW */}
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <SectionHeader icon={<ContainerOutlined />} title="Shipment Overview" />
                  <FieldRow label="Customer" fieldKey="customer" value={shipment.customer} onCommit={handleCommit} />
                  <FieldRow label="Shipper" fieldKey="shipper" value={shipment.shipper} onCommit={handleCommit} />
                  <FieldRow label="Consignee" fieldKey="consignee" value={shipment.consignee} onCommit={handleCommit} />
                  <div className="flex py-1.5 text-xs border-b border-slate-100 last:border-b-0">
                    <span className="text-slate-600 font-semibold w-[180px] shrink-0">Incoterm Origin/Destination</span>
                    <span className="flex-1 min-w-0 text-slate-900 font-medium">
                      {shipment.incotermOrigin || shipment.incotermDestination
                        ? `${shipment.incotermOrigin || "—"}/${shipment.incotermDestination || "—"}`
                        : "—"}
                    </span>
                  </div>
                  <FieldRow label="Container Number" fieldKey="containerNumber" value={shipment.containerNumber} onCommit={handleCommit} />
                  <FieldRow label="Shipping line / Coloader" fieldKey="shippingLine" value={shipment.shippingLine} onCommit={handleCommit} />
                  <FieldRow label="Master BoL Number" fieldKey="masterBolNumber" value={shipment.masterBolNumber} onCommit={handleCommit} />
                </div>

                {/* ADDRESSES */}
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <SectionHeader icon={<EnvironmentOutlined />} title="Addresses" />
                  <div className="grid grid-cols-2 gap-3">
                    <AddressBlock label="Shipper" fieldKey="shipper" value={shipment.shipper} onCommit={handleCommit} />
                    <AddressBlock label="Consignee" fieldKey="consignee" value={shipment.consignee} onCommit={handleCommit} />
                    <AddressBlock label="Pick Up Address" fieldKey="pickupAddress" value={shipment.pickupAddress} onCommit={handleCommit} />
                    <AddressBlock label="Delivery Address" fieldKey="deliveryAddress" value={shipment.deliveryAddress} onCommit={handleCommit} />
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="self-start">
                {/* TASKS */}
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <SectionHeader icon={<CheckSquareOutlined />} title="Tasks" />
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-3">
                    {shipment.tradeDirection === "Export" ? "Export Workflow" : "Import Workflow"}
                  </div>
                  <TasksPanel shipment={shipment} />
                </div>
              </div>
            </div>

            {/* Bottom section: two-column equal grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* BASIC INFORMATION */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <SectionHeader icon={<InfoCircleOutlined />} title="Basic Information" />
                <div className="grid grid-cols-2 gap-x-6">
                  <FieldPair label="Internal Reference" value={shipment.jobNumber} />
                  <FieldPair label="Person in Charge" value={shipment.personInCharge} />
                  <div className="py-2">
                    <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      Master Job
                    </div>
                    <div className="text-xs font-medium flex items-center gap-2">
                      {shipment.masterJobMczNumber ? (
                        <>
                          <button
                            onClick={() => setMasterJobOpen(true)}
                            className="text-indigo-500 hover:underline cursor-pointer bg-transparent border-none p-0 font-medium"
                          >
                            #{shipment.masterJobMczNumber}
                          </button>
                          <button
                            onClick={handleUnlinkMasterJob}
                            className="text-[10px] text-slate-400 hover:text-red-500 cursor-pointer bg-transparent border-none p-0"
                          >
                            unassign
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setAssignOpen(true)}
                          className="text-indigo-500 hover:underline cursor-pointer bg-transparent border-none p-0 font-medium"
                        >
                          + Assign to master job
                        </button>
                      )}
                    </div>
                  </div>
                  <FieldPair label="Holiday Cover" value={shipment.holidayCover} />
                  <FieldPair label="Department" value={shipment.department} />
                  <FieldPair label="Customer" value={shipment.customer} />
                </div>
              </div>

              {/* KEY DATES */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <SectionHeader icon={<CalendarOutlined />} title="Key Dates" />
                <div className="grid grid-cols-2 gap-x-6">
                  <FieldPair label="ETD Estimated" fieldKey="estimatedDeparture" value={shipment.estimatedDeparture} onCommit={handleCommit} />
                  <FieldPair label="ATD Actual" fieldKey="actualDeparture" value={shipment.actualDeparture} onCommit={handleCommit} />
                  <FieldPair label="ETA Estimated" fieldKey="estimatedArrival" value={shipment.estimatedArrival} onCommit={handleCommit} />
                  <FieldPair label="ATA Actual" fieldKey="actualArrival" value={shipment.actualArrival} onCommit={handleCommit} />
                  <FieldPair label="Cargo Readiness" fieldKey="cargoReadinessDate" value={shipment.cargoReadinessDate} onCommit={handleCommit} />
                  <FieldPair label="Closing Date" fieldKey="closingDate" value={shipment.closingDate} onCommit={handleCommit} />
                  <FieldPair label="ETA Warehouse/HUB" fieldKey="etaWarehouse" value={shipment.etaWarehouse} onCommit={handleCommit} />
                  <FieldPair label="Planned Delivery" fieldKey="plannedDeliveryDate" value={shipment.plannedDeliveryDate} onCommit={handleCommit} />
                </div>
              </div>
            </div>

            {/* All remaining fields (every DB column, inline-editable) */}
            <div className="columns-1 lg:columns-2 gap-4 mt-4">
              {DETAIL_SECTIONS.filter((s) => !CARGO_SECTION_TITLES.includes(s.title)).map((section) => (
                <div key={section.title} className="break-inside-avoid mb-4">
                  <FieldGridSection
                    icon={section.icon}
                    title={section.title}
                    fieldKeys={section.keys}
                    shipment={shipment}
                    onCommit={handleCommit}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === "cargo" && (
          <div className="columns-1 lg:columns-2 gap-4">
            {DETAIL_SECTIONS.filter((s) => CARGO_SECTION_TITLES.includes(s.title)).map((section) => (
              <div key={section.title} className="break-inside-avoid mb-4">
                <FieldGridSection
                  icon={section.icon}
                  title={section.title}
                  fieldKeys={section.keys}
                  shipment={shipment}
                  onCommit={handleCommit}
                />
              </div>
            ))}
          </div>
        )}

        {activeTab === "costs" && <CostsTab shipment={shipment} />}

        {activeTab === "documents" && <DocumentsTab shipment={shipment} />}

        {activeTab === "warehouse" && <WarehouseTab shipment={shipment} />}

        {activeTab === "tracking" && <TrackingTab shipment={shipment} />}
      </div>

      {shipment.masterJobMczNumber && (
        <MasterJobDetailModal
          mcz={String(shipment.masterJobMczNumber)}
          open={masterJobOpen}
          onClose={() => setMasterJobOpen(false)}
        />
      )}

      <MasterJobDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        shipments={shipments}
        onLink={handleAssignMasterJob}
        initialSelectedIds={[shipment.id]}
      />

      {linkedQuote && (
        <LinkedQuotePanel
          quoteNumber={linkedQuote}
          open={quotePanelOpen}
          onClose={() => setQuotePanelOpen(false)}
        />
      )}

      <Drawer
        open={attachmentsOpen}
        onClose={() => setAttachmentsOpen(false)}
        width={301}
        closable={false}
        styles={{ body: { padding: 0 } }}
      >
        <AttachmentsPanel
          shipmentId={shipment.id}
          jobNumber={shipment.jobNumber ?? shipment.id}
          context={[shipment.shipper, shipment.consignee].filter(Boolean).join(" → ") || undefined}
          onClose={() => setAttachmentsOpen(false)}
        />
      </Drawer>

      <NotesDrawer
        shipment={shipment}
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        onSave={(value) => updateField(shipment.id, "freeComments", value)}
      />

      <AllFieldsModal shipment={shipment} open={allFieldsOpen} onClose={() => setAllFieldsOpen(false)} />
    </div>
  );
}
