"use client";

import { createContext, useContext, useState, useRef } from "react";
import { Input, Select, DatePicker } from "antd";
import type { InputRef } from "antd";
import dayjs from "dayjs";
import { COLUMN_MAP, geoKindOf, getFilteredStatusOptions } from "@/lib/columnConfig";
import { GeoFlag, GeoSelect } from "@/components/GeoSelect";
import { FadeText } from "@/components/FadeText";
import { UserPicker } from "@/components/UserPicker";
import { CustomerContactPicker } from "@/components/CustomerContactPicker";
import { ContactHoverCard } from "@/components/ContactHoverCard";
import { UnlinkedPersonMark } from "@/app/shipments/_components/UnlinkedPersonMark";
import { formatDate } from "@/lib/date";
import { statusLabel } from "@/lib/shipmentStatus";
import { personChange, splitPersonStamp } from "@/app/shipments/_lib/personFields";

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

/**
 * The Trade Direction of the shipment a page shows. A Shipment Status cell inside it offers
 * only that direction's statuses (see getFilteredStatusOptions); without it, all of them.
 */
export const TradeDirectionContext = createContext<string | undefined>(undefined);

/**
 * The Customer Database id of the customer of the shipment a page shows: a contact cell
 * (Customer's PIC) inside it offers that customer's contacts. A grid passes it per row instead.
 */
export const ShipmentCustomerContext = createContext<string | null | undefined>(undefined);

interface EditableCellProps {
  /** columnConfig key (e.g. "shippingLine") — decides text vs dropdown. */
  fieldKey: string;
  value?: string | null;
  onCommit: (fieldKey: string, value: string) => void;
  /** Render a multi-line textarea (used by address blocks). */
  multiline?: boolean;
  /** Text shown when the value is empty. */
  placeholder?: string;
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
}

export function EditableCell({
  fieldKey,
  value,
  onCommit,
  multiline = false,
  placeholder = "—",
  displayClassName = "text-slate-700 font-medium",
  emptyClassName,
  className,
  displayStyle,
  options: allowedOptions,
  customerId: customerIdProp,
}: EditableCellProps) {
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
  // Places and countries are picked from the location database.
  const geoKind = geoKindOf(col);
  const tradeDirection = useContext(TradeDirectionContext);
  const options = allowedOptions ?? (fieldKey === "status" ? getFilteredStatusOptions(tradeDirection) : col?.options) ?? [];
  const original = value ?? "";
  // Statuses read without [IMP]/[EXP]/[DOM] once the list holds one direction only; with several
  // (no Trade Direction yet) the suffix is what tells the "Billing"s apart.
  const statusLabels =
    fieldKey === "status" && ["[IMP]", "[EXP]", "[DOM]"].filter((t) => options.some((o) => o.endsWith(t))).length <= 1;

  const startEditing = () => {
    cancelledRef.current = false;
    setDraft(original);
    setEditing(true);
  };

  const commit = (next: string) => {
    setEditing(false);
    if (next !== original) onCommit(fieldKey, next);
  };

  const cancel = () => {
    cancelledRef.current = true;
    setEditing(false);
  };

  if (!editing) {
    const hasValue = original.length > 0;
    // Dates are stored as ISO but shown in the unified DD.MM.YYYY display format.
    const shown = hasValue ? (isDate ? formatDate(original) : fieldKey === "status" ? statusLabel(original) : original) : placeholder;
    const textClass = hasValue ? displayClassName : (emptyClassName ?? displayClassName);
    const textStyle = hasValue ? displayStyle : undefined;
    return (
      <span
        className={`${className ?? ""} cursor-pointer rounded px-1 -mx-1 hover:bg-slate-100 transition-colors ${multiline ? "block" : "flex items-center"}`}
        title={hasValue ? undefined : "Double-click to edit"}
        onDoubleClick={startEditing}
      >
        {multiline ? (
          // Address blocks keep their lines.
          <span className={textClass} style={textStyle}>
            {shown}
          </span>
        ) : (
          // One line that stops at the field's edge; the whole value shows after a 1 s hover.
          // A customer's contact shows its card on hover instead (no tooltip over it).
          isContact && hasValue && customerId ? (
            <ContactHoverCard name={original} customerId={customerId}>
              <FadeText className={textClass} style={textStyle}>
                {shown}
              </FadeText>
            </ContactHoverCard>
          ) : (
            <FadeText className={textClass} style={textStyle} title="Double-click to edit">
              {shown}
            </FadeText>
          )
        )}
        {geoKind && <GeoFlag kind={geoKind} value={original} />}
        {isUser && hasValue && <UnlinkedPersonMark value={original} hint="double-click to pick one" />}
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
          onChange={(name) => commit(name)}
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

  if (isDate) {
    const iso = toInputISO(original);
    const initial = iso ? dayjs(iso) : null;
    return (
      <div className={className}>
        <DatePicker
          size="small"
          autoFocus
          defaultOpen
          format="YYYY-MM-DD"
          className="w-full min-w-[150px]"
          defaultValue={initial && initial.isValid() ? initial : undefined}
          // Commit only when a day is picked — browsing months/years keeps the panel open.
          onChange={(d) => commit(d ? d.format("YYYY-MM-DD") : "")}
          // Close (without committing) when the panel is dismissed via click-away or Escape.
          onOpenChange={(open) => { if (!open) setEditing(false); }}
        />
      </div>
    );
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
          options={options.map((o) => ({ value: o, label: statusLabels ? statusLabel(o) : o }))}
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
