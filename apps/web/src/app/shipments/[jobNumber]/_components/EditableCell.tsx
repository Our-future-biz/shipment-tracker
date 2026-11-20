"use client";

import { createContext, useContext, useState, useRef } from "react";
import Link from "next/link";
import { EditableLink } from "@/components/EditableLink";
import { ConfigProvider, Input, Select, DatePicker, Tooltip } from "antd";
import { CalendarOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { LockedBox } from "@/components/LockedBox";
import type { InputRef } from "antd";
import dayjs from "dayjs";
import { DEPARTMENT_FIELDS } from "@/lib/shipmentEditRule";
import { COLUMN_MAP, geoKindOf, getFilteredStatusOptions, splitDateTime } from "@/lib/columnConfig";
import { GeoFlag, GeoSelect } from "@/components/GeoSelect";
import { FadeText } from "@/components/FadeText";
import { UserPicker } from "@/components/UserPicker";
import { CustomerContactPicker } from "@/components/CustomerContactPicker";
import { ContactHoverCard } from "@/components/ContactHoverCard";
import { UnlinkedPersonMark } from "@/app/shipments/_components/UnlinkedPersonMark";
import { businessToday, formatDate } from "@/lib/date";
import { offeredStatuses } from "@/app/shipments/_components/cancelReason";
import { statusLabel } from "@/lib/shipmentStatus";
import { BILLING_HINT, isBillingStatus } from "../../_components/billingRelease";
import { loadTypeLabel } from "@/lib/enums";
import { personChange, splitPersonStamp } from "@/app/shipments/_lib/personFields";
import { contactLinks, type ContactLinks } from "@/app/shipments/_lib/parties";
import { DateTimeEditor } from "./DateTimeEditor";
import { DATE_INPUT_FORMATS, leaveTypedDay, readTypedDay } from "./typedDate";

// Dates are stored as ISO "YYYY-MM-DD" (matches the native date input).
// Still tolerate legacy "MM/DD/YY" values for display prefill.
function toInputISO(s: string): string {
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = s.split("/");
  if (parts.length !== 3) return "";
  const mm = parts[0]!, dd = parts[1]!, yy = parts[2]!;
  if (!/^\d{1,2}$/.test(mm) || !/^\d{1,2}$/.test(dd) || !/^\d{1,4}$/.test(yy)) return "";
  const year = yy.length <= 2 ? `20${yy.padStart(2, "0")}` : yy;
  return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** A date with an optional time as two locked boxes, the date and the time apart; a double-click opens them. */
function DateTimeBoxes({ value, style, title }: { value: string; style?: React.CSSProperties; title?: string }) {
  const { date, time } = splitDateTime(value);
  return (
    // The boxes keep the width "24.11.2026" and "16:00" need: in a card too narrow for both (Key Dates
    // at 1440 px) the time goes under the date rather than both being cut (user council O5).
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0" title={title}>
      <LockedBox className="w-[118px] shrink-0" value={date ? formatDate(date) : ""} placeholder="Date" icon={<CalendarOutlined />} style={style} />
      <LockedBox className="w-[78px] shrink-0" value={time} placeholder="Time" icon={<ClockCircleOutlined />} style={style} />
    </span>
  );
}

/**
 * A date alone (ETD, ETA, ATD…): a day picked in the panel is saved at once; a day typed is saved by
 * Enter, Tab or a click elsewhere, as DD.MM.YYYY as the screens show it, D.M.YYYY, DD.MM.YY or
 * YYYY-MM-DD (user council O4 / E8 / M2), as the date + time editor saves it. Typing that isn't a
 * day keeps the editor open and says how to type it, where the picker alone did nothing and the old
 * date silently stayed. Escape, or leaving without typing, leaves it as it was.
 */
function DayEditor({ fieldKey, value, className, onCommit, onClose }: { fieldKey: string; value: string; className?: string; onCommit: (next: string) => void; onClose: () => void }) {
  const iso = toInputISO(value);
  const initial = iso ? dayjs(iso) : null;
  const [error, setError] = useState<string | null>(null);
  // The panel's open state is held here: the picker closing on a typed day that can't be read must
  // not close the editor, or the typing would go with it.
  const [open, setOpen] = useState(true);
  // What was typed into the box since it opened, or null. Only real typing fires input events; a
  // panel's hover preview, which writes into the box too, doesn't.
  const typed = useRef<string | null>(null);
  const escaped = useRef(false);
  // Tab confirms in the picker and then closes it: one save, not two.
  const finished = useRef(false);
  const blocked = PAST_DAY_FIELDS.has(fieldKey) ? (day: string) => dayBlocked(fieldKey, day, businessToday()) : undefined;
  const save = (day: string) => {
    if (finished.current) return;
    finished.current = true;
    onCommit(day);
  };
  const leave = () => {
    if (finished.current) return;
    const left = leaveTypedDay(typed.current, escaped.current, blocked);
    if ("close" in left) {
      finished.current = true;
      setOpen(false);
      onClose();
    } else if ("error" in left) setError(left.error);
    else save(left.day);
  };
  return (
    <Tooltip open={!!error} title={error ? <span role="alert">{error}</span> : null} placement="topLeft">
      <div
        className={className}
        onInput={(e) => {
          typed.current = (e.target as HTMLInputElement).value;
          escaped.current = false;
          setError(null);
        }}
        // Enter and Tab on typed text are read here, before the picker, which reads only its own
        // formats (and would take "26.11.26" for the year 26).
        onKeyDownCapture={(e) => {
          if (e.key === "Escape") {
            escaped.current = true;
            return;
          }
          if ((e.key !== "Enter" && e.key !== "Tab") || typed.current === null) return;
          e.stopPropagation();
          const read = readTypedDay(typed.current, blocked);
          // Tab moves on once the day is saved; Enter, or a day that can't be read, stays.
          if ("error" in read || e.key === "Enter") e.preventDefault();
          if ("error" in read) setError(read.error);
          else save(read.day);
        }}
      >
        <DatePicker
          size="small"
          autoFocus
          open={open}
          // Shown as on every screen (DD.MM.YYYY).
          format={DATE_INPUT_FORMATS}
          // A typed day that can't be read stays in the box beside its message, not the old date.
          preserveInvalidOnBlur
          status={error ? "error" : undefined}
          className="w-full min-w-[150px]"
          defaultValue={initial && initial.isValid() ? initial : undefined}
          disabledDate={blocked ? (d) => blocked(d.format("YYYY-MM-DD")) : undefined}
          // Commit only when a day is picked — browsing months/years keeps the panel open.
          onChange={(d) => save(d ? d.format("YYYY-MM-DD") : "")}
          // A click away or Escape closes the panel: what was typed is saved first (leaveTypedDay).
          onOpenChange={(next) => {
            if (next) setOpen(true);
            else leave();
          }}
        />
      </div>
    </Tooltip>
  );
}

/** "2026-11-20 12:00" → "20.11.2026 12:00"; a date alone → "20.11.2026". */
function shownDate(value: string): string {
  const { date, time } = splitDateTime(value);
  return time ? `${formatDate(date)} ${time}` : formatDate(value);
}

/**
 * Whether the user may change the details of the shipment around these cells (lib/shipmentEditRule).
 * Provided by the shipment page and per row by a grid. The departments' own fields stay editable
 * either way; a locked cell shows its value just as an open one does, with nothing to edit.
 */
export const ShipmentDetailsEditableContext = createContext(true);

/**
 * Whether Approved By of the shipment around these cells is closed to this user (lib/shipmentEditRule):
 * the credit check is approved. Provided by the shipment page and per row by a grid.
 */
export const ApprovedByLockedContext = createContext(false);

/** Whether the credit check around these cells is closed to this user: once approved, only a manager takes it back. */
export const CreditCheckLockedContext = createContext(false);

/**
 * The Trade Direction of the shipment a page shows. A Shipment Status cell inside it offers
 * only that direction's statuses (see getFilteredStatusOptions); without it, all of them.
 */
export const TradeDirectionContext = createContext<string | undefined>(undefined);

/**
 * The Freight Mode of the shipment a cell belongs to. By air, its POL and POD also offer IATA
 * airports beside the UN/LOCODE places; by sea, its Origin and Destination ocean terminals (CYs).
 */
export const FreightModeContext = createContext<string | undefined>(undefined);

/**
 * Whether Cancelled Shipment is offered in a Shipment Status cell inside it (mock test council n34,
 * cancelReason cancelOffered): not to a user on a job that reads Invoiced. Provided by the shipment
 * page and per row by a grid.
 */
export const CancelOfferedContext = createContext(true);

/**
 * The B/L dates that say when something happened (council finding m24): their picker offers no day
 * after today on the company's calendar, as the server refuses one (mock test council n34).
 */
const PAST_DAY_FIELDS = new Set(["originalsReceivedDate", "telexReleaseReceivedDate", "deliveryOrderDate"]);

/** Whether a day (YYYY-MM-DD) can't be picked in this field: one after `today` (Prague) in a B/L date. */
export const dayBlocked = (fieldKey: string, day: string, today: string): boolean => PAST_DAY_FIELDS.has(fieldKey) && day > today;
const AIRPORT_FIELDS = new Set(["pol", "pod"]);
const TERMINAL_FIELDS = new Set(["origin", "destination"]);

/**
 * What a place cell offers by the shipment's Freight Mode: by air, its POL and POD also IATA airports;
 * by sea, its Origin and Destination also terminals, and its POL and POD the seaports first (user
 * council O1 / S10, owner's answer Q3).
 */
export function placeListsOf(fieldKey: string, freightMode: string | undefined) {
  const air = /^air/i.test(freightMode ?? "");
  const sea = /^sea/i.test(freightMode ?? "");
  return { airports: AIRPORT_FIELDS.has(fieldKey) && air, terminals: TERMINAL_FIELDS.has(fieldKey) && sea, seaports: AIRPORT_FIELDS.has(fieldKey) && sea };
}

/**
 * The customer's Contacts tab with this contact picked out: by its id (?contactId=), or by its
 * name (?contact=) for a value stored before ids were kept.
 */
export const customerContactHref = (customerId: string, name: string, contactId?: string | null) =>
  contactId
    ? `/customers/${customerId}?tab=contacts&contactId=${encodeURIComponent(contactId)}`
    : `/customers/${customerId}?tab=contacts&contact=${encodeURIComponent(name.trim())}`;

/**
 * The Customer Database id of the customer of the shipment a page shows: a contact cell
 * (Customer's PIC) inside it offers that customer's contacts. A grid passes it per row instead.
 */
export const ShipmentCustomerContext = createContext<string | null | undefined>(undefined);

/** The id of the contact the Customer's PIC of the shipment a page shows is; a grid passes it per row. */
export const ShipmentCustomerPicContext = createContext<string | null | undefined>(undefined);

/** The subject of an email to the Customer's PIC of the shipment a page shows; a grid passes it per row. */
export const ShipmentEmailSubjectContext = createContext<string | undefined>(undefined);

interface EditableCellProps {
  /** columnConfig key (e.g. "shippingLine") — decides text vs dropdown. */
  fieldKey: string;
  value?: string | null;
  /** `links` come with a picked contact: its id, under the field that keeps it (customerPicContactId). */
  onCommit: (fieldKey: string, value: string, links?: ContactLinks) => void;
  /** Render a multi-line textarea (used by address blocks). */
  multiline?: boolean;
  /** Text shown when the value is empty. */
  placeholder?: string;
  /** A date with a time shows as two locked boxes (the detail cards); a grid row keeps it as one text. */
  dateTimeBoxes?: boolean;
  /** Class for the value text in display mode. */
  displayClassName?: string;
  /** Class for the placeholder text in display mode (falls back to displayClassName). */
  emptyClassName?: string;
  /** Class for the outer wrapper. */
  className?: string;
  /** Inline style for the value text in display mode (e.g. conditional-format colors). */
  displayStyle?: React.CSSProperties;
  /** The choices of a dropdown, when only some of the column's options are allowed here. */
  options?: string[];
  /** The shipment's customer, for a contact column; defaults to ShipmentCustomerContext. */
  customerId?: string | null;
  /** The stored contact's id, for a contact column; defaults to ShipmentCustomerPicContext. */
  contactId?: string | null;
  /** The subject of an email to the stored contact; defaults to ShipmentEmailSubjectContext. */
  emailSubject?: string;
}

export function EditableCell(props: EditableCellProps) {
  const editable = useContext(ShipmentDetailsEditableContext);
  const approvedByLocked = useContext(ApprovedByLockedContext);
  const creditCheckLocked = useContext(CreditCheckLockedContext);
  if ((props.fieldKey === "approvedBy" && approvedByLocked) || (props.fieldKey === "creditCheck" && creditCheckLocked)) return <EditableCellBody {...props} locked />;
  if (editable) return <EditableCellBody {...props} />;
  if (!DEPARTMENT_FIELDS.has(props.fieldKey)) return <EditableCellBody {...props} locked />;
  // A department's own field inside a read-only card: its picker isn't disabled with the card's.
  return (
    <ConfigProvider componentDisabled={false}>
      <EditableCellBody {...props} />
    </ConfigProvider>
  );
}

function EditableCellBody({
  fieldKey,
  value,
  onCommit,
  multiline = false,
  placeholder = "—",
  dateTimeBoxes = true,
  displayClassName = "text-slate-700 font-medium",
  emptyClassName,
  className,
  displayStyle,
  options: allowedOptions,
  customerId: customerIdProp,
  contactId: contactIdProp,
  emailSubject: emailSubjectProp,
  locked = false,
}: EditableCellProps & { locked?: boolean }) {
  const [editing, setEditing] = useState(false);
  // A contact cell stays open while its Add contact dialog is (the dialog takes the focus).
  const [addingContact, setAddingContact] = useState(false);
  const [draft, setDraft] = useState("");
  const cancelledRef = useRef(false);
  const inputRef = useRef<InputRef>(null);

  const col = COLUMN_MAP.get(fieldKey);
  const isDropdown = col?.type === "dropdown";
  // Tariff numbers hold digits only.
  const digitsOnly = fieldKey === "hsCode";
  const clean = (v: string) => (digitsOnly ? v.replace(/\D/g, "") : v);
  const isDate = col?.type === "date";
  // People are picked from the company's users and kept by e-mail.
  const isUser = col?.type === "user";
  // A customer's person is picked from that customer's saved contacts.
  const isContact = col?.type === "contact";
  const contextCustomerId = useContext(ShipmentCustomerContext);
  const customerId = customerIdProp !== undefined ? customerIdProp : contextCustomerId;
  const contextContactId = useContext(ShipmentCustomerPicContext);
  const contactId = (contactIdProp !== undefined ? contactIdProp : contextContactId) ?? null;
  const contextEmailSubject = useContext(ShipmentEmailSubjectContext);
  const emailSubject = emailSubjectProp ?? contextEmailSubject;
  // Places and countries are picked from the location database.
  const geoKind = geoKindOf(col);
  const tradeDirection = useContext(TradeDirectionContext);
  const freightMode = useContext(FreightModeContext);
  const { airports, terminals, seaports } = placeListsOf(fieldKey, freightMode);
  const cancelOk = useContext(CancelOfferedContext);
  const columnOptions = allowedOptions ?? (fieldKey === "status" ? getFilteredStatusOptions(tradeDirection) : col?.options) ?? [];
  const options = fieldKey === "status" ? offeredStatuses(columnOptions, cancelOk, value) : columnOptions;
  const original = value ?? "";
  // Statuses read without [IMP]/[EXP]/[DOM] once the list holds one direction only; with several
  // (no Trade Direction yet) the suffix is what tells the "Billing"s apart.
  const statusLabels =
    fieldKey === "status" && ["[IMP]", "[EXP]", "[DOM]"].filter((t) => options.some((o) => o.endsWith(t))).length <= 1;
  // By air a Full Load reads (and is picked as) Single Shipment; "Full Load" is what is saved.
  const optionLabel = (o: string) =>
    statusLabels ? statusLabel(o) : fieldKey === "loadType" ? loadTypeLabel(o, freightMode) : o;

  const startEditing = () => {
    if (locked) return;
    cancelledRef.current = false;
    setDraft(original);
    setEditing(true);
  };

  const commit = (next: string) => {
    setEditing(false);
    if (next !== original) onCommit(fieldKey, next);
  };

  // A contact is the person picked: the same name of another contact is a change too.
  const commitContact = (name: string, pickedId: string | null) => {
    setEditing(false);
    if (name !== original || pickedId !== contactId) onCommit(fieldKey, name, contactLinks(fieldKey, pickedId));
  };

  const cancel = () => {
    cancelledRef.current = true;
    setEditing(false);
  };

  if (!editing) {
    const hasValue = original.length > 0;
    // Dates are stored as ISO but shown in the unified DD.MM.YYYY display format (a kept time after it).
    const shown = hasValue
      ? isDate
        ? col?.timeField ? shownDate(original) : formatDate(original)
        : fieldKey === "status" ? statusLabel(original) : fieldKey === "loadType" ? loadTypeLabel(original, freightMode) : original
      : placeholder;
    const textClass = hasValue ? displayClassName : (emptyClassName ?? displayClassName);
    const textStyle = hasValue ? displayStyle : undefined;
    return (
      <span
        // Locked, it reads as a plain value: no pointer, no hover and no hint to edit it.
        className={`${className ?? ""} ${locked ? "" : "cursor-pointer hover:bg-slate-100"} rounded px-1 -mx-1 transition-colors ${multiline ? "block" : "flex items-center"}`}
        title={hasValue || locked ? undefined : "Double-click to edit"}
        onDoubleClick={locked ? undefined : startEditing}
      >
        {multiline ? (
          // Address blocks keep their lines.
          <span className={textClass} style={textStyle}>
            {shown}
          </span>
        ) : (
          // One line that stops at the field's edge; the whole value shows after a 1 s hover.
          // A customer's contact shows its card on hover instead (no tooltip over it).
          // It is also a link to the contact in the Customer Database: a click opens it, a
          // double click changes the contact (as on every other cell).
          isContact && hasValue && customerId ? (
            <ContactHoverCard name={original} contactId={contactId} customerId={customerId} emailSubject={emailSubject}>
              {locked ? (
                // Nothing to edit: the link opens at once, with no wait for a second click.
                <Link href={customerContactHref(customerId, original, contactId)} className="block min-w-0 text-indigo-600 hover:!underline" style={textStyle}>
                  <FadeText>{shown}</FadeText>
                </Link>
              ) : (
                <EditableLink
                  href={customerContactHref(customerId, original, contactId)}
                  onEdit={startEditing}
                  // The app's link (LINK in styles/ui.ts) without its "!" colour, so a conditional
                  // format's colour (textStyle) still wins.
                  className="block min-w-0 text-indigo-600 hover:!underline"
                  style={textStyle}
                >
                  <FadeText>{shown}</FadeText>
                </EditableLink>
              )}
            </ContactHoverCard>
          ) : isDate && col?.timeField && dateTimeBoxes ? (
            // A date with a time keeps its two boxes, locked, when it isn't being edited (the detail
            // cards; a grid row keeps one text).
            <DateTimeBoxes value={original} style={textStyle} title={locked ? undefined : "Double-click to edit"} />
          ) : (
            <FadeText className={textClass} style={textStyle} title={locked ? undefined : "Double-click to edit"}>
              {shown}
            </FadeText>
          )
        )}
        {geoKind && <GeoFlag kind={geoKind} value={original} />}
        {isUser && hasValue && <UnlinkedPersonMark value={original} hint={locked ? "only the user in Handled By or Holiday Cover, or a manager, can pick one" : "double-click to pick one"} />}
      </span>
    );
  }

  if (isUser) {
    // The picker gets who (an approval stamp's date is not theirs to edit); the same user picked
    // again changes nothing. Escape is caught before the open list swallows it.
    const { person } = splitPersonStamp(original);
    return (
      <div
        className={className}
        onKeyDownCapture={(e) => {
          if (e.key === "Escape") cancel();
        }}
      >
        <UserPicker
          size="small"
          autoFocus
          defaultOpen
          className="w-full min-w-[200px]"
          popupMatchSelectWidth={false}
          aria-label={col?.title}
          value={person}
          onChange={(email) => {
            setEditing(false);
            const next = personChange(original, email);
            if (next !== null) onCommit(fieldKey, next);
          }}
          onBlur={() => setEditing(false)}
        />
      </div>
    );
  }

  if (isContact) {
    return (
      <div
        className={className}
        onKeyDownCapture={(e) => {
          if (e.key === "Escape") cancel();
        }}
      >
        <CustomerContactPicker
          size="small"
          autoFocus
          defaultOpen
          className="w-full min-w-[200px]"
          popupMatchSelectWidth={false}
          aria-label={col?.title}
          customerId={customerId}
          value={original}
          contactId={contactId}
          onChange={commitContact}
          onAddingChange={(adding) => {
            setAddingContact(adding);
            if (!adding) setEditing(false);
          }}
          onBlur={() => {
            if (!addingContact) setEditing(false);
          }}
        />
      </div>
    );
  }

  if (geoKind) {
    return (
      <div className={className}>
        <GeoSelect
          kind={geoKind}
          airports={airports}
          terminals={terminals}
          seaports={seaports}
          size="small"
          autoFocus
          defaultOpen
          className="w-full min-w-[200px]"
          value={original}
          onChange={(v) => commit(v)}
          onBlur={() => setEditing(false)}
        />
      </div>
    );
  }

  if (isDate && col?.timeField) {
    return <DateTimeEditor className={className} value={original} onCommit={commit} onCancel={cancel} />;
  }

  if (isDate) {
    return <DayEditor fieldKey={fieldKey} value={original} className={className} onCommit={commit} onClose={() => setEditing(false)} />;
  }

  if (isDropdown) {
    return (
      <div className={className}>
        <Select
          size="small"
          autoFocus
          defaultOpen
          className="w-full min-w-[140px]"
          defaultValue={original || undefined}
          options={options.map((o) => ({ value: o, label: optionLabel(o) }))}
          // The "Billing" status says what it does (O11 / Q9): one line under its name in the list.
          optionRender={
            fieldKey === "status"
              ? (o) =>
                  isBillingStatus(String(o.value)) ? (
                    <span className="flex flex-col leading-tight py-0.5">
                      <span>{o.label}</span>
                      <span className="text-[11px] text-slate-500 whitespace-normal">{BILLING_HINT}</span>
                    </span>
                  ) : (
                    o.label
                  )
              : undefined
          }
          onChange={(v) => commit(v)}
          onBlur={() => setEditing(false)}
        />
      </div>
    );
  }

  if (multiline) {
    return (
      <div className={className}>
        <Input.TextArea
          autoFocus
          autoSize={{ minRows: 2, maxRows: 6 }}
          maxLength={col?.maxLength}
          defaultValue={original}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (cancelledRef.current) return;
            commit(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <Input
        ref={inputRef}
        size="small"
        autoFocus
        inputMode={digitsOnly ? "numeric" : undefined}
        maxLength={col?.maxLength}
        value={digitsOnly ? draft : undefined}
        defaultValue={digitsOnly ? undefined : original}
        onChange={(e) => setDraft(clean(e.target.value))}
        onPressEnter={() => commit(draft)}
        onBlur={() => {
          if (cancelledRef.current) return;
          commit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
        }}
      />
    </div>
  );
}
