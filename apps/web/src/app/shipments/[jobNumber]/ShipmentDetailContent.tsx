"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Spin, Dropdown, message, Modal, Tag, Drawer, Tooltip, Select, TimePicker, Button } from "antd";
import dayjs from "dayjs";
import { api } from "@/lib/api";
import {
  CopyOutlined,
  DownOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
  CheckSquareOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  ContainerOutlined,
  SplitCellsOutlined,
  PaperClipOutlined,
  FileTextOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { useShipments, getFieldValue, buildRowData, type ShipmentItem } from "@/hooks/useShipments";
import { getCellConditionalStyle, getRowConditionalStyle } from "@/lib/columnConfig";
import { formatDate } from "@/lib/date";
import { useShipmentTasks } from "@/hooks/useShipmentTasks";
import { useCardFields } from "./useCardFields";
import { useUsers } from "@/hooks/useUsers";
import { getTasksForDirection, getActiveStageFromTasks } from "./_components/taskDefinitions";
import Link from "next/link";
import { CostsTab } from "./tabs/CostsTab";
import { ContainerDetailsTab } from "./tabs/ContainerDetailsTab";
import { CargoDetailsTab } from "./tabs/CargoDetailsTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { TrackingTab } from "./tabs/TrackingTab";
import { WarehouseTab } from "./tabs/WarehouseTab";
import { CustomsTab } from "./tabs/CustomsTab";
import { EditableCell } from "./_components/EditableCell";
import { CustomerLinkField } from "./_components/CustomerLinkField";
import { PartyContactField } from "./_components/PartyContactField";
import type { controllers } from "@/lib/api/client";
import { TasksPanel } from "./_components/TasksPanel";
import { MasterJobDetailModal } from "../_components/MasterJobDetailModal";
import { MasterJobDialog } from "../_components/MasterJobDialog";
import { LinkedQuotePanel } from "../_components/LinkedQuotePanel";
import { AttachmentsPanel } from "../_components/AttachmentsPanel";
import { NotesDrawer } from "../_components/NotesDrawer";

export type CommitFn = (fieldKey: string, value: string) => void;

/* ── Tabs ── */
const TABS = [
  { key: "details", label: "Shipment Details" },
  { key: "container", label: "Container Details" },
  { key: "cargo", label: "Cargo Details" },
  { key: "costs", label: "Costs Breakdown" },
  { key: "customs", label: "Customs" },
  { key: "documents", label: "Documents" },
  { key: "warehouse", label: "Warehouse" },
  { key: "tracking", label: "Tracking" },
  { key: "claim", label: "Claim" },
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

function SectionHeader({
  icon, title, cardId, allFields, shipment, onCommit, styleFor, renderField,
}: {
  icon: React.ReactNode;
  title: string;
  /** Kdyz je zadano, hlavicka dostane "Show all" a tuzku pro vyber poli. */
  cardId?: string;
  allFields?: FieldDef[];
  shipment?: ShipmentItem;
  onCommit?: CommitFn;
  styleFor?: StyleFor;
  /** Vlastni vykresleni pro pole, ktera nejsou obycejny FieldRow
   *  (Master Job s odkazem, Incoterm, propojeni zakazniku). */
  renderField?: Record<string, React.ReactNode>;
}) {
  const [showAll, setShowAll] = useState(false);
  const [picking, setPicking] = useState(false);
  const { visibleKeys, toggleField, resetCard, isCustomised } = useCardFields();

  const hasTools = !!(cardId && allFields?.length && shipment);
  const allKeys = allFields?.map((f) => f.key) ?? [];
  const shownCount = hasTools ? visibleKeys(cardId!, allKeys).length : 0;

  return (
    <>
      {/* Full-width colored top bar across the card (card padding is p-4, so break out with -mx-4/-mt-4). */}
      <div className="-mx-4 -mt-4 mb-4 px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
        <span className="text-indigo-500 text-base leading-none">{icon}</span>
        <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">
          {title}
        </h3>

        {hasTools && (
          <span className="ml-auto flex items-center gap-1.5">
            {/* .sec-all z mockupu */}
            <button
              onClick={() => setShowAll(true)}
              className="h-[26px] px-2.5 text-[11.5px] font-semibold rounded-md border border-[#d8dce6]
                         bg-white text-slate-600 cursor-pointer hover:bg-[#f4f5f9] hover:text-[#46506b]
                         hover:border-[#c3c9d6] transition-colors whitespace-nowrap"
            >
              Show all ({allKeys.length})
            </button>
            {/* .sec-edit z mockupu */}
            <Tooltip title="Choose which fields appear in this card">
              <button
                onClick={() => setPicking(true)}
                className={`w-[26px] h-[26px] grid place-items-center rounded-md border cursor-pointer
                            transition-colors ${
                  isCustomised(cardId!)
                    ? "bg-indigo-500 border-indigo-500 text-white"
                    : "border-[#d8dce6] bg-white text-slate-600 hover:bg-[#f4f5f9] hover:text-indigo-500 hover:border-[#c3c9d6]"
                }`}
              >
                <EditOutlined className="text-[12px]" />
              </button>
            </Tooltip>
          </span>
        )}
      </div>

      {/* Okno "Show all" - vsechna pole karty, stale editovatelna */}
      {hasTools && (
        <Modal
          open={showAll}
          onCancel={() => setShowAll(false)}
          footer={null}
          width={860}
          title={
            <span className="flex items-center gap-2">
              <span className="text-indigo-500">{icon}</span>
              <span className="text-[13px] font-bold uppercase tracking-wider">{title}</span>
              <span className="ml-2 text-[12px] font-normal text-slate-400">
                {allKeys.length} fields
              </span>
            </span>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 max-h-[65vh] overflow-y-auto pr-1">
            {[allFields!.slice(0, Math.ceil(allFields!.length / 2)),
              allFields!.slice(Math.ceil(allFields!.length / 2))].map((col, i) => (
              <div key={i}>
                {col.map((f) =>
                  renderField?.[f.key] ? (
                    <React.Fragment key={f.key}>{renderField[f.key]}</React.Fragment>
                  ) : f.ro ? (
                    <RoRow key={f.key} label={f.label} value={getFieldValue(shipment!, f.key)} />
                  ) : (
                    <FieldRow
                      key={f.key}
                      label={f.label}
                      fieldKey={f.key}
                      value={getFieldValue(shipment!, f.key)}
                      onCommit={onCommit ?? (() => {})}
                      styleFor={styleFor}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Okno vyberu poli - stejny seznam, jen se zaskrtavatky */}
      {hasTools && (
        <Modal
          open={picking}
          onCancel={() => setPicking(false)}
          width={860}
          title={
            <span className="flex items-center gap-2">
              <EditOutlined className="text-indigo-500" />
              <span className="text-[13px] font-bold uppercase tracking-wider">
                {title} — choose fields
              </span>
              <span className="ml-2 text-[12px] font-normal text-slate-400">
                {shownCount} of {allKeys.length} in card
              </span>
            </span>
          }
          footer={
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-slate-500 mr-auto text-left">
                Unchecked fields stay available under “Show all”.
              </span>
              <button
                onClick={() => resetCard(cardId!)}
                className="h-8 px-3 text-[12.5px] font-semibold rounded-md border border-[#d8dce6]
                           bg-white text-slate-600 cursor-pointer hover:bg-[#f4f5f9]"
              >
                Show all fields
              </button>
              <button
                onClick={() => setPicking(false)}
                className="h-8 px-3 text-[12.5px] font-semibold rounded-md border border-indigo-500
                           bg-indigo-500 text-white cursor-pointer hover:brightness-110"
              >
                Done
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 max-h-[65vh] overflow-y-auto pr-1">
            {[allFields!.slice(0, Math.ceil(allFields!.length / 2)),
              allFields!.slice(Math.ceil(allFields!.length / 2))].map((col, i) => (
              <div key={i}>
                {col.map((f) => {
                  const on = visibleKeys(cardId!, allKeys).includes(f.key);
                  return (
                    <label
                      key={f.key}
                      className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer
                                  hover:bg-slate-50 ${on ? "" : "opacity-55"}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleField(cardId!, f.key, allKeys)}
                        className="cursor-pointer"
                      />
                      <span className="text-[12.5px] text-slate-600 flex-1 min-w-0 truncate">
                        {f.label}
                      </span>
                      <span className="text-[12.5px] text-slate-400 max-w-[45%] truncate text-right">
                        {getFieldValue(shipment!, f.key) || "—"}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function FieldRow({
  label,
  value,
  fieldKey,
  onCommit,
  styleFor,
  labelW = "w-[140px]",
}: {
  label: string;
  value?: string | null;
  fieldKey: string;
  onCommit: CommitFn;
  styleFor?: StyleFor;
  labelW?: string;
}) {
  return (
    <div className="flex gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0">
      <span className={`${labelW} shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide`}>{label}</span>
      <EditableCell
        className="flex-1 min-w-0"
        fieldKey={fieldKey}
        value={value}
        onCommit={onCommit}
        placeholder="—"
        displayClassName="text-slate-900 font-medium"
        displayStyle={styleFor?.(fieldKey, value)}
      />
    </div>
  );
}

// Read-only horizontal row (label | value), matching FieldRow's look.
function RoRow({ label, value, labelW = "w-[140px]" }: { label: string; value?: string | null; labelW?: string }) {
  return (
    <div className="flex gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0">
      <span className={`${labelW} shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide`}>{label}</span>
      <span className="flex-1 min-w-0 text-slate-900 font-medium">{value ? value : <span className="text-slate-300">—</span>}</span>
    </div>
  );
}

type FieldDef = { key: string; label: string; ro?: boolean };

// A card of horizontal rows, optionally split into two columns.
export function DetailCard({
  icon,
  title,
  cardId,
  columns,
  shipment,
  onCommit,
  styleFor,
  renderAfter,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  /** Kdyz je zadano, karta dostane "Show all" a tuzku pro vyber poli. */
  cardId?: string;
  columns: FieldDef[][];
  shipment: ShipmentItem;
  onCommit: CommitFn;
  styleFor?: StyleFor;
  // Extra rows to place directly below a given field, keyed by its field key.
  renderAfter?: Record<string, React.ReactNode>;
  children?: React.ReactNode;
}) {
  const { visibleKeys } = useCardFields();
  const allFields = columns.flat();
  const shown = cardId
    ? new Set(visibleKeys(cardId, allFields.map((f) => f.key)))
    : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <SectionHeader
        icon={icon}
        title={title}
        cardId={cardId}
        allFields={cardId ? allFields : undefined}
        shipment={shipment}
        onCommit={onCommit}
        styleFor={styleFor}
      />
      <div className={columns.length > 1 ? "grid grid-cols-1 md:grid-cols-2 gap-x-6" : ""}>
        {columns.map((col, i) => (
          <div key={i}>
            {col.filter((f) => !shown || shown.has(f.key)).map((f) => (
              <React.Fragment key={f.key}>
                {f.ro ? (
                  <RoRow label={f.label} value={getFieldValue(shipment, f.key)} />
                ) : (
                  <FieldRow label={f.label} fieldKey={f.key} value={getFieldValue(shipment, f.key)} onCommit={onCommit} styleFor={styleFor} />
                )}
                {renderAfter?.[f.key]}
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

// Small in-card column sub-heading bar (used where two sections share one card).
function SubHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-indigo-50/60 border border-indigo-100 rounded-md px-2.5 py-1.5 mb-2">
      <span className="text-indigo-500 text-sm leading-none">{icon}</span>
      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">{title}</span>
    </div>
  );
}

// Conditional-format style for a field, replicating the shipment list colors
// (per-cell background/color rules + whole-row OBL text color).
export type StyleFor = (fieldKey: string, value?: string | null) => React.CSSProperties | undefined;

export function makeStyleFor(shipment: ShipmentItem): StyleFor {
  const rowData = buildRowData(shipment);
  const rowStyle = getRowConditionalStyle(rowData);
  return (fieldKey, value) => {
    const cell = getCellConditionalStyle(fieldKey, (value ?? "").toString(), rowData);
    const merged: React.CSSProperties = { ...(rowStyle ?? {}), ...(cell ?? {}) };
    return Object.keys(merged).length ? merged : undefined;
  };
}

// House BoL release: a one-off action rather than an editable field. Until it is
// released it shows the button; afterwards it shows who released it and when.
function HouseBolReleaseRow({ releasedAt, onRelease }: { releasedAt: string; onRelease: () => void }) {
  return (
    <div className="flex gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0">
      <span className="w-[140px] shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
        House BoL Release
      </span>
      <div className="flex-1 min-w-0">
        {releasedAt ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
            <CheckCircleOutlined /> Released by {releasedAt}
          </span>
        ) : (
          <Button size="small" danger onClick={onRelease}>
            RELEASE BoL
          </Button>
        )}
      </div>
    </div>
  );
}

function EmptyTab({ title }: { title: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <div className="text-xs text-slate-400 mt-1">Coming soon.</div>
    </div>
  );
}

function SalesPersonField({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (value: string) => void;
}) {
  const { users } = useUsers();
  return (
    <div className="py-1.5">
      <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
        Sales Person
      </div>
      <Select
        showSearch
        allowClear
        variant="borderless"
        size="small"
        placeholder="—"
        className="w-full -ml-2 text-xs"
        value={value || undefined}
        optionFilterProp="label"
        onChange={(v) => onChange(v ?? "")}
        options={users.map((u) => ({ label: u.displayName, value: u.displayName }))}
      />
    </div>
  );
}

// Opening hours as a plain time range (from–to), no date, rendered as a card row.
function OpeningHoursRow({
  from,
  to,
  onChange,
}: {
  from?: string | null;
  to?: string | null;
  onChange: (from: string, to: string) => void;
}) {
  const parse = (v?: string | null) => {
    if (!v) return null;
    const d = dayjs(`1970-01-01T${v}`);
    return d.isValid() ? d : null;
  };
  return (
    <div className="flex gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0">
      <span className="w-[140px] shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Opening Hours</span>
      <div className="flex-1 min-w-0">
        <TimePicker.RangePicker
          size="small"
          className="w-full"
          format="HH:mm"
          minuteStep={15}
          value={[parse(from), parse(to)]}
          onChange={(_, strs) => onChange(strs[0] || "", strs[1] || "")}
        />
      </div>
    </div>
  );
}

/* ── Field arrangement for the redesigned details tab ── */
const CARRIER_BOL: FieldDef[] = [
  { key: "vessel", label: "Vessel" },
  { key: "voyage", label: "Voyage" },
  { key: "containerNumber", label: "Container Number", ro: true },
  { key: "houseBolNumber", label: "House BoL Number" },
  { key: "houseBolType", label: "House BoL Type" },
  { key: "masterBolNumber", label: "Master BoL Number" },
  { key: "masterBolType", label: "Master BoL Type" },
];
const KEY_DATES_L: FieldDef[] = [
  { key: "estimatedDeparture", label: "ETD Estimated" },
  { key: "actualDeparture", label: "ATD Actual" },
  { key: "estimatedArrival", label: "ETA Estimated" },
  { key: "actualArrival", label: "ATA Actual" },
  { key: "cargoReadinessDate", label: "Cargo Readiness" },
  { key: "etaWarehouse", label: "ETA Warehouse/HUB" },
  { key: "pickupDate", label: "Pickup Date" },
  { key: "pickupTime", label: "Pickup Time" },
];
const KEY_DATES_R: FieldDef[] = [
  { key: "estimatedDepartureWeek", label: "Est. Departure Week", ro: true },
  { key: "actualDepartureWeek", label: "Actual Departure Week", ro: true },
  { key: "estimatedArrivalWeek", label: "Est. Arrival Week", ro: true },
  { key: "actualArrivalWeek", label: "Actual Arrival Week", ro: true },
  { key: "closingDate", label: "Closing Date" },
  { key: "plannedDeliveryDate", label: "Planned Delivery" },
  { key: "plannedDeliveryTime", label: "Planned Delivery Time" },
];
const REFS_ROUTING: FieldDef[] = [
  { key: "personalReference", label: "Personal Reference" },
  { key: "bookingNumber", label: "Booking Number" },
  { key: "pol", label: "POL" },
  { key: "pod", label: "POD" },
  { key: "origin", label: "Origin" },
  { key: "destination", label: "Destination" },
  { key: "cargoOrigin", label: "Cargo Origin" },
  { key: "countryCode", label: "Country Code" },
];
const PARTIES_AGENTS: FieldDef[] = [
  { key: "customerPic", label: "Customer's PIC" },
  { key: "customerReference", label: "Customer Reference" },
  { key: "agent", label: "Agent" },
  { key: "agentPic", label: "Agent's PIC" },
  { key: "supplierPic", label: "Supplier's PIC" },
  { key: "equipmentDelivery", label: "Equipment Delivery/Pick-Up Address" },
  { key: "equipmentDeliveryDate", label: "Equipment Delivery/Pick-Up Date" },
  { key: "bookingConfirmation", label: "Booking Confirmation" },
  { key: "customsProcedure", label: "Customs Procedure" },
];
const QUOTE_L: FieldDef[] = [
  { key: "salesNumber", label: "Sales Number" },
  { key: "selling", label: "Total Selling Costs" },
  { key: "buying", label: "Total Buying Costs" },
  { key: "profit", label: "Profit", ro: true },
];
const QUOTE_R: FieldDef[] = [
  { key: "quoteValidity", label: "Quote Validity" },
  { key: "validityStatus", label: "Validity Status" },
];
const COMPLIANCE_FIELDS: FieldDef[] = [
  { key: "vgm", label: "VGM" },
  { key: "shippingInstructions", label: "Shipping Instructions" },
  { key: "ams", label: "AMS (if any)" },
  { key: "isf", label: "ISF (if any)" },
  { key: "bolDraft", label: "BoL Draft" },
];
const SWITCH_BOL_FIELDS: FieldDef[] = [
  { key: "switchBol", label: "Switch BOL" },
  { key: "switchBolApprovedBy", label: "Switch BOL Approved By" },
  { key: "switchBolNumber", label: "Switch BOL Number" },
];

/* ── Cargo & Commercial card (mirrors the standalone cargo-details design) ── */
// `ro` fields are read-only projections computed from the Container/Cargo
// Details rows (the value falls back to the stored legacy field for shipments
// that predate the detail tables).
type CargoField = { key: string; label: string; highlight?: boolean; ro?: boolean };

// Load type / freight mode / trade direction / service type / invoicing status
// moved to the Shipment Overview card (agreed overview mockup).
const CARGO_COMMERCIAL_L: CargoField[] = [
  { key: "pcs", label: "Pieces (PCS)", ro: true },
  { key: "typeOfPackages", label: "Type of packages", ro: true },
  { key: "hsCode", label: "HS code", highlight: true, ro: true },
  { key: "cargoDescription", label: "Cargo description", highlight: true, ro: true },
];
const CARGO_COMMERCIAL_R: CargoField[] = [
  { key: "commercialInvoice", label: "Commercial invoice number(s)" },
  { key: "commercialInvoiceValue", label: "Commercial invoice value", ro: true },
  { key: "containerTypeSummary", label: "Container type", ro: true },
  { key: "totalTeu", label: "Total TEU", ro: true },
  { key: "totalGrossWeightKg", label: "Total gross weight (kg)", ro: true },
  { key: "totalVolumeM3", label: "Total volume (m³)", ro: true },
  { key: "insurance", label: "Insurance" },
  { key: "creditCheck", label: "Credit check" },
  { key: "approvedBy", label: "Approved by" },
];

function CargoRow({
  field,
  shipment,
  onCommit,
  styleFor,
}: {
  field: CargoField;
  shipment: ShipmentItem;
  onCommit: CommitFn;
  styleFor?: StyleFor;
}) {
  // The commercial invoice value shows the per-currency breakdown from the
  // cargo lines when there is one; the stored single value covers old data.
  const value =
    field.key === "commercialInvoiceValue"
      ? getFieldValue(shipment, "civByCurrency") || getFieldValue(shipment, "commercialInvoiceValue")
      : getFieldValue(shipment, field.key);
  if (field.ro) {
    return (
      <div className="flex gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0">
        <span className="w-[180px] shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide">{field.label}</span>
        <span
          className={`flex-1 min-w-0 ${
            value
              ? field.highlight
                ? "text-slate-900 font-medium bg-[#eaf6ee] px-1.5 py-px rounded"
                : "text-slate-900 font-medium"
              : "text-slate-300"
          }`}
          style={styleFor?.(field.key, value) ?? undefined}
        >
          {value || "—"}
        </span>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0">
      <span className="w-[180px] shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide">{field.label}</span>
      <EditableCell
        className="flex-1 min-w-0"
        fieldKey={field.key}
        value={value}
        onCommit={onCommit}
        placeholder="—"
        displayClassName={
          field.highlight
            ? "text-slate-900 font-medium bg-[#eaf6ee] px-1.5 py-px rounded"
            : "text-slate-900 font-medium"
        }
        emptyClassName="text-slate-300"
        displayStyle={styleFor?.(field.key, value)}
      />
    </div>
  );
}

function CargoCommercialCard({
  shipment,
  onCommit,
  styleFor,
}: {
  shipment: ShipmentItem;
  onCommit: CommitFn;
  styleFor?: StyleFor;
}) {
  const { visibleKeys } = useCardFields();
  const cargoShown = new Set(
    visibleKeys("cargo", [...CARGO_COMMERCIAL_L, ...CARGO_COMMERCIAL_R].map((f) => f.key)),
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <SectionHeader
        icon={<FileTextOutlined />}
        title="Cargo & Commercial"
        cardId="cargo"
        allFields={[...CARGO_COMMERCIAL_L, ...CARGO_COMMERCIAL_R]}
        shipment={shipment}
        onCommit={onCommit}
        styleFor={styleFor}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-7">
        {[CARGO_COMMERCIAL_L, CARGO_COMMERCIAL_R].map((col, i) => (
          <div key={i}>
            {col.filter((f) => cargoShown.has(f.key)).map((f) => (
              <CargoRow key={f.key} field={f} shipment={shipment} onCommit={onCommit} styleFor={styleFor} />
            ))}
          </div>
        ))}
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
  const { shipments, isLoading, updateField, updateShipment, deleteShipment, linkMasterJob, unlinkMasterJob } = useShipments();
  const [masterJobOpen, setMasterJobOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [quotePanelOpen, setQuotePanelOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const queryClient = useQueryClient();
  // vyber poli zobrazenych v kartach (tuzka v hlavicce karty)
  const { visibleKeys: visibleCardKeys } = useCardFields();
  // Container panel to open/highlight when jumping to Cargo Details from a
  // container-number link.
  const [cargoFocusId, setCargoFocusId] = useState<string | null>(null);

  const shipment = shipments.find((s) => s.id === jobNumber);

  // Fakturacni data se nactou uz pri otevreni zakazky, takze zalozka
  // Costs Breakdown je pri prokliku ma hned k dispozici a nic nedonacita.
  const { data: invoicingData } = useQuery({
    queryKey: ["invoicing", shipment?.id],
    queryFn: () => api.invoicing.invoicingGet(shipment!.id),
    enabled: !!shipment,
  });
  const linkedQuote = invoicingData?.billingSettings?.quoteRef ?? "";

  // Kurzovni listek se predava dopredu ze stejneho duvodu - Costs Breakdown
  // ho pak nacita z pameti, ne ze serveru.
  useQuery({
    queryKey: ["exchange-rates"],
    queryFn: () => api.invoicing.exchangeRateList(),
    staleTime: 10 * 60 * 1000,
  });

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

  // Update a party's name + its CRM customer link together.
  const linkParty = (nameKey: string, idKey: string, name: string, customerId: string | null) => {
    updateShipment({ id: shipment.id, data: { [nameKey]: name, [idKey]: customerId } as controllers.ShipmentUpdateRequest });
  };

  // Persist a field that isn't part of the shipments table's column config.
  const commitDirect: CommitFn = (fieldKey, value) =>
    updateShipment({ id: shipment.id, data: { [fieldKey]: value } as controllers.ShipmentUpdateRequest });

  const styleFor = makeStyleFor(shipment);
  const status = shipment.status ?? "";
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

  // Releasing stamps the acting user server-side, so the browser only triggers
  // it and refreshes.
  const confirmReleaseHouseBol = async () => {
    setReleasing(true);
    try {
      await api.shipments.shipmentReleaseHouseBol(shipment.id);
      await queryClient.invalidateQueries({ queryKey: ["shipments"] });
      message.success("House BoL released");
      setReleaseOpen(false);
    } catch {
      message.error("Failed to release the House BoL");
    } finally {
      setReleasing(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteShipment(shipment.id);
      message.success("Order deleted");
      setDeleteOpen(false);
      router.push("/shipments");
    } catch {
      message.error("Failed to delete order");
    } finally {
      setDeleting(false);
    }
  };

  const actionsMenu = {
    items: [
      {
        key: "delete",
        label: "Delete shipment",
        danger: true,
      },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "delete") setDeleteOpen(true);
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

            {/* ETD / ETA */}
            <span className="text-xs text-slate-500">
              ETD {formatDate(shipment.estimatedDeparture) || "--"} / ETA {formatDate(shipment.estimatedArrival) || "--"}
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
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
            {/* ── MAIN COLUMN ── */}
            <div className="space-y-5 min-w-0">
              {/* SHIPMENT OVERVIEW */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                {/* Column order mirrors the agreed overview mockup 1:1 — left is
                    "who and what", right is "where, when and in which state".
                    Fields are declared as a list so the pencil can filter them. */}
                {(() => {
                  const left: FieldDef[] = [
                    { key: "jobNumber", label: "Internal Reference", ro: true },
                    { key: "masterJob", label: "Master Job", ro: true },
                    { key: "tradeDirection", label: "Trade Direction" },
                    { key: "freightMode", label: "Freight Mode" },
                    { key: "loadType", label: "Load Type" },
                    { key: "serviceType", label: "Service Type" },
                    { key: "customerReference", label: "Customer Reference" },
                    { key: "salesNumber", label: "Sales Number" },
                    { key: "serviceName", label: "Service Name" },
                    { key: "customer", label: "Customer", ro: true },
                    { key: "shipper", label: "Shipper", ro: true },
                    { key: "consignee", label: "Consignee", ro: true },
                    { key: "personInCharge", label: "Handled By" },
                    { key: "salesPerson", label: "Sales Person", ro: true },
                    { key: "incoterm", label: "Incoterm Origin/Destination", ro: true },
                    { key: "freeComments", label: "Free Comments" },
                  ];
                  const right: FieldDef[] = [
                    { key: "status", label: "Shipment Status" },
                    { key: "customsStatus", label: "Customs Status" },
                    { key: "invoicingStatus", label: "Invoicing Status" },
                    { key: "pol", label: "POL" },
                    { key: "estimatedDeparture", label: "ETD Estimated" },
                    { key: "estimatedDepartureWeek", label: "Est. Departure Week", ro: true },
                    { key: "pod", label: "POD" },
                    { key: "estimatedArrival", label: "ETA Estimated" },
                    { key: "estimatedArrivalWeek", label: "Est. Arrival Week", ro: true },
                    { key: "shipmentsDate", label: "Shipments Date", ro: true },
                    { key: "shippingLine", label: "Shipping line / Coloader" },
                    { key: "containerNumber", label: "Container Number", ro: true },
                    { key: "sealNumber", label: "Seal Number", ro: true },
                    { key: "masterBolNumber", label: "Master BoL Number" },
                    { key: "houseBolNumber", label: "House BoL Number" },
                  ];

                  // Radky, ktere nejsou obycejny FieldRow
                  const custom: Record<string, React.ReactNode> = {
                    masterJob: (
                      <div className="flex gap-2.5 py-1.5 text-xs border-b border-slate-100">
                        <span className="w-[140px] shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Master Job</span>
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          {shipment.masterJobMczNumber ? (
                            <>
                              <button onClick={() => setMasterJobOpen(true)} className="text-indigo-500 hover:underline cursor-pointer bg-transparent border-none p-0 font-medium">
                                #{shipment.masterJobMczNumber}
                              </button>
                              <button onClick={handleUnlinkMasterJob} className="text-[10px] text-slate-400 hover:text-red-500 cursor-pointer bg-transparent border-none p-0">
                                unassign
                              </button>
                            </>
                          ) : (
                            <button onClick={() => setAssignOpen(true)} className="text-indigo-500 hover:underline cursor-pointer bg-transparent border-none p-0 font-medium">
                              + Assign to master job
                            </button>
                          )}
                        </div>
                      </div>
                    ),
                    customer: (
                      <CustomerLinkField label="Customer" name={shipment.customer} customerId={shipment.customerId} onChange={(n, id) => linkParty("customer", "customerId", n, id)} />
                    ),
                    shipper: (
                      <CustomerLinkField label="Shipper" name={shipment.shipper} customerId={shipment.shipperId} onChange={(n, id) => linkParty("shipper", "shipperId", n, id)} />
                    ),
                    consignee: (
                      <CustomerLinkField label="Consignee" name={shipment.consignee} customerId={shipment.consigneeId} onChange={(n, id) => linkParty("consignee", "consigneeId", n, id)} />
                    ),
                    incoterm: (
                      <div className="flex gap-2.5 py-1.5 text-xs border-b border-slate-100">
                        <span className="w-[140px] shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Incoterm Origin/Destination</span>
                        <span className="flex-1 min-w-0 text-slate-900 font-medium">
                          {shipment.incotermOrigin || shipment.incotermDestination
                            ? `${shipment.incotermOrigin || "—"}/${shipment.incotermDestination || "—"}`
                            : <span className="text-slate-300">—</span>}
                        </span>
                      </div>
                    ),
                  };

                  const allKeys = [...left, ...right].map((f) => f.key);
                  const shown = new Set(visibleCardKeys("overview", allKeys));
                  const renderCol = (col: FieldDef[]) =>
                    col.filter((f) => shown.has(f.key)).map((f) =>
                      custom[f.key] ? (
                        <React.Fragment key={f.key}>{custom[f.key]}</React.Fragment>
                      ) : f.ro ? (
                        <RoRow key={f.key} label={f.label} value={getFieldValue(shipment, f.key)} />
                      ) : (
                        <FieldRow key={f.key} label={f.label} fieldKey={f.key} value={getFieldValue(shipment, f.key)} onCommit={handleCommit} styleFor={styleFor} />
                      ),
                    );

                  return (
                    <>
                      <SectionHeader
                        icon={<ContainerOutlined />}
                        title="Shipment Overview"
                        cardId="overview"
                        allFields={[...left, ...right]}
                        shipment={shipment}
                        onCommit={handleCommit}
                        styleFor={styleFor}
                        renderField={custom}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                        <div>{renderCol(left)}</div>
                        <div>{renderCol(right)}</div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* COMMERCIAL PARTIES */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                {(() => {
                  const left: FieldDef[] = [
                    { key: "shipper", label: "Shipper", ro: true },
                    { key: "shipperContact", label: "Contact", ro: true },
                    { key: "pickupAddress", label: "Pick-up Address" },
                    { key: "shipperOpening", label: "Opening Hours", ro: true },
                  ];
                  const right: FieldDef[] = [
                    { key: "consignee", label: "Consignee", ro: true },
                    { key: "consigneeContact", label: "Contact", ro: true },
                    { key: "deliveryAddress", label: "Delivery Address" },
                    { key: "consigneeOpening", label: "Opening Hours", ro: true },
                  ];

                  const custom: Record<string, React.ReactNode> = {
                    shipper: (
                      <CustomerLinkField label="Shipper" name={shipment.shipper} customerId={shipment.shipperId} onChange={(n, id) => linkParty("shipper", "shipperId", n, id)} />
                    ),
                    shipperContact: (
                      <PartyContactField label="Contact" fieldKey="shipperContact" value={shipment.shipperContact} customerId={shipment.shipperId} onCommit={commitDirect} />
                    ),
                    shipperOpening: (
                      <OpeningHoursRow
                        from={shipment.shipperOpeningFrom}
                        to={shipment.shipperOpeningTo}
                        onChange={(f, t) => updateShipment({ id: shipment.id, data: { shipperOpeningFrom: f, shipperOpeningTo: t } })}
                      />
                    ),
                    consignee: (
                      <CustomerLinkField label="Consignee" name={shipment.consignee} customerId={shipment.consigneeId} onChange={(n, id) => linkParty("consignee", "consigneeId", n, id)} />
                    ),
                    consigneeContact: (
                      <PartyContactField label="Contact" fieldKey="consigneeContact" value={shipment.consigneeContact} customerId={shipment.consigneeId} onCommit={commitDirect} />
                    ),
                    consigneeOpening: (
                      <OpeningHoursRow
                        from={shipment.consigneeOpeningFrom}
                        to={shipment.consigneeOpeningTo}
                        onChange={(f, t) => updateShipment({ id: shipment.id, data: { consigneeOpeningFrom: f, consigneeOpeningTo: t } })}
                      />
                    ),
                  };

                  const allKeys = [...left, ...right].map((f) => f.key);
                  const shown = new Set(visibleCardKeys("parties", allKeys));
                  const renderCol = (col: FieldDef[]) =>
                    col.filter((f) => shown.has(f.key)).map((f) =>
                      custom[f.key] ? (
                        <React.Fragment key={f.key}>{custom[f.key]}</React.Fragment>
                      ) : (
                        <FieldRow key={f.key} label={f.label} fieldKey={f.key} value={getFieldValue(shipment, f.key)} onCommit={handleCommit} styleFor={styleFor} />
                      ),
                    );

                  return (
                    <>
                      <SectionHeader
                        icon={<EnvironmentOutlined />}
                        title="Commercial Parties"
                        cardId="parties"
                        allFields={[...left, ...right]}
                        shipment={shipment}
                        onCommit={handleCommit}
                        styleFor={styleFor}
                        renderField={custom}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                        <div>{renderCol(left)}</div>
                        <div>{renderCol(right)}</div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* CARRIER & BILL OF LADING  |  KEY DATES */}
              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5 items-start">
                <DetailCard
                  icon={<SplitCellsOutlined />}
                  title="Carrier & Bill of Lading"
                  cardId="carrier"
                  columns={[CARRIER_BOL]}
                  shipment={shipment}
                  onCommit={handleCommit}
                  styleFor={styleFor}
                  renderAfter={{
                    houseBolType: (
                      <HouseBolReleaseRow releasedAt={shipment.houseBolRelease} onRelease={() => setReleaseOpen(true)} />
                    ),
                  }}
                />
                <DetailCard icon={<CalendarOutlined />} title="Key Dates" cardId="dates" columns={[KEY_DATES_L, KEY_DATES_R]} shipment={shipment} onCommit={handleCommit} styleFor={styleFor} />
              </div>

              {/* REFERENCES & ROUTING  |  PARTIES & AGENTS
                  Jedna karta se dvema podnadpisy - tuzka filtruje pole
                  obou sloupcu dohromady. */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                {(() => {
                  const allFields = [...REFS_ROUTING, ...PARTIES_AGENTS];
                  const shown = new Set(
                    visibleCardKeys("refsParties", allFields.map((f) => f.key)),
                  );
                  const renderCol = (col: FieldDef[]) =>
                    col.filter((f) => shown.has(f.key)).map((f) => (
                      <FieldRow key={f.key} label={f.label} fieldKey={f.key} value={getFieldValue(shipment, f.key)} onCommit={handleCommit} styleFor={styleFor} />
                    ));
                  const leftShown = REFS_ROUTING.some((f) => shown.has(f.key));
                  const rightShown = PARTIES_AGENTS.some((f) => shown.has(f.key));

                  return (
                    <>
                      <SectionHeader
                        icon={<EnvironmentOutlined />}
                        title="References & Routing · Parties & Agents"
                        cardId="refsParties"
                        allFields={allFields}
                        shipment={shipment}
                        onCommit={handleCommit}
                        styleFor={styleFor}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                        <div>
                          {/* podnadpis se skryje, kdyz z jeho sloupce nezbylo zadne pole */}
                          {leftShown && <SubHeader icon={<EnvironmentOutlined />} title="References & Routing" />}
                          {renderCol(REFS_ROUTING)}
                        </div>
                        <div>
                          {rightShown && <SubHeader icon={<InfoCircleOutlined />} title="Parties & Agents" />}
                          {renderCol(PARTIES_AGENTS)}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* QUOTE */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                {(() => {
                  const right: FieldDef[] = [...QUOTE_R, { key: "salesPerson", label: "Sales Person", ro: true }];
                  const custom: Record<string, React.ReactNode> = {
                    salesPerson: (
                      <SalesPersonField value={shipment.salesPerson} onChange={(v) => updateShipment({ id: shipment.id, data: { salesPerson: v } })} />
                    ),
                  };
                  const allKeys = [...QUOTE_L, ...right].map((f) => f.key);
                  const shown = new Set(visibleCardKeys("quote", allKeys));
                  const renderCol = (col: FieldDef[]) =>
                    col.filter((f) => shown.has(f.key)).map((f) =>
                      custom[f.key] ? (
                        <React.Fragment key={f.key}>{custom[f.key]}</React.Fragment>
                      ) : f.ro ? (
                        <RoRow key={f.key} label={f.label} value={getFieldValue(shipment, f.key)} />
                      ) : (
                        <FieldRow key={f.key} label={f.label} fieldKey={f.key} value={getFieldValue(shipment, f.key)} onCommit={handleCommit} styleFor={styleFor} />
                      ),
                    );

                  return (
                    <>
                      <SectionHeader
                        icon={<FileTextOutlined />}
                        title="Quote"
                        cardId="quote"
                        allFields={[...QUOTE_L, ...right]}
                        shipment={shipment}
                        onCommit={handleCommit}
                        styleFor={styleFor}
                        renderField={custom}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                        <div>{renderCol(QUOTE_L)}</div>
                        <div>{renderCol(right)}</div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* CARGO & COMMERCIAL */}
              <CargoCommercialCard shipment={shipment} onCommit={handleCommit} styleFor={styleFor} />

              {/* BASIC INFORMATION */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                {(() => {
                  const left: FieldDef[] = [
                    { key: "jobNumber", label: "Internal Reference", ro: true },
                    { key: "department", label: "Department" },
                    { key: "claim", label: "Claim" },
                  ];
                  const right: FieldDef[] = [
                    { key: "personInCharge", label: "Person In Charge" },
                    { key: "holidayCover", label: "Holiday Cover" },
                    { key: "createdBy", label: "Created By", ro: true },
                  ];
                  const allKeys = [...left, ...right].map((f) => f.key);
                  const shown = new Set(visibleCardKeys("basic", allKeys));
                  const renderCol = (col: FieldDef[]) =>
                    col.filter((f) => shown.has(f.key)).map((f) =>
                      f.ro ? (
                        <RoRow key={f.key} label={f.label} value={getFieldValue(shipment, f.key)} />
                      ) : (
                        <FieldRow key={f.key} label={f.label} fieldKey={f.key} value={getFieldValue(shipment, f.key)} onCommit={handleCommit} styleFor={styleFor} />
                      ),
                    );

                  return (
                    <>
                      <SectionHeader
                        icon={<InfoCircleOutlined />}
                        title="Basic Information"
                        cardId="basic"
                        allFields={[...left, ...right]}
                        shipment={shipment}
                        onCommit={handleCommit}
                        styleFor={styleFor}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                        <div>{renderCol(left)}</div>
                        <div>{renderCol(right)}</div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* ── SIDEBAR ── */}
            <div className="space-y-5">
              {/* TASKS */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <SectionHeader icon={<CheckSquareOutlined />} title="Tasks" />
                <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-3">
                  {shipment.tradeDirection === "Export" ? "Export Workflow" : "Import Workflow"}
                </div>
                <TasksPanel shipment={shipment} />
              </div>

              <DetailCard icon={<CheckSquareOutlined />} title="Compliance" cardId="compliance" columns={[COMPLIANCE_FIELDS]} shipment={shipment} onCommit={handleCommit} styleFor={styleFor} />
              <DetailCard icon={<SplitCellsOutlined />} title="Switch BOL" cardId="switchBol" columns={[SWITCH_BOL_FIELDS]} shipment={shipment} onCommit={handleCommit} styleFor={styleFor} />
            </div>
          </div>
        )}

        {activeTab === "cargo" && (
          <CargoDetailsTab
            shipment={shipment}
            focusContainerId={cargoFocusId}
            onChange={(data) => updateShipment({ id: shipment.id, data })}
          />
        )}

        {activeTab === "costs" && <CostsTab shipment={shipment} />}

        {activeTab === "documents" && <DocumentsTab shipment={shipment} />}

        {activeTab === "warehouse" && <WarehouseTab shipment={shipment} />}

        {activeTab === "tracking" && <TrackingTab shipment={shipment} />}

        {activeTab === "container" && (
          <ContainerDetailsTab
            shipment={shipment}
            onChange={(containers) => updateShipment({ id: shipment.id, data: { containers } })}
            onOpenCargo={(containerId) => {
              setCargoFocusId(containerId);
              setActiveTab("cargo");
            }}
          />
        )}

        {activeTab === "customs" && <CustomsTab shipment={shipment} onCommit={handleCommit} />}

        {activeTab === "claim" && <EmptyTab title="Claim" />}
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


      <Modal
        open={releaseOpen}
        title="Release Bill of Lading?"
        okText="Yes, release the BoL"
        okButtonProps={{ danger: true, loading: releasing }}
        cancelText="Cancel"
        onOk={confirmReleaseHouseBol}
        onCancel={() => setReleaseOpen(false)}
        destroyOnHidden
      >
        <p className="text-sm text-slate-700">
          Do you really want to release the shipment{" "}
          <b className="font-mono">{shipment.jobNumber ?? shipment.id}</b>?
        </p>
        <p className="text-sm text-slate-500 mt-2">
          Your name and the current date and time will be recorded as the release. This cannot be undone.
        </p>
      </Modal>

      <Modal
        open={deleteOpen}
        title="Delete order"
        okText="Yes, delete the order"
        okButtonProps={{ danger: true, loading: deleting }}
        cancelText="Cancel"
        onOk={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
        destroyOnHidden
      >
        <p className="text-sm text-slate-700">
          Do you really want to delete order <b className="font-mono">{shipment.jobNumber ?? shipment.id}</b>?
        </p>
        <p className="text-sm text-slate-500 mt-2">
          The order is <b>not erased</b> — it is archived with all its details, and its reference can never be reused.
          This action is recorded against your account.
        </p>
      </Modal>
    </div>
  );
}
