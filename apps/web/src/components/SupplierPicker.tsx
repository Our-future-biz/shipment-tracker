"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AutoComplete, Tooltip } from "antd";
import { LinkOutlined, PlusOutlined } from "@ant-design/icons";
import { AddCustomerModal } from "@/app/customers/_components/AddCustomerModal";
import { SupplierRatingStars } from "@/app/customers/_components/SupplierRatingStars";
import { SUPPLIER_NOT_IN_USE, supplierInUse, supplierOffered } from "@/app/customers/_lib/supplierStatus";
import { useCustomers } from "@/hooks/useCustomers";
import { useSupplierApprovals } from "@/hooks/useSupplierApprovals";
import { useSupplierDirectory } from "@/hooks/useSupplierDirectory";
import { fold } from "@/lib/fold";
import { lowRatingNote, sortBestFirst } from "@/lib/supplierRating";
import { supplierApprovalOf } from "@/app/sales/_lib/supplierApproval";

// The supplier of a buying line (a quote's, a shipment's cost): picked from the Customer Database's
// suppliers, with their stars, or typed as text when it is not one (Council Outlay 7, step 6) - but on a
// quote, where it comes from the Customer Database only (NewSupplierFromQuote). Picking
// links the line to the company; typing over a picked name unlinks it, so the link never names another
// company than the text. Matches come best first (5 → 1, not rated, 0, then by name), and a supplier only set
// "Not in use" is not offered, though a line already linked to one keeps it (D16). Nor is a new supplier
// waiting for a manager's approval, but on a quote (whose sending waits for it too): a shipment's cost
// linked to one would point to a company a decline deletes. A low-rated pick gets a
// note in the rating scale's words with its reason: amber at 1–2 stars, red at 0, never a block.

/**
 * Inside a quote's Pricing (its Sales Reference): the supplier is taken from the Customer Database only.
 * A name that is no company there asks for the company's details and adds it, and unless a manager adds it
 * it waits for a manager's approval (Sales → Managers → Company approval). Elsewhere (a shipment's costs) a
 * supplier may still be only typed.
 */
export const NewSupplierFromQuote = createContext<string | null>(null);

const ADD_OPTION = "\u0000add";

export interface SupplierValue {
  name: string;
  /** The Customer Database company the name is; null for a name only typed. */
  supplierCustomerId: string | null;
}

interface SupplierPickerProps {
  value: SupplierValue;
  onChange: (next: SupplierValue) => void;
  /** Called when the field is left with a typed change (grids that save on blur). */
  onBlur?: () => void;
  /** The line's supplier comes from elsewhere (a tariff): shown, not changed. */
  readOnly?: boolean;
  /** Why it cannot be changed, shown on hover. */
  readOnlyReason?: string;
  /** Shown as plain text, like the other fields of a locked grid row (it opens with the row). */
  plain?: boolean;
  size?: "small" | "middle";
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
}

const MAX_OPTIONS = 30;

