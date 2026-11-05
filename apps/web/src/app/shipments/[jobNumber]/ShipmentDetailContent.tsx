"use client";

import React, { useEffect, useState } from "react";
import { contactUpdate, partyUpdate, type ContactField, type ContactLinks, type PartyField } from "@/app/shipments/_lib/parties";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Badge, Spin, Dropdown, Modal, Drawer, Tooltip, Select, TimePicker, Button } from "antd";
import { useToast } from "@/lib/toast";
import dayjs from "dayjs";
import { api, apiErrorMessage } from "@/lib/api";
import {
  DownOutlined,
  InfoCircleOutlined,
  CheckSquareOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  ContainerOutlined,
  SplitCellsOutlined,
  PaperClipOutlined,
  FileTextOutlined,
  ControlOutlined,
  DollarOutlined,
  WarningOutlined,
  ProfileOutlined,
  ShopOutlined,
  FileProtectOutlined,
  TeamOutlined,
  NodeIndexOutlined,
  InboxOutlined,
  CalculatorOutlined,
  SafetyCertificateOutlined,
  HomeOutlined,
} from "@ant-design/icons";
import { useShipment } from "@/hooks/useShipment";
import { NOT_STACKABLE, STACKABLE_OPTIONS, shipmentStackability, withShipmentStackability } from "@/lib/cargo";
import { useInvoicing } from "@/hooks/useInvoicing";
import { useCanDeleteShipments } from "@/lib/auth/AuthContext";
import { useShipmentMutations, getFieldValue, buildRowData, type ShipmentItem } from "@/hooks/useShipments";
import { getCellConditionalStyle, getRowConditionalStyle } from "@/lib/columnConfig";
import { businessToday, formatDate } from "@/lib/date";
import { useCardFields } from "./useCardFields";
import { UserPicker } from "@/components/UserPicker";
import { UnlinkedPersonMark } from "@/app/shipments/_components/UnlinkedPersonMark";
import { isPersonField, personChange, splitPersonStamp } from "@/app/shipments/_lib/personFields";
import { isSalesQuoteRef } from "@/app/sales/_lib/salesQuote";
import { quoteHref } from "@/app/sales/_lib/quoteHref";
import Link from "next/link";
import { ClaimsTab } from "./tabs/ClaimsTab";
import { CostsTab } from "./tabs/CostsTab";
import { useCostsData } from "./tabs/useCostsData";
import { money } from "./tabs/costsCalc";
import { ContainerDetailsTab } from "./tabs/ContainerDetailsTab";
import { CargoDetailsTab } from "./tabs/CargoDetailsTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { TrackingTab } from "./tabs/TrackingTab";
import { NotificationsTab } from "./tabs/NotificationsTab";
import { useShipmentAlerts } from "@/hooks/useShipmentAlerts";
import { WarehouseTab } from "./tabs/WarehouseTab";
import { CustomsTab } from "./tabs/CustomsTab";
import { EditableCell, FreightModeContext, ShipmentCustomerContext, ShipmentCustomerPicContext, TradeDirectionContext } from "./_components/EditableCell";
import { FadeText } from "@/components/FadeText";
import { CustomerLinkField } from "./_components/CustomerLinkField";
import { PartyContactField } from "./_components/PartyContactField";
import { StopPlaceRow } from "./_components/StopPlaceRow";
import { SalesQuoteLink } from "./_components/SalesQuoteLink";
import type { controllers } from "@/lib/api/client";
import { TasksPanel } from "./_components/TasksPanel";
import { ShipmentFacts, ShipmentProgress } from "./_components/ShipmentSummary";
import { CARD, CARD_BODY, COLS2, EMPTY, HEADER_BTN, HEADER_ICON_BTN, LABEL, LABEL_TOP, LABEL_W, REF_KEYS, REF_VALUE, ROW, ROW_TOP, VALUE } from "./_components/detailStyles";
import { MasterJobDetailModal } from "../_components/MasterJobDetailModal";
import { MasterJobDialog } from "../_components/MasterJobDialog";
import { AttachmentsPanel } from "../_components/AttachmentsPanel";
import { NotesDrawer } from "../_components/NotesDrawer";
import { CommercialInvoicesModal } from "../_components/CommercialInvoicesModal";

/** `links` go with a value that names a record: a picked contact's id. */
export type CommitFn = (fieldKey: string, value: string, links?: ContactLinks) => void;

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
  { key: "alerts", label: "Alerts" },
];

/* ── Shared UI pieces ── */

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  /** Kdyz je zadano, hlavicka dostane "Show all" a tuzku pro vyber poli. */
  cardId?: string;
  allFields?: FieldDef[];
  shipment?: ShipmentItem;
  onCommit?: CommitFn;
  styleFor?: StyleFor;
  /** Vlastni vykresleni pro pole, ktera nejsou obycejny FieldRow
   *  (Master Job s odkazem, Incoterms, propojeni zakazniku). */
  renderField?: Record<string, React.ReactNode>;
}

