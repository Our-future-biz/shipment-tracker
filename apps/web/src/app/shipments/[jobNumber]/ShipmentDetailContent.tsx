"use client";

import React, { useEffect, useRef, useState } from "react";
import { contactUpdate, partyUpdate, type ContactField, type ContactLinks, type PartyField } from "@/app/shipments/_lib/parties";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Alert, Badge, ConfigProvider, Spin, Dropdown, Modal, Tooltip, Select, TimePicker, Button } from "antd";
import { useToast } from "@/lib/toast";
import dayjs from "dayjs";
import { api, apiErrorMessage } from "@/lib/api";
import {
  DownOutlined,
  InfoCircleOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  ContainerOutlined,
  SplitCellsOutlined,
  ControlOutlined,
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
import { useAuth, useCanDeleteShipments } from "@/lib/auth/AuthContext";
import { canChangeShipmentDetails, isApprovedByLocked, isCreditCheckLocked, SALES_REFERENCE_LOCKED_HINT, salesReferenceLocked } from "@/lib/shipmentEditRule";
import { useInvoiceDocList } from "@/hooks/useInvoiceDocs";
import { isOpenInvoice } from "@/app/invoicing/_lib/openInvoices";
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
import { InvoicePanel } from "@/app/invoicing/_components/InvoicePanel";
import { AppModal } from "@/components/AppModal";
import { BackLink } from "@/components/BackLink";
import { useShipmentCameFrom } from "../_lib/shipmentCameFrom";
import { useCostsData } from "./tabs/useCostsData";
import { money } from "./tabs/costsCalc";
import { ContainerDetailsTab } from "./tabs/ContainerDetailsTab";
import { CargoDetailsTab } from "./tabs/CargoDetailsTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { TrackingTab } from "./tabs/TrackingTab";
import { TaxDateLockNote } from "./tabs/tracking/TaxDateLockNote";
import { NotificationsTab } from "./tabs/NotificationsTab";
import { useShipmentAlerts } from "@/hooks/useShipmentAlerts";
import { WarehouseTab } from "./tabs/WarehouseTab";
import { CustomsProcedureRow } from "./_components/CustomsProcedureRow";
import { CustomsTab } from "./tabs/CustomsTab";
import { ApprovedByLockedContext, CreditCheckLockedContext, EditableCell, ShipmentDetailsEditableContext, FreightModeContext, ShipmentCustomerContext, ShipmentCustomerPicContext, ShipmentEmailSubjectContext, TradeDirectionContext } from "./_components/EditableCell";
import { shipmentEmailSubject } from "../_lib/shipmentEmail";
import { MasterJobHoverCard } from "@/components/MasterJobHoverCard";
import { ConfirmModal } from "@/components/ConfirmModal";
import { LOCKED_BOX } from "@/components/LockedBox";
import { ReleasedMark } from "./_components/ReleasedMark";
import { PAIRED_FIELD, PairedColumns } from "./_components/PairedColumns";
import { FadeText } from "@/components/FadeText";
import { CustomerLinkField } from "./_components/CustomerLinkField";
import { PartyContactField } from "./_components/PartyContactField";
import { StopPlaceRow } from "./_components/StopPlaceRow";
import { SalesQuoteLink } from "./_components/SalesQuoteLink";
import type { controllers } from "@/lib/api/client";
import { TasksPanel } from "./_components/TasksPanel";
import { ShipmentFacts, ShipmentProgress } from "./_components/ShipmentSummary";
import { CARD, CARD_BODY, COLS2, EMPTY, HEADER_BTN, LABEL, LABEL_TOP, LABEL_W, REF_KEYS, REF_VALUE, ROW, ROW_TOP, VALUE } from "./_components/detailStyles";
import {
  BTN,
  BTN_GHOST,
  BTN_PRIMARY,
  BTN_SM,
  CARD as APP_CARD,
  CARD_BAR,
  CARD_ICON,
  CARD_TITLE,
  HINT,
  ICON_BTN_GHOST,
  LABEL_TEXT,
  LINK,
  MODAL_TITLE,
  REF,
} from "@/styles/ui";
import { MasterJobDialog, linkEach, linkedCount } from "../_components/MasterJobDialog";
import { NotesTab } from "./tabs/NotesTab";
import { useShipmentNotes } from "@/hooks/useShipmentNotes";
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
  { key: "notes", label: "Notes To-Do" },
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
        customsOffice={shipment!.customsOffice}
        shipmentId={shipment!.id}
      />
    );

  return (
    <>
      {/* The app's card header (Master Jobs, Warehouse, Claims): a light indigo bar with the
          icon, the title in caps and the card's tools. */}
      <div className={CARD_BAR}>
        <span className={`${CARD_ICON} shrink-0`}>{icon}</span>
        <h3 className={`${CARD_TITLE} min-w-0`}>
          {title}
        </h3>

        {hasTools && (
          <span className="ml-auto flex items-center gap-0.5 shrink-0">
            <button onClick={() => setShowAll(true)} className={`${BTN_GHOST} ${BTN_SM} tabular-nums`}>
              Show all ({allKeys.length})
            </button>
            <Tooltip title="Choose which fields appear in this card">
              <button
                onClick={() => setPicking(true)}
                className={`${ICON_BTN_GHOST} ${
                  isCustomised(cardId!) ? "!bg-white !text-indigo-600 ring-1 ring-inset ring-indigo-200" : ""
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
              <span className={MODAL_TITLE}>{title}</span>
              <span className={`ml-2 ${HINT} font-normal`}>
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
              <span className={MODAL_TITLE}>
                {title} — choose fields
              </span>
              <span className={`ml-2 ${HINT} font-normal`}>
                {shownCount} of {allKeys.length} in card
              </span>
            </span>
          }
          footer={
            <div className="flex items-center gap-3">
              <span className={`${HINT} mr-auto text-left`}>
                Unchecked fields stay available under “Show all”.
              </span>
              <button onClick={() => resetCard(cardId!)} className={BTN}>
                Show all fields
              </button>
              <button onClick={() => setPicking(false)} className={BTN_PRIMARY}>
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

// The Shipment Details, Cargo and Container tabs for someone who may not change them: every cell and
// picker read-only. Plain buttons are left alone: the ones that change something are not shown
// (the Cargo and Container tabs take `readOnly`), and the rest (a container's tab, a link, Per piece
// / All pieces) must keep working. What the departments keep up is enabled again inside
// (CustomsProcedureRow, InvoiceRow, the Tasks card).
function DetailsGuard({ editable, children }: { editable: boolean; children: React.ReactNode }) {
  if (editable) return <>{children}</>;
  return (
    <ShipmentDetailsEditableContext.Provider value={false}>
      <ConfigProvider componentDisabled>{children}</ConfigProvider>
    </ShipmentDetailsEditableContext.Provider>
  );
}

interface FieldRowProps {
  label: string;
  value?: string | null;
  fieldKey: string;
  onCommit: CommitFn;
  styleFor?: StyleFor;
  labelW?: string;
  /** For Customs Procedure: its row also holds the shipment's Customs Office. */
  customsOffice?: string | null;
  shipmentId?: string;
}

function FieldRow({
  label,
  value,
  fieldKey,
  onCommit,
  styleFor,
  labelW = LABEL_W,
  customsOffice,
  shipmentId = "",
}: FieldRowProps) {
  if (fieldKey === "customsProcedure") {
    return (
      <CustomsProcedureRow
        label={label}
        value={value}
        shipmentId={shipmentId}
        customsOffice={customsOffice}
        onCommit={onCommit}
        displayStyle={styleFor?.(fieldKey, value)}
        labelW={labelW}
      />
    );
  }
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

interface SalesReferenceRowProps {
  shipment: ShipmentItem;
  /** The quote the shipment's costs were copied from (Costs tab > Copy from quote). */
  costsQuoteRef: string;
  onCommit: CommitFn;
  styleFor?: StyleFor;
}

// The Sales Reference on the Quote card, edited as in the grid: the same field, the same request and the
// server's same rules (the details rule; the quote's owner becomes the Sales Person). An invoiced shipment
// keeps the offer it was invoiced from - marked Invoiced, or with an issued invoice not credited - until the
// invoice is credited: read-only, as the server refuses a change. Until the shipment names a quote, the one
// its costs were copied from shows in its place, in grey.
function SalesReferenceRow({ shipment, costsQuoteRef, onCommit, styleFor }: SalesReferenceRowProps) {
  const { data: docs } = useInvoiceDocList(shipment.id);
  const salesNumber = (shipment.salesNumber ?? "").trim();
  const invoiced = salesReferenceLocked(shipment.invoicingStatus) || (docs?.invoices ?? []).some(isOpenInvoice);
  if (invoiced) {
    const shown = salesNumber || costsQuoteRef;
    return (
      <div className={ROW} title={SALES_REFERENCE_LOCKED_HINT}>
        <span className={LABEL}>Sales Reference</span>
        {shown ? <FadeText className="flex-1 text-slate-900 tabular-nums">{shown}</FadeText> : <span className={`flex-1 min-w-0 ${EMPTY}`}>—</span>}
      </div>
    );
  }
  return (
    <div className={ROW}>
      <span className={LABEL}>Sales Reference</span>
      <EditableCell
        className="flex-1 min-w-0"
        fieldKey="salesNumber"
        value={salesNumber}
        onCommit={onCommit}
        placeholder={costsQuoteRef || "—"}
        displayClassName="text-slate-900"
        emptyClassName={costsQuoteRef ? "text-slate-500" : EMPTY}
        displayStyle={styleFor?.("salesNumber", salesNumber)}
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
  const editable = React.useContext(ShipmentDetailsEditableContext);
  const [editing, setEditing] = useState(false);
  return (
    <div className={ROW_TOP}>
      <span className={LABEL_TOP}>Cargo Stackability</span>
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
          className={`flex-1 min-w-0 rounded px-1 -mx-1 transition-colors text-slate-900 break-words ${
            value === NOT_STACKABLE ? "bg-amber-500/15" : editable ? "hover:bg-slate-100" : ""
          } ${editable ? "cursor-pointer" : ""}`}
          title={editable ? "Double-click to edit" : undefined}
          onDoubleClick={editable ? () => setEditing(true) : undefined}
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
  const approvedByLocked = React.useContext(ApprovedByLockedContext);
  const editable = React.useContext(ShipmentDetailsEditableContext);
  // Like every field of the page: read as text, picked after a double click, closed by a click elsewhere.
  const [editing, setEditing] = useState(false);
  return (
    <div className={ROW}>
      <span className={LABEL.replace(LABEL_W, labelW)}>{label}</span>
      {fieldKey === "approvedBy" && approvedByLocked ? (
        <span className="flex-1 min-w-0 truncate text-[13px] text-slate-900" title="The credit check is approved: only a manager can change or delete this">
          {person || "—"}
        </span>
      ) : editing ? (
        <div
          className="flex-1 min-w-0"
          onKeyDownCapture={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
        >
          <UserPicker
            size="small"
            autoFocus
            defaultOpen
            placeholder="—"
            className="w-full text-[13px]"
            popupMatchSelectWidth={false}
            aria-label={label}
            value={person}
            onChange={(email) => {
              setEditing(false);
              const next = personChange(value, email);
              if (next !== null) onCommit(fieldKey, next);
            }}
            onBlur={() => setEditing(false)}
          />
        </div>
      ) : (
        <span
          className={`flex-1 min-w-0 flex items-center rounded px-1 -mx-1 transition-colors text-[13px] ${
            editable ? "cursor-pointer hover:bg-slate-100" : ""
          }`}
          title={editable ? "Double-click to edit" : undefined}
          onDoubleClick={editable ? () => setEditing(true) : undefined}
        >
          {person ? <FadeText className="text-slate-900">{person}</FadeText> : <span className={EMPTY}>—</span>}
          <UnlinkedPersonMark value={person} hint={editable ? "double-click to pick one" : "only a user can be picked"} />
        </span>
      )}
      {when && <span className="shrink-0 text-[11px] text-slate-500 whitespace-nowrap">{when}</span>}
    </div>
  );
}

// Invoice Number(s) / Invoice Value: shown from the shipment's commercial invoices and edited in
// the Invoices dialog (the same one the Shipments table opens).
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
    // Customs' own field (the server leaves it open to everyone): its dialog is not disabled with a
    // read-only card around it.
    <ConfigProvider componentDisabled={false}>
    <div className={ROW}>
      <span className={LABEL.replace(LABEL_W, labelW)}>{label}</span>
      {/* Opened by a double click, like every other field of the page. */}
      <span
        role="button"
        tabIndex={0}
        title="Double-click to edit"
        onDoubleClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setOpen(true);
        }}
        className={`flex-1 min-w-0 truncate rounded px-1 -mx-1 cursor-pointer hover:bg-slate-100 transition-colors ${
          value ? "text-slate-900" : EMPTY
        }`}
        style={value ? styleFor?.(fieldKey, value) ?? undefined : undefined}
      >
        {value || "—"}
      </span>
      <CommercialInvoicesModal
        shipment={open ? shipment : null}
        onClose={() => setOpen(false)}
        onSave={(s, commercialInvoices) =>
          updateShipment({ id: s.id, data: { commercialInvoices } }).catch((e) => {
            toast.error(`Could not save the invoices: ${apiErrorMessage(e)}`);
            throw e;
          })
        }
      />
    </div>
    </ConfigProvider>
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

// Container Number as a link: a click opens the job's Container Details tab, where each
// container is listed with its seal, type, packages, weight and volume.
function ContainerNumberLinkRow({ value, onOpen }: { value: string; onOpen: () => void }) {
  return (
    <div className={ROW}>
      <span className={LABEL}>Container Number</span>
      {value ? (
        <div className="flex-1 min-w-0 truncate">
          <button
            type="button"
            onClick={onOpen}
            title="Open Container Details"
            className={`${LINK} ${REF} font-medium cursor-pointer bg-transparent border-none p-0 text-left`}
          >
            {value}
          </button>
        </div>
      ) : (
        <span className={`flex-1 min-w-0 ${EMPTY}`}>—</span>
      )}
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
  /** Rows drawn in place of the plain field row, by field key. */
  renderField?: Record<string, React.ReactNode>;
  /** "stack": all columns one under another in a single column (same field order). */
  layout?: "stack";
  /** Two columns whose rows line up across (PairedColumns); a field and its extra rows are one cell. */
  paired?: boolean;
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
  renderField,
  children,
  className,
  layout,
  paired = false,
}: DetailCardProps) {
  const { visibleKeys } = useCardFields();
  const allFields = columns.flat();
  const shown = cardId
    ? new Set(visibleKeys(cardId, allFields.map((f) => f.key)))
    : null;

  const shownColumns = layout === "stack" ? [allFields] : columns;
  const fieldsOf = (col: FieldDef[]) => col.filter((f) => !shown || shown.has(f.key));
  const fieldRow = (f: FieldDef) =>
    renderField?.[f.key] ? (
      renderField[f.key]
    ) : INVOICE_FIELDS.has(f.key) ? (
      <InvoiceRow label={f.label} fieldKey={f.key} shipment={shipment} styleFor={styleFor} />
    ) : f.ro ? (
      <RoRow label={f.label} value={getFieldValue(shipment, f.key)} />
    ) : (
      <FieldRow label={f.label} fieldKey={f.key} value={getFieldValue(shipment, f.key)} onCommit={onCommit} styleFor={styleFor} customsOffice={shipment.customsOffice} shipmentId={shipment.id} />
    );
  const [pairedLeft, pairedRight] = shownColumns;
  const pairedCell = (f: FieldDef) => (
    <div key={f.key} className={PAIRED_FIELD}>
      {renderBefore?.[f.key]}
      {fieldRow(f)}
      {renderAfter?.[f.key]}
    </div>
  );

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
        renderField={renderField}
      />
      <div className={CARD_BODY}>
      {paired && pairedLeft && pairedRight && shownColumns.length === 2 ? (
        <PairedColumns className="" left={fieldsOf(pairedLeft).map(pairedCell)} right={fieldsOf(pairedRight).map(pairedCell)} />
      ) : (
        <div className={shownColumns.length > 1 ? COLS2 : ""}>
          {shownColumns.map((col, i) => (
            <div key={i} className="min-w-0">
              {fieldsOf(col).map((f) => (
                <React.Fragment key={f.key}>
                  {renderBefore?.[f.key]}
                  {fieldRow(f)}
                  {renderAfter?.[f.key]}
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      )}
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
          // A green Released mark; who released it and when show on hover.
          <ReleasedMark stamp={releasedAt} />
        ) : (
          // Red, as its confirmation: a release cannot be undone.
          <Button size="small" type="primary" danger onClick={onRelease}>
            Release Bill of Lading
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

// Opening hours as a plain time range (from–to), no date, rendered as a card row. It reads as text,
// as every other row; a double-click opens the picker, and picking (or closing it) locks it again.
function OpeningHoursRow({
  from,
  to,
  onChange,
}: OpeningHoursRowProps) {
  const editable = React.useContext(ShipmentDetailsEditableContext);
  const [editing, setEditing] = useState(false);
  const parse = (v?: string | null) => {
    if (!v) return null;
    const d = dayjs(`1970-01-01T${v}`);
    return d.isValid() ? d : null;
  };
  if (!editing) {
    // The range picker's frame stays drawn, locked: start → end, grey where a time is missing.
    return (
      <div className={ROW}>
        <span className={LABEL}>Opening Hours</span>
        <span
          className={`flex-1 min-w-0 ${editable ? "cursor-pointer" : ""}`}
          title={editable ? "Double-click to edit" : undefined}
          onDoubleClick={editable ? () => setEditing(true) : undefined}
        >
          <span className={`${LOCKED_BOX} w-full`}>
            <span className="flex items-center gap-3 min-w-0">
              <span className={from ? "" : "text-slate-400"}>{from || "Start time"}</span>
              <span className="text-slate-300">→</span>
              <span className={to ? "" : "text-slate-400"}>{to || "End time"}</span>
            </span>
            <ClockCircleOutlined className="text-slate-300 text-[12px]" />
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className={ROW}>
      <span className={LABEL}>Opening Hours</span>
      <div className="flex-1 min-w-0">
        <TimePicker.RangePicker
          size="small"
          className="w-full"
          format="HH:mm"
          minuteStep={15}
          autoFocus
          defaultOpen
          value={[parse(from), parse(to)]}
          onChange={(_, strs) => {
            onChange(strs[0] || "", strs[1] || "");
            setEditing(false);
          }}
          // Closed without a new range (click-away, Escape): back to the text - after the tick, so a
          // range confirmed with OK is passed on first.
          onOpenChange={(open) => {
            if (!open) setTimeout(() => setEditing(false), 0);
          }}
        />
      </div>
    </div>
  );
}

/* ── Field arrangement for the redesigned details tab ── */
const CARRIER_BOL: FieldDef[] = [
  { key: "bookingNumber", label: "Booking Number" },
  { key: "vessel", label: "Vessel" },
  { key: "voyage", label: "Voyage" },
  { key: "containerNumber", label: "Container Number", ro: true },
  { key: "carrierCode", label: "Carrier code", ro: true },
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
  { key: "amsDeadline", label: "AMS Deadline" },
  { key: "isfDeadline", label: "ISF Deadline" },
];
const KEY_DATES_R: FieldDef[] = [
  { key: "estimatedDepartureWeek", label: "Est. Departure Week", ro: true },
  { key: "actualDepartureWeek", label: "Actual Departure Week", ro: true },
  { key: "estimatedArrivalWeek", label: "Est. Arrival Week", ro: true },
  { key: "actualArrivalWeek", label: "Actual Arrival Week", ro: true },
  { key: "closingDate", label: "Closing Date (Cargo Closing)" },
  { key: "vgmClosing", label: "VGM Closing" },
  { key: "siClosing", label: "SI Closing" },
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
  { key: "equipmentDelivery", label: "Equipment Delivery/Pick-Up Address" },
  { key: "equipmentDeliveryDate", label: "Equipment Delivery/Pick-Up Date" },
];

const REFS_ROUTING: FieldDef[] = [
  { key: "personalReference", label: "Personal Reference" },
  { key: "pol", label: "Port of Loading" },
  { key: "pod", label: "Port of Discharge" },
  { key: "origin", label: "Origin" },
  { key: "destination", label: "Destination" },
];
const PARTIES_AGENTS: FieldDef[] = [
  { key: "customerPic", label: "Customer's PIC" },
  { key: "customerReference", label: "Customer Reference" },
  { key: "agent", label: "Agent" },
  { key: "agentPic", label: "Agent's PIC" },
  { key: "supplierPic", label: "Supplier's PIC" },
  { key: "customsProcedure", label: "Customs Procedure" },
];
// The Quote card shows the quote uploaded in the Costs Breakdown tab, and its selling, buying and
// profit are that tab's totals. Only the Sales Reference is edited here.
// The quote itself on the left, its money on the right.
const QUOTE_L: FieldDef[] = [
  // Edited here as in the grid (SalesReferenceRow); the rest of the card is read-only.
  { key: "salesNumber", label: "Sales Reference" },
  { key: "quoteValidity", label: "Quote Validity", ro: true },
  { key: "validityStatus", label: "Validity Status", ro: true },
  { key: "salesPerson", label: "Sales Person", ro: true },
];
const QUOTE_R: FieldDef[] = [
  { key: "selling", label: "Total Selling Costs", ro: true },
  { key: "buying", label: "Total Buying Costs", ro: true },
  { key: "profit", label: "Profit", ro: true },
];
const COMPLIANCE_FIELDS: FieldDef[] = [
  { key: "bookingConfirmation", label: "Booking Confirmation" },
  { key: "vgm", label: "VGM" },
  { key: "shippingInstructions", label: "Shipping Instructions" },
  { key: "insurance", label: "Insurance" },
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
  { key: "commercialInvoice", label: "Invoice Number(s)" },
];
const CARGO_COMMERCIAL_R: CargoField[] = [
  { key: "containerTypeSummary", label: "Container type", ro: true },
  { key: "totalTeu", label: "Total TEU", ro: true },
  { key: "dimensionsSummary", label: "Dimensions", ro: true },
  { key: "creditCheck", label: "Credit check" },
  { key: "approvedBy", label: "Approved by" },
  { key: "commercialInvoiceValue", label: "Invoice Value" },
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
                ? "text-slate-900 bg-emerald-50 px-1.5 py-px rounded"
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
            ? "text-slate-900 bg-emerald-50 px-1.5 py-px rounded"
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
  const rows = (col: CargoField[]) =>
    col.filter((f) => cargoShown.has(f.key)).map((f) => <CargoRow key={f.key} field={f} shipment={shipment} onCommit={onCommit} styleFor={styleFor} />);

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
      <PairedColumns left={rows(CARGO_COMMERCIAL_L)} right={rows(CARGO_COMMERCIAL_R)} />
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
  const [assignOpen, setAssignOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const canDelete = useCanDeleteShipments();
  const { user } = useAuth();
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
  // Where the page was opened from, by the id in its address: the way back beside Shipments.
  const cameFrom = useShipmentCameFrom(jobNumber);

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
  // The notepad's open to-dos: their count shows on the Notes tab.
  const { openCount: openNotes } = useShipmentNotes(shipment?.id ?? "");
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

  // From a Container Number link: the Container Details tab, seen from the top of the page.
  // The page glides up first (easing in and out) and the tab then fades in, so the shorter
  // tab does not make the page jump. With reduced motion asked for, it is all at once.
  const [containerFade, setContainerFade] = useState(false);
  // Issue invoice, opened from Costs Breakdown; it stays open while an invoice is being issued.
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueBusy, setIssueBusy] = useState(false);
  const closeIssue = () => {
    if (!issueBusy) setIssueOpen(false);
  };
  // The glide under way (its frame request and the listeners that stop it), so it can be stopped:
  // by another tab click, by the user's own scrolling, or by leaving the page.
  const glide = useRef<{ frame: number; stop: () => void } | null>(null);
  const stopGlide = () => glide.current?.stop();
  useEffect(() => () => glide.current?.stop(), []);
  // The fade belongs only to the opening from the link.
  useEffect(() => {
    if (activeTab !== "container") setContainerFade(false);
  }, [activeTab]);
  const openContainerTab = () => {
    if (glide.current) return; // already on its way
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const open = () => {
      // with reduced motion asked for, no fade either
      if (!reduced) setContainerFade(true);
      setActiveTab("container");
    };
    const from = window.scrollY;
    if (from < 2 || reduced) {
      window.scrollTo({ top: 0 });
      open();
      return;
    }
    const duration = Math.min(700, Math.max(380, from * 0.6));
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const t0 = performance.now();
    // The user scrolling meanwhile takes over: the glide stops and the tab opens where they are.
    const takeOver = () => {
      stop();
      open();
    };
    const stop = () => {
      if (glide.current) cancelAnimationFrame(glide.current.frame);
      glide.current = null;
      window.removeEventListener("wheel", takeOver);
      window.removeEventListener("touchstart", takeOver);
      window.removeEventListener("keydown", takeOver);
    };
    window.addEventListener("wheel", takeOver, { passive: true });
    window.addEventListener("touchstart", takeOver, { passive: true });
    window.addEventListener("keydown", takeOver);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      window.scrollTo({ top: Math.round(from * (1 - ease(t))) });
      if (t < 1) {
        if (glide.current) glide.current.frame = requestAnimationFrame(step);
      } else {
        stop();
        open();
      }
    };
    glide.current = { frame: requestAnimationFrame(step), stop };
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
        <Link href="/shipments" className={LINK}>
          Back to list
        </Link>
      </div>
    );
  }

  // The shipment goes along: it need not be among the rows the list hook knows.
  // At user level only the Person in Charge and the Holiday Cover change the details (the server holds to the same).
  const detailsEditable = canChangeShipmentDetails(user, shipment);
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

  // One request per shipment, each may be refused on its own (the details rule): the rest still link.
  const handleAssignMasterJob = async (ids: string[], mczNumber: string) => {
    const { linked, failed, error } = await linkEach(ids, (id) => linkMasterJob({ shipmentId: id, mczNumber }));
    if (failed === 0) {
      toast.success(`Linked to ${mczNumber}`);
      setAssignOpen(false);
      return;
    }
    if (linked > 0) toast.success(`Linked ${linkedCount(linked)} to ${mczNumber}`);
    toast.error(`${linkedCount(failed)} not linked to ${mczNumber}: ${apiErrorMessage(error)}`);
  };

  const confirmUnlinkMasterJob = async () => {
    setUnlinking(true);
    try {
      await unlinkMasterJob(shipment.id);
      toast.success("Removed from master job");
      setUnlinkOpen(false);
    } catch (e) {
      toast.error(`Failed to remove from master job: ${apiErrorMessage(e)}`);
    } finally {
      setUnlinking(false);
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
        {/* Top row: the way back to the grid on the left, the actions, all one height and look, on the right. */}
        <div className="flex items-center justify-between gap-x-6 gap-y-2 flex-wrap">
          {/* The page it was opened from (a master job, the Cockpit...), then the Shipments list, as on a customer's page. */}
          <div className="flex flex-wrap items-center gap-x-2">
            {cameFrom && (
              <>
                <BackLink href={cameFrom.href}>{cameFrom.label}</BackLink>
                <span aria-hidden className="text-[13px] text-slate-300">·</span>
              </>
            )}
            <BackLink href="/shipments" arrow={!cameFrom}>Shipments</BackLink>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
        <div className={`${APP_CARD} mt-3 px-5 pt-3 pb-2.5`}>
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
                stopGlide();
                setCargoFocusId(null);
                setActiveTab(tab.key);
              }}
              // RecordTabs' look; its own strip for the Alerts count and the Cargo jump reset.
              className={`px-[9px] min-[1400px]:px-3.5 2xl:px-4 py-2.5 text-[13px] whitespace-nowrap cursor-pointer transition-colors border-b-2 ${
                activeTab === tab.key
                  ? "font-semibold text-indigo-600 border-indigo-600"
                  : "font-medium text-slate-500 border-transparent hover:text-slate-900"
              }`}
            >
              {tab.key === "alerts" && newAlerts > 0 ? (
                <Badge count={newAlerts} size="small" color="#ef4444" offset={[8, -2]} title={`${newAlerts} new`}>
                  <span className="text-inherit">{tab.label}</span>
                </Badge>
              ) : tab.key === "notes" && openNotes > 0 ? (
                // The open to-dos, as the Alerts tab shows its new alerts.
                <Badge count={openNotes} size="small" color="#ef4444" offset={[8, -2]} title={`${openNotes} open`}>
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
        {!detailsEditable && (activeTab === "details" || activeTab === "cargo" || activeTab === "container") && (
          <Alert
            type="info"
            showIcon
            className="mb-4"
            message="View only: only the user in Handled By or Holiday Cover, or a manager, can change its details."
          />
        )}
        {activeTab === "details" && (
          <DetailsGuard editable={detailsEditable}>
          <div className="space-y-4">
            {/* The shipment's progress through its stages */}
            <ShipmentProgress shipment={shipment} />

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_296px] 2xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
            {/* ── MAIN COLUMN ── the cards in the order a shipment is worked: overview, commercial parties, dates,
                parties, transport documents, equipment, quote, cargo, admin. Cards side by side
                stretch to one height, so the page has no holes. */}
            {/* Labels 160px wide from lg up, so "Shipping line / Coloader" or "Incoterms Destination" keep to one line. */}
            <div className="@container flex flex-col gap-4 min-w-0 lg:[--lw:160px]">
              {/* SHIPMENT OVERVIEW */}
              <div className={CARD}>
                {/* Column order mirrors the agreed overview mockup 1:1 — left is
                    "who and what", right is "where, when and in which state".
                    Fields are declared as a list so the field chooser can filter them. */}
                {(() => {
                  const left: FieldDef[] = [
                    // Internal Reference is in Basic Information.
                    { key: "masterJob", label: "Master Job", ro: true },
                    { key: "freightMode", label: "Freight Mode" },
                    { key: "tradeDirection", label: "Trade Direction" },
                    { key: "loadType", label: "Load Type" },
                    { key: "serviceType", label: "Service Type" },
                    { key: "customer", label: "Customer", ro: true },
                    // Picked from the customer's contacts (the contact cell), with its card on hover.
                    { key: "customerPic", label: "Customer's PIC" },
                    { key: "customerReference", label: "Customer Reference" },
                    { key: "serviceName", label: "Service Name" },
                    { key: "personInCharge", label: "Handled By" },
                    { key: "salesPerson", label: "Sales Person", ro: true },
                    { key: "incotermOrigin", label: "Incoterms Origin", ro: true },
                    { key: "incotermDestination", label: "Incoterms Destination", ro: true },
                    // Free Comments are kept in the Notes To-Do tab.
                    { key: "houseBolRelease", label: "House BoL Release" },
                  ];
                  const right: FieldDef[] = [
                    { key: "status", label: "Shipment Status" },
                    // Follows the paperwork; its manual steps are set in the Customs tab.
                    { key: "customsStatus", label: "Customs Status", ro: true },
                    { key: "invoicingStatus", label: "Invoicing Status" },
                    { key: "pol", label: "Port of Loading" },
                    { key: "estimatedDeparture", label: "ETD Estimated" },
                    { key: "pod", label: "Port of Discharge" },
                    { key: "estimatedArrival", label: "ETA Estimated" },
                    { key: "shipmentsDate", label: "Shipments Month", ro: true },
                    { key: "shipmentsYear", label: "Year", ro: true },
                    { key: "shippingLine", label: "Shipping line / Coloader" },
                    { key: "containerNumber", label: "Container Number", ro: true },
                    { key: "masterBolNumber", label: "Master BoL Number" },
                    { key: "houseBolNumber", label: "House BoL Number" },
                    { key: "freightPayableAt", label: "Freight Payable At" },
                  ];

                  // Radky, ktere nejsou obycejny FieldRow
                  const custom: Record<string, React.ReactNode> = {
                    houseBolRelease: (
                      <HouseBolReleaseRow releasedAt={shipment.houseBolRelease} onRelease={() => setReleaseOpen(true)} />
                    ),
                    masterJob: (
                      <div className={ROW}>
                        <span className={LABEL}>Master Job</span>
                        {/* Wraps, so a long reference (MCZCONSOL00000007) puts "remove" under it rather than over it. */}
                        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {/* The app's link colour (antd's link), like Customer below. */}
                          {shipment.masterJobMczNumber ? (
                            <>
                              {shipment.masterJobId ? (
                                <MasterJobHoverCard masterJobId={shipment.masterJobId} mczNumber={String(shipment.masterJobMczNumber)}>
                                  {/* A link, so it also opens in a new tab. */}
                                  <Link href={`/master-jobs?open=${shipment.masterJobId}`} className={`${REF} ${LINK}`}>
                                    {shipment.masterJobMczNumber}
                                  </Link>
                                </MasterJobHoverCard>
                              ) : (
                                <span className={REF}>{shipment.masterJobMczNumber}</span>
                              )}
                              {detailsEditable && (
                                <button onClick={() => setUnlinkOpen(true)} className="text-[12px] text-slate-500 hover:text-red-600 cursor-pointer bg-transparent border-none p-0">
                                  remove
                                </button>
                              )}
                            </>
                          ) : detailsEditable ? (
                            <button type="button" onClick={() => setAssignOpen(true)} className={`${BTN_PRIMARY} ${BTN_SM} !text-white hover:!text-white`}>
                              Link to master job
                            </button>
                          ) : (
                            <span className={EMPTY}>—</span>
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
                    containerNumber: (
                      <ContainerNumberLinkRow value={shipment.containerNumber} onOpen={openContainerTab} />
                    ),
                    // Worked out by the server from the shipping line, and no column of the grid either.
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
                        <FieldRow key={f.key} label={f.label} fieldKey={f.key} value={getFieldValue(shipment, f.key)} customsOffice={shipment.customsOffice} shipmentId={shipment.id} onCommit={handleCommit} styleFor={styleFor} />
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

              {/* COMMERCIAL PARTIES — narrow labels (the longest is "Postcode / Country"), so long addresses fit */}
              <div className={`${CARD} [--lw:136px]`}>
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
                        <FieldRow key={f.key} label={f.label} fieldKey={f.key} value={getFieldValue(shipment, f.key)} customsOffice={shipment.customsOffice} shipmentId={shipment.id} onCommit={handleCommit} styleFor={styleFor} />
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

              {/* KEY DATES */}
              <DetailCard
                icon={<CalendarOutlined />}
                title="Key Dates"
                cardId="dates"
                columns={[KEY_DATES_L, KEY_DATES_R]}
                paired
                // Wider labels so "Closing Date (Cargo Closing)" and "Actual Departure Week" keep to one line.
                className="lg:[--lw:196px]"
                shipment={shipment}
                onCommit={handleCommit}
                styleFor={styleFor}
                renderAfter={{
                  actualDeparture: <TaxDateLockNote shipmentId={shipment.id} />,
                  actualArrival: <TaxDateLockNote shipmentId={shipment.id} />,
                  plannedDeliveryDate: <TaxDateLockNote shipmentId={shipment.id} whenDeliveryDated />,
                }}
              />

              {/* CARRIER & BILL OF LADING  |  EQUIPMENT & DEPOT */}
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
                  renderField={{
                    // Not a column of the Shipments table, so read straight from the shipment.
                    carrierCode: <RoRow label="Carrier code" value={shipment.carrierCode} />,
                    containerNumber: (
                      <ContainerNumberLinkRow value={shipment.containerNumber} onOpen={openContainerTab} />
                    ),
                  }}
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

              {/* REFERENCES & ROUTING  |  PARTIES & AGENTS */}
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

              {/* CARGO & COMMERCIAL */}
              <CargoCommercialCard shipment={shipment} onCommit={handleCommit} styleFor={styleFor} />

              {/* QUOTE — full width, the money of the shipment */}
              <div className={CARD}>
                {(() => {
                  // The money comes straight from the Costs Breakdown tab, in the billing currency.
                  // Without costs the row shows its empty "—", in the light grey every empty value has.
                  const amount = (v: number) => (costs.totals.hasAny ? `${money(v)} ${costs.billingCur}` : "");
                  // The rest is the quote uploaded there; nothing else on this card is typed in. Ok while
                  // the quote is valid, Check once its date has passed (as Create shipment sets it).
                  const validUntil = costsQuote?.validUntil ?? null;
                  const validity = validUntil ? (validUntil >= businessToday() ? "Ok" : "Check") : null;
                  const custom: Record<string, React.ReactNode> = {
                    // The shipment's own Sales Reference, edited here as in the grid; without one, the quote its costs were copied from.
                    salesNumber: <SalesReferenceRow key="salesNumber" shipment={shipment} costsQuoteRef={costsQuoteRef} onCommit={handleCommit} styleFor={styleFor} />,
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
                      <PairedColumns left={renderCol(QUOTE_L)} right={renderCol(QUOTE_R)} />
                    </>
                  );
                })()}
              </div>

              {/* BASIC INFORMATION — admin of the job, at the bottom */}
              <div className={CARD}>
                {(() => {
                  const left: FieldDef[] = [
                    { key: "jobNumber", label: "Internal Reference", ro: true },
                    { key: "department", label: "Department" },
                    { key: "createdOn", label: "Created On", ro: true },
                  ];
                  const right: FieldDef[] = [
                    { key: "personInCharge", label: "Handled By" },
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
                        <FieldRow key={f.key} label={f.label} fieldKey={f.key} value={getFieldValue(shipment, f.key)} customsOffice={shipment.customsOffice} shipmentId={shipment.id} onCommit={handleCommit} styleFor={styleFor} />
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
                      <PairedColumns left={renderCol(left)} right={renderCol(right)} />
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
                // "Temperature Controlled" on one line.
                className="[--lw:170px]"
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
                  <div className={`${LABEL_TEXT} mb-1`}>
                    {shipment.tradeDirection === "Export" ? "Export Workflow" : "Import Workflow"}
                  </div>
                  {/* The ticks and what they open (Tell the customer, Record an event) go by the
                      server's own rules, not the details rule: not disabled with the card. */}
                  <ConfigProvider componentDisabled={false}>
                    <TasksPanel shipment={shipment} />
                  </ConfigProvider>
                </div>
              </div>

              <DetailCard icon={<SafetyCertificateOutlined />} title="Compliance" cardId="compliance" className="[--lw:150px]" columns={[COMPLIANCE_FIELDS]} shipment={shipment} onCommit={handleCommit} styleFor={styleFor} />
              <DetailCard icon={<HomeOutlined />} title="Destination Warehouse Routing" cardId="destinationRouting" columns={[DESTINATION_ROUTING_FIELDS]} shipment={shipment} onCommit={handleCommit} styleFor={styleFor} />
            </div>
          </div>
          </div>
          </DetailsGuard>
        )}

        {activeTab === "cargo" && (
          <DetailsGuard editable={detailsEditable}>
          {/* Keyed by the shipment, so opening another shipment starts the tab afresh. */}
          <CargoDetailsTab
            key={shipment.id}
            shipment={shipment}
            readOnly={!detailsEditable}
            focusContainerId={cargoFocusId}
            // A refused line (e.g. a UN number that is not four digits) is rolled back and said.
            onChange={(data) =>
              updateShipment({ id: shipment.id, data }).catch((err) => {
                toast.error(apiErrorMessage(err));
                throw err;
              })
            }
          />
          </DetailsGuard>
        )}

        {activeTab === "costs" && <CostsTab shipment={shipment} onIssueInvoice={() => setIssueOpen(true)} />}

        {/* Issue invoice from Costs Breakdown: Invoicing's own Invoice panel (same preview, checks,
            issuing and PDF), on this page instead of leading away to Invoicing. A click beside it
            leaves it open (the note, customer and DUZP picked stay); while an invoice is issued and
            its PDF downloaded it can't be closed at all, or the email step would be lost with it. */}
        <AppModal
          open={issueOpen}
          onClose={closeIssue}
          title="Issue invoice"
          size="xlarge"
          footer={null}
          maskClosable={false}
          closable={!issueBusy}
        >
          {/* Issued from the job itself: no note that the job is not released for Billing (Invoicing keeps it) */}
          <InvoicePanel shipment={shipment} section="invoice" billingStatusWarning={false} onOpenCosts={closeIssue} onBusyChange={setIssueBusy} />
        </AppModal>

        {activeTab === "documents" && <DocumentsTab shipment={shipment} />}

        {activeTab === "warehouse" && <WarehouseTab shipment={shipment} />}

        {activeTab === "tracking" && <TrackingTab shipment={shipment} onOpen={setActiveTab} />}

        {activeTab === "container" && (
          <div
            // Opened from a Container Number link: the tab fades in (CSS @starting-style).
            className={containerFade ? "transition-[opacity,translate] duration-300 ease-out starting:opacity-0 starting:translate-y-1.5" : undefined}
            onTransitionEnd={(e) => e.target === e.currentTarget && setContainerFade(false)}
          >
          <DetailsGuard editable={detailsEditable}>
          <ContainerDetailsTab
            shipment={shipment}
            readOnly={!detailsEditable}
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
          </DetailsGuard>
          </div>
        )}

        {/* Only the Customs card: the documents are in the Documents tab, and customs reviews them in the Customs section. */}
        {activeTab === "customs" && <CustomsTab section="details" shipment={shipment} onCommit={handleCommit} />}

        {activeTab === "claim" && <ClaimsTab shipment={shipment} />}

        {activeTab === "alerts" && <NotificationsTab shipment={shipment} onOpen={setActiveTab} />}

        {activeTab === "notes" && <NotesTab shipment={shipment} onSaveFreeComments={(value) => handleCommit("freeComments", value)} />}
      </div>

      <MasterJobDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        onLink={handleAssignMasterJob}
        initialSelectedIds={[shipment.id]}
      />

      <Modal
        open={unlinkOpen}
        title="Remove from master job?"
        okText="Yes, remove"
        okButtonProps={{ danger: true, loading: unlinking }}
        cancelText="Cancel"
        onOk={confirmUnlinkMasterJob}
        onCancel={() => setUnlinkOpen(false)}
        destroyOnHidden
      >
        <p className="text-[13px] text-slate-700">
          Do you really want to remove the shipment{" "}
          <b className={REF}>{shipment.jobNumber ?? shipment.id}</b> from master job{" "}
          <b className={REF}>{shipment.masterJobMczNumber}</b>?
        </p>
      </Modal>


      {/* The app's confirmation: the question once, in the title, and what the release does.
          Wide enough for the title on one line with the longest job number (CZPROJECT…). */}
      <ConfirmModal
        open={releaseOpen}
        danger
        width={520}
        title={
          <>
            Release the Bill of Lading for <span className={`${REF} font-bold`}>{shipment.jobNumber ?? shipment.id}</span>?
          </>
        }
        description="Your name and the current date and time are recorded as the release. This cannot be undone."
        confirmLabel="Release"
        loading={releasing}
        onConfirm={confirmReleaseHouseBol}
        onClose={() => setReleaseOpen(false)}
      />

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
        <p className="text-[13px] text-slate-700">
          Do you really want to delete order <b className={REF}>{shipment.jobNumber ?? shipment.id}</b>?
        </p>
        <p className="text-[13px] text-slate-500 mt-2">
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
          <ShipmentCustomerPicContext.Provider value={shipment.customerPicContactId ?? null}>
            <ShipmentEmailSubjectContext.Provider value={shipmentEmailSubject(shipment)}>
              <ApprovedByLockedContext.Provider value={isApprovedByLocked(user, shipment)}>
                <CreditCheckLockedContext.Provider value={isCreditCheckLocked(user, shipment)}>{page}</CreditCheckLockedContext.Provider>
              </ApprovedByLockedContext.Provider>
            </ShipmentEmailSubjectContext.Provider>
          </ShipmentCustomerPicContext.Provider>
        </ShipmentCustomerContext.Provider>
      </FreightModeContext.Provider>
    </TradeDirectionContext.Provider>
  );
}