export function SupplierPicker({
  value,
  onChange,
  onBlur,
  readOnly = false,
  readOnlyReason = "Priced from a tariff: the line keeps the tariff's supplier",
  plain = false,
  size = "small",
  className,
  ariaLabel = "Supplier",
  placeholder = "Supplier",
}: SupplierPickerProps) {
  const { suppliers, byId } = useSupplierDirectory();
  const fromQuote = useContext(NewSupplierFromQuote);
  const databaseOnly = !!fromQuote && !readOnly;
  const { byId: answers } = useSupplierApprovals({ enabled: !!fromQuote });
  // Where a new supplier stands: the Company approval list's answer is newer than the Customer Database list's.
  const approvalOf = (id: string): string => supplierApprovalOf(id, (x) => byId.get(x), answers)?.status ?? "";
  const { createCustomer, createManualCustomer, isCreating } = useCustomers({}, { enabled: false });
  const [typing, setTyping] = useState(false);
  // The name a new supplier is added under; null while the dialog is closed.
  const [adding, setAdding] = useState<string | null>(null);
  // What the field held when it was entered, to go back to when the dialog is closed without adding;
  // and what it holds now, read after the field is left (a click on a suggestion lands after the blur).
  const atFocus = useRef<SupplierValue>(value);
  const current = useRef<SupplierValue>(value);
  current.current = value;
  // The line is linked by its id, whether or not the directory has the company (still loading, or no
  // supplier any more); the note under it needs the company itself.
  const linked = !!value.supplierCustomerId;
  const linkedCompany = value.supplierCustomerId ? byId.get(value.supplierCustomerId) : undefined;
  const linkedApproval = value.supplierCustomerId ? approvalOf(value.supplierCustomerId) : "";
  const declinedAnswer = value.supplierCustomerId && linkedApproval === "declined" ? answers.get(value.supplierCustomerId) : undefined;
  // What may be picked, best first.
  const offered = useMemo(
    () => suppliers.filter((s) => supplierOffered(s, supplierApprovalOf(s.id, (x) => byId.get(x), answers)?.status ?? "", !!fromQuote)),
    [suppliers, byId, answers, fromQuote],
  );

  const options = useMemo(() => {
    const words = fold(value.name).split(/\s+/).filter(Boolean);
    const matches = offered.filter((s) => words.every((w) => fold(`${s.companyName} ${s.ico}`).includes(w)));
    const found = sortBestFirst(matches, (s) => s.supplierRating, (s) => s.companyName)
      .slice(0, MAX_OPTIONS)
      .map((s) => ({
        value: s.id,
        label: (
          <span className="flex min-w-0 items-center justify-between gap-3">
            <span className="truncate">{s.companyName}</span>
            {supplierApprovalOf(s.id, (x) => byId.get(x), answers)?.status === "pending" ? <span className="shrink-0 text-[11px] text-amber-700">Waiting for approval</span> : <SupplierRatingStars rating={s.supplierRating} />}
          </span>
        ),
      }));
    const typed = value.name.trim();
    if (!databaseOnly || !typed || matches.some((s) => fold(s.companyName) === fold(typed))) return found;
    return [
      ...found,
      {
        value: ADD_OPTION,
        label: (
          <span className="flex items-center gap-1.5 text-indigo-600">
            <PlusOutlined aria-hidden />
            Add “{typed}” to the Customer Database
          </span>
        ),
      },
    ];
  }, [offered, byId, answers, value.name, databaseOnly]);

  // A name left typed is linked to the one company it names exactly (as the list folds names: case and
  // diacritics aside), as if picked; one that is no company asks for the company (once per change: the field
  // entered and left as it was asks nothing). Several of that name are picked from the list.
  const leave = () => {
    const now = current.current;
    const typed = now.name.trim();
    if (!databaseOnly || now.supplierCustomerId || !typed) return false;
    const [exact, ...more] = offered.filter((s) => fold(s.companyName) === fold(typed));
    if (exact && !more.length) {
      onChange({ name: exact.companyName, supplierCustomerId: exact.id });
      return false;
    }
    if (exact || now.name === atFocus.current.name) return false;
    setAdding(typed);
    return true;
  };

  const field = (
    <AutoComplete
      size={size}
      className="w-full"
      aria-label={ariaLabel}
      placeholder={placeholder}
      disabled={readOnly}
      variant={plain ? "borderless" : undefined}
      value={value.name}
      options={typing ? options : []}
      popupMatchSelectWidth={320}
      onFocus={() => {
        atFocus.current = value;
        setTyping(true);
      }}
      onBlur={() => {
        setTyping(false);
        // After a click on a suggestion, which antd reports after the blur.
        if (databaseOnly) {
          window.setTimeout(() => {
            if (!leave()) onBlur?.();
          }, 0);
          return;
        }
        onBlur?.();
      }}
      // A typed name is no company: the link goes with the first keystroke. Typing over a pick offers the
      // matches again.
      onSearch={(text) => {
        setTyping(true);
        onChange({ name: text, supplierCustomerId: null });
      }}
      onSelect={(id: string) => {
        if (id === ADD_OPTION) {
          setTyping(false);
          setAdding(value.name.trim());
          return;
        }
        const s = byId.get(id);
        if (s) onChange({ name: s.companyName, supplierCustomerId: s.id });
        setTyping(false);
      }}
      suffixIcon={
        linked ? (
          <LinkOutlined className="text-indigo-600" aria-label="Linked to the Customer Database" />
        ) : plain ? null : undefined
      }
    />
  );

  // `className` styles the field only (a locked grid row passes one that ignores the mouse), so the note
  // under it and its link stay usable.
  return (
    <div>
      <div className={className}>
        {readOnly ? <Tooltip title={readOnlyReason}>{field}</Tooltip> : field}
      </div>
      {linkedApproval === "declined" ? (
        <div className="mt-1 text-[11px] font-medium leading-4 text-red-600">
          Declined by a manager{declinedAnswer?.comment ? `: “${declinedAnswer.comment}”` : ""} — pick another supplier
        </div>
      ) : linkedApproval === "pending" ? (
        <div className="mt-1 text-[11px] leading-4 text-amber-700">
          Waiting for a manager&apos;s approval{fromQuote ? ": the quote can't be sent until then" : ""}
        </div>
      ) : linkedCompany ? (
        <SupplierLinkNote
          id={linkedCompany.id}
          rating={linkedCompany.supplierRating}
          reason={linkedCompany.supplierRatingReason}
          notInUse={!supplierInUse(linkedCompany)}
        />
      ) : databaseOnly && !linked && !typing && adding === null && value.name.trim() ? (
        // Left so by a reload while the Add supplier dialog was open, or a duplicated line: the server holds the quote.
        <div className="mt-1 text-[11px] leading-4 text-amber-700">Only typed: pick it from the list (or add it) — the quote can&apos;t be sent until then</div>
      ) : null}
      {fromQuote && adding !== null && (
        <AddCustomerModal
          open
          newSupplier={{ name: adding, quoteNumber: fromQuote }}
          createCustomer={createCustomer}
          createManualCustomer={createManualCustomer}
          isCreating={isCreating}
          onClose={() => {
            setAdding(null);
            // Not added: the line goes back to what it had, as a supplier is taken from the database only.
            onChange(atFocus.current);
            onBlur?.();
          }}
          onCreated={(id, company) => {
            setAdding(null);
            onChange({ name: company.companyName, supplierCustomerId: id });
            onBlur?.();
          }}
        />
      )}
    </div>
  );
}

/** Under a picked supplier: its stars, and when it is low rated what that means and why (K11), leading to its page. */
function SupplierLinkNote({
  id,
  rating,
  reason,
  notInUse,
}: {
  id: string;
  rating: number | null;
  reason: string;
  notInUse: boolean;
}) {
  const note = lowRatingNote(rating);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] leading-4">
      <SupplierRatingStars rating={rating} />
      {notInUse && <span className="text-slate-500">{SUPPLIER_NOT_IN_USE}</span>}
      {note && (
        <Tooltip title={`${note.text}${reason ? ` Reason: ${reason}` : ""}`}>
          <span className={note.tone === "red" ? "font-medium text-red-600" : "text-amber-700"}>
            {note.title}
            {reason && (
              <span className="font-normal">
                {" "}
                · “{reason.length > 60 ? `${reason.slice(0, 60)}…` : reason}”
              </span>
            )}{" "}
            ·{" "}
            <Link href={`/customers/${id}`} target="_blank" className="font-semibold underline">
              See why
            </Link>
          </span>
        </Tooltip>
      )}
    </div>
  );
}