function SectionHeader({
  icon, title, cardId, allFields, shipment, onCommit, styleFor, renderField,
}: SectionHeaderProps) {
  const [showAll, setShowAll] = useState(false);
  const [picking, setPicking] = useState(false);
  const { visibleKeys, toggleField, resetCard, isCustomised } = useCardFields();

  const hasTools = !!(cardId && allFields?.length && shipment);
  const allKeys = allFields?.map((f) => f.key) ?? [];
  const shownKeys = hasTools ? visibleKeys(cardId!, allKeys) : [];
  const shownCount = shownKeys.length;

  /**
   * One field row, used by both "Show all" and the field picker so the two
   * modals always render the same thing — custom fields (Master Job's link,
   * the party pickers) and editable cells included.
   */
  const fieldRow = (f: FieldDef): React.ReactNode =>
    renderField?.[f.key] ? (
      renderField[f.key]
    ) : INVOICE_FIELDS.has(f.key) ? (
      <InvoiceRow label={f.label} fieldKey={f.key} shipment={shipment!} styleFor={styleFor} />
    ) : f.ro ? (
      <RoRow label={f.label} value={getFieldValue(shipment!, f.key)} />
    ) : (
      <FieldRow
        label={f.label}
        fieldKey={f.key}
        value={getFieldValue(shipment!, f.key)}
        onCommit={onCommit ?? (() => {})}
        styleFor={styleFor}
      />
    );

  return (
    <>
      {/* The app's card header (Master Jobs, Warehouse, Claims): a light indigo bar with the
          icon, the title in caps and the card's tools. */}
      <div className="flex items-center gap-2.5 min-h-[42px] px-4 py-1.5 bg-indigo-50 border-b border-indigo-100">
        <span className="text-indigo-500 text-[14px] leading-none shrink-0">{icon}</span>
        <h3 className="m-0 min-w-0 text-[13px] leading-tight font-bold uppercase tracking-wider text-slate-800">
          {title}
        </h3>

        {hasTools && (
          <span className="ml-auto flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => setShowAll(true)}
              className="h-7 px-2 rounded-md border-0 bg-transparent text-[12px] font-medium text-slate-500
                         tabular-nums whitespace-nowrap cursor-pointer hover:bg-indigo-100 hover:text-slate-800 transition-colors"
            >
              Show all ({allKeys.length})
            </button>
            <Tooltip title="Choose which fields appear in this card">
              <button
                onClick={() => setPicking(true)}
                className={`w-7 h-7 grid place-items-center rounded-md border-0 cursor-pointer transition-colors ${
                  isCustomised(cardId!)
                    ? "bg-white text-indigo-600 ring-1 ring-inset ring-indigo-200"
                    : "bg-transparent text-slate-400 hover:bg-indigo-100 hover:text-indigo-600"
                }`}
              >
                <ControlOutlined className="text-[13px]" />
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
              <span className="text-slate-400">{icon}</span>
              <span className="text-[14px] font-semibold text-slate-800">{title}</span>
              <span className="ml-2 text-[12px] font-normal text-slate-400">
                {allKeys.length} fields
              </span>
            </span>
          }
        >
          <FieldColumns fields={allFields!} renderRow={fieldRow} />
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
              <span className="text-slate-400">{icon}</span>
              <span className="text-[14px] font-semibold text-slate-800">
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
                className="h-8 px-3 text-[13px] font-semibold rounded-md border border-line-soft
                           bg-white text-slate-600 cursor-pointer hover:bg-surface-2"
              >
                Show all fields
              </button>
              <button
                onClick={() => setPicking(false)}
                className="h-8 px-3 text-[13px] font-semibold rounded-md border border-indigo-500
                           bg-indigo-500 text-white cursor-pointer hover:brightness-110"
              >
                Done
              </button>
            </div>
          }
        >
          {/* Exactly the rows "Show all" renders — same component, same values,
              same custom fields — with only a checkbox added in front. */}
          <FieldColumns
            fields={allFields!}
            renderRow={(f) => {
              const on = shownKeys.includes(f.key);
              // The separator belongs to the wrapper, not the row, so the rule
              // runs the full width under the checkbox too — otherwise the
              // indented lines break the table look "Show all" has.
              return (
                <div
                  className={`flex items-center gap-2.5 border-b border-slate-100 last:border-b-0 ${
                    on ? "" : "opacity-45"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleField(cardId!, f.key, allKeys)}
                    aria-label={`Show ${f.label} in this card`}
                    className="shrink-0 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0 [&>div]:border-b-0 [&>div]:mx-0">{fieldRow(f)}</div>
                </div>
              );
            }}
          />
        </Modal>
      )}
    </>
  );
}

interface FieldRowProps {
  label: string;
  value?: string | null;
  fieldKey: string;
  onCommit: CommitFn;
  styleFor?: StyleFor;
  labelW?: string;
}

function FieldRow({
  label,
  value,
  fieldKey,
  onCommit,
  styleFor,
  labelW = LABEL_W,
}: FieldRowProps) {
  // A person is never typed in: every card and modal row of one is the user picker.
  if (isPersonField(fieldKey)) {
    return <MemberRow label={label} fieldKey={fieldKey} value={value} onCommit={onCommit} labelW={labelW} />;
  }
  return (
    <div className={ROW}>
      <span className={LABEL.replace(LABEL_W, labelW)}>{label}</span>
      <EditableCell
        className="flex-1 min-w-0"
        fieldKey={fieldKey}
        value={value}
        onCommit={onCommit}
        placeholder="—"
        displayClassName={REF_KEYS.has(fieldKey) ? REF_VALUE : "text-slate-900"}
        emptyClassName={EMPTY}
        // Customer's PIC is a link like the Customer row's, which takes no rule colour here either.
        displayStyle={fieldKey === "customerPic" ? undefined : styleFor?.(fieldKey, value)}
      />
    </div>
  );
}

interface MemberRowProps {
  label: string;
  value?: string | null;
  fieldKey: string;
  onCommit: CommitFn;
  labelW?: string;
}

interface StackabilityRowProps {
  value: string;
  onPick: (value: string) => void;
}

// The shipment's stackability, read from its dimension rows. A double-click picks it for the
// whole shipment (every row takes it); the long value wraps instead of being cut off.
function StackabilityRow({ value, onPick }: StackabilityRowProps) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={ROW_TOP}>
      <span className={LABEL_TOP}>Stackability</span>
      {editing ? (
        <Select
          size="small"
          autoFocus
          defaultOpen
          allowClear
          placeholder="—"
          className="flex-1 min-w-0"
          popupMatchSelectWidth={false}
          value={value || undefined}
          options={STACKABLE_OPTIONS.map((s) => ({ value: s }))}
          onChange={(v) => {
            onPick(v ?? "");
            setEditing(false);
          }}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <span
          // Cargo that needs special handling stands out, like a Yes for Dangerous.
          className={`flex-1 min-w-0 cursor-pointer rounded px-1 -mx-1 transition-colors text-slate-800 break-words ${
            value === NOT_STACKABLE ? "bg-yellow-500/15" : "hover:bg-slate-100"
          }`}
          title="Double-click to edit"
          onDoubleClick={() => setEditing(true)}
        >
          {value || <span className={EMPTY}>—</span>}
        </span>
      )}
    </div>
  );
}

// Row whose value is one of the company's users: found by name or e-mail, kept and shown by
// e-mail. Approved By may hold the server's stamp "<e-mail> — <date>": the picker shows who and
// the date stands beside it; picking someone else replaces the stamp.
function MemberRow({
  label,
  value,
  fieldKey,
  onCommit,
  labelW = LABEL_W,
}: MemberRowProps) {
  const { person, when } = splitPersonStamp(value);
  return (
    <div className={ROW}>
      <span className={LABEL.replace(LABEL_W, labelW)}>{label}</span>
      <UserPicker
        variant="borderless"
        size="small"
        placeholder="—"
        className="flex-1 min-w-0 -ml-2 text-[13px]"
        popupMatchSelectWidth={false}
        aria-label={label}
        value={person}
        onChange={(email) => {
          const next = personChange(value, email);
          if (next !== null) onCommit(fieldKey, next);
        }}
      />
      {when && <span className="shrink-0 text-[11px] text-slate-400 whitespace-nowrap">{when}</span>}
    </div>
  );
}

// Commercial Invoice number(s) / value: shown from the shipment's invoices and edited in
// the Commercial Invoices dialog (the same one the Shipments table opens).
const INVOICE_FIELDS = new Set(["commercialInvoice", "commercialInvoiceValue"]);

interface InvoiceRowProps {
  label: string;
  fieldKey: string;
  shipment: ShipmentItem;
  styleFor?: StyleFor;
  labelW?: string;
}

function InvoiceRow({
  label,
  fieldKey,
  shipment,
  styleFor,
  labelW = LABEL_W,
}: InvoiceRowProps) {
  const toast = useToast();
  const { updateShipment } = useShipmentMutations();
  const [open, setOpen] = useState(false);
  const value =
    fieldKey === "commercialInvoiceValue"
      ? shipment.civByCurrency || getFieldValue(shipment, "commercialInvoiceValue")
      : getFieldValue(shipment, fieldKey);
  return (
    <div className={ROW}>
      <span className={LABEL.replace(LABEL_W, labelW)}>{label}</span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex-1 min-w-0 text-left bg-transparent border-none p-0 cursor-pointer hover:underline ${
          value ? "text-slate-800" : EMPTY
        }`}
        style={value ? styleFor?.(fieldKey, value) ?? undefined : undefined}
      >
        {value || "—"}
      </button>
      <CommercialInvoicesModal
        shipment={open ? shipment : null}
        onClose={() => setOpen(false)}
        onSave={(s, commercialInvoices) =>
          updateShipment({ id: s.id, data: { commercialInvoices } }).catch((e) => {
            toast.error("Could not save the commercial invoices");
            throw e;
          })
        }
      />
    </div>
  );
}

interface RoRowProps {
  label: string;
  value?: string | null;
  labelW?: string;
  /** Wrap a long value onto more lines instead of fading it out. */
  wrap?: boolean;
  /** Shown after the value, e.g. the mark of a person who is no user. */
  mark?: React.ReactNode;
}

// Read-only horizontal row (label | value), matching FieldRow's look.
export function RoRow({ label, value, labelW = LABEL_W, wrap = false, mark }: RoRowProps) {
  const lbl = LABEL.replace(LABEL_W, labelW);
  return (
    <div className={wrap ? ROW_TOP : ROW}>
      <span className={wrap ? `${lbl} pt-[3px]` : lbl}>{label}</span>
      {value && wrap ? (
        <span className={`${VALUE} break-words`}>{value}</span>
      ) : value ? (
        <FadeText className="flex-1 text-slate-900 tabular-nums">{value}</FadeText>
      ) : (
        <span className={`flex-1 min-w-0 ${EMPTY}`}>—</span>
      )}
      {value && mark}
    </div>
  );
}

interface FieldColumnsProps {
  fields: FieldDef[];
  renderRow: (field: FieldDef) => React.ReactNode;
}

/**
 * The two-column field grid shared by "Show all" and the field picker, so the
 * two modals lay out identically and only differ in how a row is rendered.
 */
function FieldColumns({
  fields,
  renderRow,
}: FieldColumnsProps) {
  const half = Math.ceil(fields.length / 2);
  return (
    <div className={`${COLS2} max-h-[65vh] overflow-y-auto px-2`}>
      {[fields.slice(0, half), fields.slice(half)].map((col, i) => (
        <div key={i}>
          {col.map((f) => (
            <React.Fragment key={f.key}>{renderRow(f)}</React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

type FieldDef = { key: string; label: string; ro?: boolean };

interface DetailCardProps {
  icon: React.ReactNode;
  title: string;
  /** Kdyz je zadano, karta dostane "Show all" a tuzku pro vyber poli. */
  cardId?: string;
  columns: FieldDef[][];
  shipment: ShipmentItem;
  onCommit: CommitFn;
  styleFor?: StyleFor;
  // Extra rows to place directly above / below a given field, keyed by its field key.
  renderBefore?: Record<string, React.ReactNode>;
  renderAfter?: Record<string, React.ReactNode>;
  children?: React.ReactNode;
  /** Extra classes for the card, e.g. h-full for one of a pair side by side. */
  className?: string;
  /** "stack": all columns one under another in a single column (same field order). */
  layout?: "stack";
}

// A card of horizontal rows, optionally split into two columns.
export function DetailCard({
  icon,
  title,
  cardId,
  columns,
  shipment,
  onCommit,
  styleFor,
  renderBefore,
  renderAfter,
  children,
  className,
  layout,
}: DetailCardProps) {
  const { visibleKeys } = useCardFields();
  const allFields = columns.flat();
  const shown = cardId
    ? new Set(visibleKeys(cardId, allFields.map((f) => f.key)))
    : null;

  const shownColumns = layout === "stack" ? [allFields] : columns;

  return (
    <div className={`${CARD} ${className ?? ""}`}>
      <SectionHeader
        icon={icon}
        title={title}
        cardId={cardId}
        allFields={cardId ? allFields : undefined}
        shipment={shipment}
        onCommit={onCommit}
        styleFor={styleFor}
      />
      <div className={CARD_BODY}>
      <div className={shownColumns.length > 1 ? COLS2 : ""}>
        {shownColumns.map((col, i) => (
          <div key={i} className="min-w-0">
            {col.filter((f) => !shown || shown.has(f.key)).map((f) => (
              <React.Fragment key={f.key}>
                {renderBefore?.[f.key]}
                {INVOICE_FIELDS.has(f.key) ? (
                  <InvoiceRow label={f.label} fieldKey={f.key} shipment={shipment} styleFor={styleFor} />
                ) : f.ro ? (
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

interface HouseBolReleaseRowProps {
  releasedAt: string;
  onRelease: () => void;
}

// House BoL release: a one-off action rather than an editable field. Until it is
// released it shows the button; afterwards it shows who released it and when.
function HouseBolReleaseRow({ releasedAt, onRelease }: HouseBolReleaseRowProps) {
  return (
    <div className={ROW}>
      <span className={LABEL}>
        House BoL Release
      </span>
      <div className="flex-1 min-w-0">
        {releasedAt ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
            <CheckCircleOutlined /> Released by {releasedAt}
          </span>
        ) : (
          <Button
            size="small"
            onClick={onRelease}
            className="!h-6 !px-2.5 !text-[12px] !font-semibold !text-indigo-600 !border-indigo-200 !bg-white hover:!bg-indigo-50 hover:!border-indigo-300"
          >
            RELEASE BoL
          </Button>
        )}
      </div>
    </div>
  );
}


interface OpeningHoursRowProps {
  from?: string | null;
  to?: string | null;
  onChange: (from: string, to: string) => void;
}

// Opening hours as a plain time range (from–to), no date, rendered as a card row.
function OpeningHoursRow({
  from,
  to,
  onChange,
}: OpeningHoursRowProps) {
  const parse = (v?: string | null) => {
    if (!v) return null;
    const d = dayjs(`1970-01-01T${v}`);
    return d.isValid() ? d : null;
  };
  return (
    <div className={ROW}>
      <span className={LABEL}>Opening Hours</span>
      <div className="flex-1 min-w-0">
        <TimePicker.RangePicker
          size="small"
          className="w-full !border-slate-300 hover:!border-indigo-400 [&_input::placeholder]:!text-slate-400"
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
  { key: "pickupDate", label: "Pick-Up Date" },
];
const KEY_DATES_R: FieldDef[] = [
  { key: "estimatedDepartureWeek", label: "Est. Departure Week", ro: true },
  { key: "actualDepartureWeek", label: "Actual Departure Week", ro: true },
  { key: "estimatedArrivalWeek", label: "Est. Arrival Week", ro: true },
  { key: "actualArrivalWeek", label: "Actual Arrival Week", ro: true },
  { key: "closingDate", label: "Closing Date (Cargo Closing)" },
  { key: "vgmClosing", label: "VGM Closing" },
  { key: "siClosing", label: "SI Closing" },
  { key: "amsDeadline", label: "AMS Deadline" },
  { key: "isfDeadline", label: "ISF Deadline" },
  { key: "plannedDeliveryDate", label: "Planned Delivery" },
];
/** Equipment & Depot dle mockupu (id "equip") */
const EQUIP_DEPOT_L: FieldDef[] = [
  { key: "releaseReference", label: "Release Reference" },
  { key: "releaseDepot", label: "Release Depot" },
  { key: "plateNumber", label: "Plate Number" },
];
const EQUIP_DEPOT_R: FieldDef[] = [
  { key: "redeliveryReference", label: "Redelivery Reference" },
  { key: "redeliveryDepot", label: "Redelivery Depot" },
  { key: "equipmentDeliveryDate", label: "Equipment Delivery/Pick-Up Date" },
];

const REFS_ROUTING: FieldDef[] = [
  { key: "personalReference", label: "Personal Reference" },
  { key: "bookingNumber", label: "Booking Number" },
  { key: "pol", label: "POL" },
  { key: "pod", label: "POD" },
  { key: "origin", label: "Origin" },
  { key: "destination", label: "Destination" },
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
// The Quote card is read-only: it shows the quote uploaded in the Costs Breakdown tab, and its
// selling, buying and profit are that tab's totals.
const QUOTE_L: FieldDef[] = [
  { key: "salesNumber", label: "Sales Reference", ro: true },
  { key: "selling", label: "Total Selling Costs", ro: true },
  { key: "buying", label: "Total Buying Costs", ro: true },
  { key: "profit", label: "Profit", ro: true },
];
const QUOTE_R: FieldDef[] = [
  { key: "quoteValidity", label: "Quote Validity", ro: true },
  { key: "validityStatus", label: "Validity Status", ro: true },
  { key: "salesPerson", label: "Sales Person", ro: true },
];
const COMPLIANCE_FIELDS: FieldDef[] = [
  { key: "vgm", label: "VGM" },
  { key: "shippingInstructions", label: "Shipping Instructions" },
  { key: "ams", label: "AMS (if any)" },
  { key: "isf", label: "ISF (if any)" },
  { key: "bolDraft", label: "BoL Draft" },
  { key: "claim", label: "Claim", ro: true },
];
// Stackability is not a field of its own: it is read from the Cargo Details dimension rows
// and shown above these (see the Cargo Handling card).
const CARGO_HANDLING_FIELDS: FieldDef[] = [
  { key: "dangerous", label: "Dangerous" },
  { key: "outOfGauge", label: "Out Of Gauge" },
  { key: "temperatureControlled", label: "Temperature Controlled" },
];
const DESTINATION_ROUTING_FIELDS: FieldDef[] = [
  { key: "hub", label: "HUB" },
  { key: "cfs", label: "CFS" },
];

/* ── Cargo & Commercial card (mirrors the standalone cargo-details design) ── */
// `ro` fields are read-only projections computed from the Container/Cargo
// Details rows (the value falls back to the stored legacy field for shipments
// that predate the detail tables).
type CargoField = { key: string; label: string; highlight?: boolean; ro?: boolean };

// Load type / freight mode / trade direction / service type / invoicing status
// moved to the Shipment Overview card (agreed overview mockup).
// Split so both columns hold about the same number of rows.
// Pieces, packages, HS code and description are filled in here when the shipment has no
// cargo or container lines yet; once it has, the lines compute them and win.
const CARGO_COMMERCIAL_L: CargoField[] = [
  { key: "pcs", label: "COLLI" },
  { key: "typeOfPackages", label: "Type of packages" },
  { key: "hsCode", label: "HS code", highlight: true },
  { key: "cargoDescription", label: "Cargo description", highlight: true },
  { key: "cargoOrigin", label: "Cargo origin" },
  { key: "commercialInvoice", label: "Commercial invoice number(s)" },
  { key: "commercialInvoiceValue", label: "Commercial invoice value" },
];
const CARGO_COMMERCIAL_R: CargoField[] = [
  { key: "containerTypeSummary", label: "Container type", ro: true },
  { key: "totalTeu", label: "Total TEU", ro: true },
  { key: "dimensionsSummary", label: "Dimensions", ro: true },
  { key: "insurance", label: "Insurance" },
  { key: "creditCheck", label: "Credit check" },
  { key: "approvedBy", label: "Approved by" },
];

interface CargoRowProps {
  field: CargoField;
  shipment: ShipmentItem;
  onCommit: CommitFn;
  styleFor?: StyleFor;
}

function CargoRow({
  field,
  shipment,
  onCommit,
  styleFor,
}: CargoRowProps) {
  if (INVOICE_FIELDS.has(field.key)) {
    return <InvoiceRow label={field.label} fieldKey={field.key} shipment={shipment} styleFor={styleFor} />;
  }
  const value = getFieldValue(shipment, field.key);
  // Approved by is a person, picked from the company's users.
  if (isPersonField(field.key)) {
    return <MemberRow label={field.label} fieldKey={field.key} value={value} onCommit={onCommit} />;
  }
  if (field.ro) {
    return (
      <div className={ROW}>
        <span className={LABEL}>{field.label}</span>
        <span
          className={`flex-1 min-w-0 ${
            value
              ? field.highlight
                ? "text-slate-900 bg-ok-softer px-1.5 py-px rounded"
                : "text-slate-900"
              : EMPTY
          }`}
          style={styleFor?.(field.key, value) ?? undefined}
        >
          {value || "—"}
        </span>
      </div>
    );
  }
  return (
    <div className={ROW}>
      <span className={LABEL}>{field.label}</span>
      <EditableCell
        className="flex-1 min-w-0"
        fieldKey={field.key}
        value={value}
        onCommit={onCommit}
        placeholder="—"
        displayClassName={
          field.highlight
            ? "text-slate-900 bg-ok-softer px-1.5 py-px rounded"
            : "text-slate-900"
        }
        emptyClassName={EMPTY}
        displayStyle={styleFor?.(field.key, value)}
      />
    </div>
  );
}

interface CargoCommercialCardProps {
  shipment: ShipmentItem;
  onCommit: CommitFn;
  styleFor?: StyleFor;
}

function CargoCommercialCard({
  shipment,
  onCommit,
  styleFor,
}: CargoCommercialCardProps) {
  const { visibleKeys } = useCardFields();
  const cargoShown = new Set(
    visibleKeys("cargo", [...CARGO_COMMERCIAL_L, ...CARGO_COMMERCIAL_R].map((f) => f.key)),
  );

  return (
    <div className={CARD}>
      <SectionHeader
        icon={<InboxOutlined />}
        title="Cargo & Commercial"
        cardId="cargo"
        allFields={[...CARGO_COMMERCIAL_L, ...CARGO_COMMERCIAL_R]}
        shipment={shipment}
        onCommit={onCommit}
        styleFor={styleFor}
      />
      <div className={`${CARD_BODY} ${COLS2}`}>
        {[CARGO_COMMERCIAL_L, CARGO_COMMERCIAL_R].map((col, i) => (
          <div key={i} className="min-w-0">
            {col.filter((f) => cargoShown.has(f.key)).map((f) => (
              <CargoRow key={f.key} field={f} shipment={shipment} onCommit={onCommit} styleFor={styleFor} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main component ── */

export function ShipmentDetailContent() {
  const toast = useToast();
  const { jobNumber } = useParams<{ jobNumber: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { updateField, updateShipment, deleteShipment, linkMasterJob, unlinkMasterJob } = useShipmentMutations();
  const [masterJobOpen, setMasterJobOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const canDelete = useCanDeleteShipments();
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

  // Read on its own: the page loads no list (a shipment opened by link need not be one of the newest).
  const { shipment, isLoading, notFound, error, reload } = useShipment(jobNumber);

  // The invoicing data loads with the shipment, so the Costs Breakdown tab has it at once.
  const { data: invoicingData } = useInvoicing(shipment?.id ?? null);
  // The quote the costs were copied from, as the billing settings remember it.
  const costsQuoteRef = (invoicingData?.billingSettings?.quoteRef ?? "").trim();

  // Totals of the Costs Breakdown tab, shown on the Quote card.
  const costs = useCostsData(shipment);
  // The quote uploaded there, whose details the Quote card shows: the invoicing data brings it.
  const costsQuote = invoicingData?.costsQuote ?? null;


  const visibleTabs = TABS;
  const TAB_KEYS = visibleTabs.map((t) => t.key);
  const rawTab = searchParams.get("tab");
  const activeTab = rawTab && TAB_KEYS.includes(rawTab) ? rawTab : "details";

  // New alerts are counted on the Alerts tab; they are seen once the tab is open - also those
  // that come while it is.
  const { newCount: newAlerts, markRead: markAlertsRead } = useShipmentAlerts(shipment?.id ?? "");
  useEffect(() => {
    if (activeTab === "alerts" && newAlerts > 0) markAlertsRead();
  }, [activeTab, newAlerts, markAlertsRead]);

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
        {/* "Not found" is said only when the server said so; a request that failed is tried again. */}
        {notFound ? (
          "Shipment not found."
        ) : (
          <>
            Could not load the shipment - {error}.{" "}
            <Button size="small" onClick={() => reload()}>
              Retry
            </Button>
          </>
        )}{" "}
        <Link href="/shipments" className="text-indigo-500">
          Back to list
        </Link>
      </div>
    );
  }

  // The shipment goes along: it need not be among the rows the list hook knows.
  const handleCommit: CommitFn = (fieldKey, value, links) => updateField(shipment.id, fieldKey, value, shipment, links);

  // Update a party's name + its CRM customer link together.
  const linkParty = (party: PartyField, name: string, customerId: string | null) => {
    updateShipment({ id: shipment.id, data: partyUpdate(party, name, customerId) });
  };

  // A shipper's or consignee's Contact: its name with the contact's id (null for one typed by hand).
  const commitContact = (field: ContactField, name: string, contactId: string | null) =>
    updateShipment({ id: shipment.id, data: contactUpdate(field, name, contactId) });

  const styleFor = makeStyleFor(shipment);
  // The quote the shipment was sold from is the one its Sales Number names, when that is the
  // reference of a sales quote.
  const salesNumber = (shipment.salesNumber ?? "").trim();
  const salesQuoteRef = isSalesQuoteRef(salesNumber) ? salesNumber : null;

  const handleAssignMasterJob = async (ids: string[], mczNumber: string) => {
    try {
      await Promise.all(ids.map((id) => linkMasterJob({ shipmentId: id, mczNumber })));
      toast.success(`Linked to ${mczNumber}`);
      setAssignOpen(false);
    } catch {
      toast.error("Failed to link to master job");
    }
  };

  const handleUnlinkMasterJob = async () => {
    try {
      await unlinkMasterJob(shipment.id);
      toast.success("Removed from master job");
    } catch {
      toast.error("Failed to remove from master job");
    }
  };

  // Releasing stamps the acting user server-side, so the browser only triggers
  // it and refreshes.
  const confirmReleaseHouseBol = async () => {
    setReleasing(true);
    try {
      await api.shipments.shipmentReleaseHouseBol(shipment.id);
      await queryClient.invalidateQueries({ queryKey: ["shipments"] });
      toast.success("House BoL released");
      setReleaseOpen(false);
    } catch {
      toast.error("Failed to release the House BoL");
    } finally {
      setReleasing(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteShipment(shipment.id);
      toast.success("Order deleted");
      setDeleteOpen(false);
      router.push("/shipments");
    } catch {
      toast.error("Failed to delete order");
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

  // Shipment Status cells on this page offer only the shipment's Trade Direction statuses.
  const page = (
    <div className="bg-slate-50 min-h-full">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 pt-3.5 pb-0">
        {/* Top row: the actions, all one height and look, on the right. The way back to the
            list is the sidebar's Shipments item. */}
        <div className="flex items-center justify-end gap-x-6 gap-y-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Invoicing of this shipment, opened with the shipment already selected */}
            <Link href={`/invoicing?shipment=${shipment.id}`} className={HEADER_BTN}>
              <DollarOutlined />
              Invoice
            </Link>

            {/* The shipment's quote, shown once: the sales quote in its Sales Number, with a link
                to its page. A shipment without one may still carry the reference its costs were
                copied from (Costs tab > Copy from quote): that is named as what it is, and is not
                made the shipment's quote. */}
            {salesQuoteRef ? (
              <SalesQuoteLink shipmentId={shipment.id} quoteNumber={salesQuoteRef} />
            ) : isSalesQuoteRef(costsQuoteRef) ? (
              <Link href={quoteHref(costsQuoteRef)} className={HEADER_BTN}>
                <SplitCellsOutlined />
                Costs copied from {costsQuoteRef}
              </Link>
            ) : (
              // Anything else is a reference of the old quotes module: it has no page to lead to.
              costsQuoteRef && <span className="text-[13px] text-slate-500 whitespace-nowrap">Costs copied from {costsQuoteRef}</span>
            )}

            {/* Notes */}
            <Tooltip title="Notes">
              <button onClick={() => setNotesOpen(true)} className={HEADER_ICON_BTN}>
                <FileTextOutlined />
              </button>
            </Tooltip>

            {/* Attachments */}
            <Tooltip title="Attachments">
              <button onClick={() => setAttachmentsOpen(true)} className={HEADER_ICON_BTN}>
                <PaperClipOutlined />
              </button>
            </Tooltip>

            {/* Actions dropdown: its one action is delete, which is for managers and up */}
            {canDelete && (
              <Dropdown menu={actionsMenu} trigger={["click"]}>
                <button className={HEADER_BTN}>
                  Actions <DownOutlined className="text-[10px]" />
                </button>
              </Dropdown>
            )}
          </div>
        </div>

        {/* The shipment at a glance - its job number first - above the tabs, on every tab */}
        <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/20 shadow-sm px-5 pt-3 pb-2.5">
          <ShipmentFacts shipment={shipment} />
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-3.5 -mb-px overflow-x-auto">
          {visibleTabs.map((tab) => (
            <div
              key={tab.key}
              // A plain tab click forgets an earlier jump to a container, so Cargo Details
              // opens at the top like every other tab.
              onClick={() => {
                setCargoFocusId(null);
                setActiveTab(tab.key);
              }}
              className={`px-[9px] min-[1400px]:px-3.5 2xl:px-4 py-3 text-[14px] min-[1400px]:text-[14px] whitespace-nowrap cursor-pointer transition-colors duration-150 border-b-2 ${
                activeTab === tab.key
                  ? "font-semibold text-indigo-600 border-indigo-600"
                  : "font-medium text-slate-500 border-transparent hover:text-slate-800"
              }`}
            >
              {tab.key === "alerts" && newAlerts > 0 ? (
                <Badge count={newAlerts} size="small" color="#ef4444" offset={[8, -2]} title={`${newAlerts} new`}>
                  <span className="text-inherit">{tab.label}</span>
                </Badge>
              ) : (
                tab.label
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="px-4 md:px-6 pt-4 pb-8">
        {activeTab === "details" && (
          <div className="space-y-4">
            {/* The shipment's progress through its stages */}
            <ShipmentProgress shipment={shipment} />

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_296px] 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
            {/* ── MAIN COLUMN ── the cards in the order a shipment is worked: overview, dates,
                parties, transport documents, equipment, quote, cargo, admin. Cards side by side
                stretch to one height, so the page has no holes. */}
            <div className="@container flex flex-col gap-4 min-w-0">
              {/* SHIPMENT OVERVIEW */}
              <div className={CARD}>
                {/* Column order mirrors the agreed overview mockup 1:1 — left is
                    "who and what", right is "where, when and in which state".
                    Fields are declared as a list so the field chooser can filter them. */}
                {(() => {
                  const left: FieldDef[] = [
                    { key: "jobNumber", label: "Internal Reference", ro: true },
                    { key: "masterJob", label: "Master Job", ro: true },
                    { key: "tradeDirection", label: "Trade Direction" },
                    { key: "freightMode", label: "Freight Mode" },
                    { key: "loadType", label: "Load Type" },
                    { key: "serviceType", label: "Service Type" },
                    { key: "customerReference", label: "Customer Reference" },
                    { key: "salesNumber", label: "Sales Reference" },
                    { key: "serviceName", label: "Service Name" },
                    { key: "customer", label: "Customer", ro: true },
                    // Picked from the customer's contacts (the contact cell), with its card on hover.
                    { key: "customerPic", label: "Customer's PIC" },
                    { key: "shipper", label: "Shipper", ro: true },
                    { key: "consignee", label: "Consignee", ro: true },
                    { key: "personInCharge", label: "Handled By" },
                    { key: "salesPerson", label: "Sales Person", ro: true },
                    { key: "incoterm", label: "Incoterms Origin/Destination", ro: true },
                    { key: "freeComments", label: "Free Comments" },
                    { key: "freightPayableAt", label: "Freight Payable At" },
                  ];
                  const right: FieldDef[] = [
                    { key: "status", label: "Shipment Status" },
                    // Follows the paperwork; its manual steps are set in the Customs tab.
                    { key: "customsStatus", label: "Customs Status", ro: true },
                    { key: "invoicingStatus", label: "Invoicing Status" },
                    { key: "pol", label: "POL" },
                    { key: "estimatedDeparture", label: "ETD Estimated" },
                    { key: "estimatedDepartureWeek", label: "Est. Departure Week", ro: true },
                    { key: "pod", label: "POD" },
                    { key: "estimatedArrival", label: "ETA Estimated" },
                    { key: "estimatedArrivalWeek", label: "Est. Arrival Week", ro: true },
                    { key: "shipmentsDate", label: "Shipments Month", ro: true },
                    { key: "shipmentsYear", label: "Year", ro: true },
                    { key: "shippingLine", label: "Shipping line / Coloader" },
                    { key: "containerNumber", label: "Container Number", ro: true },
                    { key: "sealNumber", label: "Seal Number", ro: true },
                    { key: "masterBolNumber", label: "Master BoL Number" },
                    { key: "houseBolNumber", label: "House BoL Number" },
                  ];

                  // Radky, ktere nejsou obycejny FieldRow
                  const custom: Record<string, React.ReactNode> = {
                    masterJob: (
                      <div className={ROW}>
                        <span className={LABEL}>Master Job</span>
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          {/* The app's link colour (antd's link), like Customer below. */}
                          {shipment.masterJobMczNumber ? (
                            <>
                              <button onClick={() => setMasterJobOpen(true)} className="text-link hover:underline cursor-pointer bg-transparent border-none p-0">
                                #{shipment.masterJobMczNumber}
                              </button>
                              <button onClick={handleUnlinkMasterJob} className="text-[10px] text-slate-400 hover:text-red-500 cursor-pointer bg-transparent border-none p-0">
                                unassign
                              </button>
                            </>
                          ) : (
                            <button onClick={() => setAssignOpen(true)} className="text-link hover:underline cursor-pointer bg-transparent border-none p-0 text-left">
                              + Assign to master job
                            </button>
                          )}
                        </div>
                      </div>
                    ),
                    customer: (
                      <CustomerLinkField label="Customer" customersOnly name={shipment.customer} customerId={shipment.customerId} onChange={(n, id) => linkParty("customer", n, id)} />
                    ),
                    shipper: (
                      <CustomerLinkField label="Shipper" name={shipment.shipper} customerId={shipment.shipperId} onChange={(n, id) => linkParty("shipper", n, id)} />
                    ),
                    consignee: (
                      <CustomerLinkField label="Consignee" name={shipment.consignee} customerId={shipment.consigneeId} onChange={(n, id) => linkParty("consignee", n, id)} />
                    ),
                    // Not a column of the Shipments grid, so getFieldValue knows no such key: read
                    // from the shipment itself. It is changed in the Quote card below, so an old
                    // name here is only marked.
                    salesPerson: (
                      <RoRow
                        label="Sales Person"
                        value={shipment.salesPerson}
                        mark={<UnlinkedPersonMark value={shipment.salesPerson} hint="pick one in the Quote card" />}
                      />
                    ),
                    incoterm: (
                      <div className={ROW}>
                        <span className={LABEL}>Incoterms Origin/Destination</span>
                        <FadeText className="flex-1 text-slate-800">
                          {shipment.incotermOrigin || shipment.incotermDestination
                            ? `${shipment.incotermOrigin || "—"}/${shipment.incotermDestination || "—"}`
                            : <span className={EMPTY}>—</span>}
                        </FadeText>
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
                        icon={<ProfileOutlined />}
                        title="Shipment Overview"
                        cardId="overview"
                        allFields={[...left, ...right]}
                        shipment={shipment}
                        onCommit={handleCommit}
                        styleFor={styleFor}
                        renderField={custom}
                      />
                      <div className={`${CARD_BODY} ${COLS2}`}>
                        <div className="min-w-0">{renderCol(left)}</div>
                        <div className="min-w-0">{renderCol(right)}</div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* KEY DATES */}
              <DetailCard icon={<CalendarOutlined />} title="Key Dates" cardId="dates" columns={[KEY_DATES_L, KEY_DATES_R]} shipment={shipment} onCommit={handleCommit} styleFor={styleFor} />

              {/* COMMERCIAL PARTIES */}
              <div className={CARD}>
                {(() => {
                  const left: FieldDef[] = [
                    { key: "shipper", label: "Shipper", ro: true },
                    { key: "shipperContact", label: "Contact", ro: true },
                    { key: "pickupAddress", label: "Pick-up Address" },
                    { key: "pickupPlace", label: "Pick-up Postcode / Country", ro: true },
                    { key: "shipperOpening", label: "Opening Hours", ro: true },
                  ];
                  const right: FieldDef[] = [
                    { key: "consignee", label: "Consignee", ro: true },
                    { key: "consigneeContact", label: "Contact", ro: true },
                    { key: "deliveryAddress", label: "Delivery Address" },
                    { key: "deliveryPlace", label: "Delivery Postcode / Country", ro: true },
                    { key: "consigneeOpening", label: "Opening Hours", ro: true },
                  ];
                  // A refused value (e.g. a CZ postcode that is not five digits) is rolled back and said.
                  const saveStop = (data: controllers.ShipmentUpdateRequest) =>
                    updateShipment({ id: shipment.id, data }).catch((err) => toast.error(apiErrorMessage(err)));

                  const custom: Record<string, React.ReactNode> = {
                    pickupPlace: (
                      <StopPlaceRow
                        postcode={shipment.pickupPostcode}
                        country={shipment.pickupCountry}
                        onSave={(postcode, country) => saveStop({ pickupPostcode: postcode, pickupCountry: country })}
                      />
                    ),
                    deliveryPlace: (
                      <StopPlaceRow
                        postcode={shipment.deliveryPostcode}
                        country={shipment.deliveryCountry}
                        onSave={(postcode, country) => saveStop({ deliveryPostcode: postcode, deliveryCountry: country })}
                      />
                    ),
                    shipper: (
                      <CustomerLinkField label="Shipper" name={shipment.shipper} customerId={shipment.shipperId} onChange={(n, id) => linkParty("shipper", n, id)} />
                    ),
                    shipperContact: (
                      <PartyContactField label="Contact" value={shipment.shipperContact} contactId={shipment.shipperContactId} customerId={shipment.shipperId} onChange={(n, id) => commitContact("shipperContact", n, id)} />
                    ),
                    shipperOpening: (
                      <OpeningHoursRow
                        from={shipment.shipperOpeningFrom}
                        to={shipment.shipperOpeningTo}
                        onChange={(f, t) => updateShipment({ id: shipment.id, data: { shipperOpeningFrom: f, shipperOpeningTo: t } })}
                      />
                    ),
                    consignee: (
                      <CustomerLinkField label="Consignee" name={shipment.consignee} customerId={shipment.consigneeId} onChange={(n, id) => linkParty("consignee", n, id)} />
                    ),
                    consigneeContact: (
                      <PartyContactField label="Contact" value={shipment.consigneeContact} contactId={shipment.consigneeContactId} customerId={shipment.consigneeId} onChange={(n, id) => commitContact("consigneeContact", n, id)} />
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
                        icon={<ShopOutlined />}
                        title="Commercial Parties"
                        cardId="parties"
                        allFields={[...left, ...right]}
                        shipment={shipment}
                        onCommit={handleCommit}
                        styleFor={styleFor}
                        renderField={custom}
                      />
                      <div className={`${CARD_BODY} ${COLS2}`}>
                        <div className="min-w-0">{renderCol(left)}</div>
                        <div className="min-w-0">{renderCol(right)}</div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* CARRIER & BILL OF LADING  |  PARTIES & AGENTS */}
              <div className="grid grid-cols-1 @min-[760px]:grid-cols-2 gap-4">
                <DetailCard
                  icon={<FileProtectOutlined />}
                  title="Carrier & Bill of Lading"
                  cardId="carrier"
                  className="h-full"
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
                <DetailCard
                  icon={<TeamOutlined />}
                  title="Parties & Agents"
                  cardId="partiesAgents"
                  className="h-full"
                  columns={[PARTIES_AGENTS]}
                  shipment={shipment}
                  onCommit={handleCommit}
                  styleFor={styleFor}
                />
              </div>

              {/* REFERENCES & ROUTING  |  EQUIPMENT & DEPOT */}
              <div className="grid grid-cols-1 @min-[760px]:grid-cols-2 gap-4">
                <DetailCard
                  icon={<NodeIndexOutlined />}
                  title="References & Routing"
                  cardId="refsRouting"
                  className="h-full"
                  columns={[REFS_ROUTING]}
                  shipment={shipment}
                  onCommit={handleCommit}
                  styleFor={styleFor}
                />
                <DetailCard
                  icon={<ContainerOutlined />}
                  title="Equipment & Depot"
                  cardId="equip"
                  layout="stack"
                  className="h-full"
                  columns={[EQUIP_DEPOT_L, EQUIP_DEPOT_R]}
                  shipment={shipment}
                  onCommit={handleCommit}
                  styleFor={styleFor}
                />

              </div>

              {/* QUOTE — full width, the money of the shipment */}
              <div className={CARD}>
                {(() => {
                  // The money comes straight from the Costs Breakdown tab, in the billing currency.
                  // Without costs the row shows its empty "—", in the light grey every empty value has.
                  const amount = (v: number) => (costs.totals.hasAny ? `${money(v)} ${costs.billingCur}` : "");
                  // The rest is the quote uploaded there; nothing on this card is typed in. Ok while
                  // the quote is valid, Check once its date has passed (as Create shipment sets it).
                  const validUntil = costsQuote?.validUntil ?? null;
                  const validity = validUntil ? (validUntil >= businessToday() ? "Ok" : "Check") : null;
                  const custom: Record<string, React.ReactNode> = {
                    salesNumber: <RoRow key="salesNumber" label="Sales Reference" value={costsQuoteRef} />,
                    selling: <RoRow key="selling" label="Total Selling Costs" value={amount(costs.totals.sellTotal)} />,
                    buying: <RoRow key="buying" label="Total Buying Costs" value={amount(costs.totals.buyTotal)} />,
                    profit: <RoRow key="profit" label="Profit" value={amount(costs.totals.sellTotal - costs.totals.buyTotal)} />,
                    quoteValidity: <RoRow key="quoteValidity" label="Quote Validity" value={validUntil && formatDate(validUntil)} />,
                    validityStatus: <RoRow key="validityStatus" label="Validity Status" value={validity} />,
                    salesPerson: <RoRow key="salesPerson" label="Sales Person" value={costsQuote?.ownerName} />,
                  };
                  const allKeys = [...QUOTE_L, ...QUOTE_R].map((f) => f.key);
                  const shown = new Set(visibleCardKeys("quote", allKeys));
                  const renderCol = (col: FieldDef[]) =>
                    col.filter((f) => shown.has(f.key)).map((f) => <React.Fragment key={f.key}>{custom[f.key]}</React.Fragment>);

                  return (
                    <>
                      <SectionHeader
                        icon={<CalculatorOutlined />}
                        title="Quote"
                        cardId="quote"
                        allFields={[...QUOTE_L, ...QUOTE_R]}
                        shipment={shipment}
                        onCommit={handleCommit}
                        styleFor={styleFor}
                        renderField={custom}
                      />
                      <div className={`${CARD_BODY} ${COLS2}`}>
                        <div>{renderCol(QUOTE_L)}</div>
                        <div>{renderCol(QUOTE_R)}</div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* CARGO & COMMERCIAL */}
              <CargoCommercialCard shipment={shipment} onCommit={handleCommit} styleFor={styleFor} />

              {/* BASIC INFORMATION — admin of the job, at the bottom */}
              <div className={CARD}>
                {(() => {
                  const left: FieldDef[] = [
                    { key: "jobNumber", label: "Internal Reference", ro: true },
                    { key: "department", label: "Department" },
                  ];
                  const right: FieldDef[] = [
                    { key: "personInCharge", label: "Person In Charge" },
                    { key: "holidayCover", label: "Holiday Cover" },
                    { key: "createdBy", label: "Created By", ro: true },
                    { key: "createdOn", label: "Created On", ro: true },
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
                      <div className={`${CARD_BODY} ${COLS2}`}>
                        <div>{renderCol(left)}</div>
                        <div>{renderCol(right)}</div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* ── SIDEBAR ── cargo handling, the task list, then the checks */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 xl:self-stretch xl:content-start gap-4 items-start [--lw:118px]">
              {/* CARGO HANDLING — what the cargo needs, ahead of the tasks */}
              <DetailCard
                icon={<WarningOutlined />}
                title="Cargo Handling"
                columns={[CARGO_HANDLING_FIELDS]}
                shipment={shipment}
                onCommit={handleCommit}
                styleFor={styleFor}
                renderBefore={{
                  dangerous: (
                    <StackabilityRow
                      value={shipmentStackability(shipment.cargoDimensions ?? [])}
                      onPick={(stackable) => {
                        // A new row goes where the Dimensions dialog would put it: the first container, else the shipment.
                        const containerId = shipment.containers?.find((c) => c.id)?.id ?? null;
                        updateShipment({
                          id: shipment.id,
                          data: { cargoDimensions: withShipmentStackability(shipment.cargoDimensions ?? [], stackable, containerId) },
                        }).catch((err) => toast.error(apiErrorMessage(err)));
                      }}
                    />
                  ),
                }}
              />

              {/* TASKS — under Cargo Handling, ahead of the compliance checks */}
              <div className={CARD}>
                <SectionHeader icon={<CheckSquareOutlined />} title="Tasks" />
                <div className="px-4 pt-2.5 pb-2 min-h-0 overflow-y-auto">
                  <div className="text-[11px] uppercase tracking-[.03em] text-slate-500 font-medium mb-1">
                    {shipment.tradeDirection === "Export" ? "Export Workflow" : "Import Workflow"}
                  </div>
                  <TasksPanel shipment={shipment} />
                </div>
              </div>

              <DetailCard icon={<SafetyCertificateOutlined />} title="Compliance" cardId="compliance" columns={[COMPLIANCE_FIELDS]} shipment={shipment} onCommit={handleCommit} styleFor={styleFor} />
              <DetailCard icon={<HomeOutlined />} title="Destination Warehouse Routing" cardId="destinationRouting" columns={[DESTINATION_ROUTING_FIELDS]} shipment={shipment} onCommit={handleCommit} styleFor={styleFor} />
            </div>
          </div>
          </div>
        )}

        {activeTab === "cargo" && (
          // Keyed by the shipment, so opening another shipment starts the tab afresh.
          <CargoDetailsTab
            key={shipment.id}
            shipment={shipment}
            focusContainerId={cargoFocusId}
            // A refused line (e.g. a UN number that is not four digits) is rolled back and said.
            onChange={(data) =>
              updateShipment({ id: shipment.id, data }).catch((err) => {
                toast.error(apiErrorMessage(err));
                throw err;
              })
            }
          />
        )}

        {activeTab === "costs" && <CostsTab shipment={shipment} />}

        {activeTab === "documents" && <DocumentsTab shipment={shipment} />}

        {activeTab === "warehouse" && <WarehouseTab shipment={shipment} />}

        {activeTab === "tracking" && <TrackingTab shipment={shipment} />}

        {activeTab === "container" && (
          <ContainerDetailsTab
            shipment={shipment}
            // A refused save is said; the tab then shows the saved list again.
            onChange={(containers) =>
              updateShipment({ id: shipment.id, data: { containers } }).catch((err) => {
                toast.error(apiErrorMessage(err));
                throw err;
              })
            }
            onOpenCargo={(containerId) => {
              setCargoFocusId(containerId);
              setActiveTab("cargo");
            }}
          />
        )}

        {/* Only the Customs card: the documents are in the Documents tab, and customs reviews them in the Customs section. */}
        {activeTab === "customs" && <CustomsTab section="details" shipment={shipment} onCommit={handleCommit} />}

        {activeTab === "claim" && <ClaimsTab shipment={shipment} />}

        {activeTab === "alerts" && <NotificationsTab shipment={shipment} onOpen={setActiveTab} />}
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
        onLink={handleAssignMasterJob}
        initialSelectedIds={[shipment.id]}
      />

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
        onSave={(value) => handleCommit("freeComments", value)}
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
          <b className="tabular-nums">{shipment.jobNumber ?? shipment.id}</b>?
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
          Do you really want to delete order <b className="tabular-nums">{shipment.jobNumber ?? shipment.id}</b>?
        </p>
        <p className="text-sm text-slate-500 mt-2">
          The order is <b>not erased</b> — it is archived with all its details, and its reference can never be reused.
          This action is recorded against your account.
        </p>
      </Modal>
    </div>
  );
  return (
    <TradeDirectionContext.Provider value={shipment.tradeDirection ?? undefined}>
      <FreightModeContext.Provider value={shipment.freightMode ?? undefined}>
        <ShipmentCustomerContext.Provider value={shipment.customerId ?? null}>
          <ShipmentCustomerPicContext.Provider value={shipment.customerPicContactId ?? null}>{page}</ShipmentCustomerPicContext.Provider>
        </ShipmentCustomerContext.Provider>
      </FreightModeContext.Provider>
    </TradeDirectionContext.Provider>
  );
}
