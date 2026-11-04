"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AutoComplete, Tooltip } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import { SupplierRatingStars } from "@/app/customers/_components/SupplierRatingStars";
import { lowRatingNote } from "@/app/customers/_lib/supplierRatingScale";
import { ratingRank } from "@/app/trucking/_lib/haulierRating";
import { useSupplierDirectory } from "@/hooks/useSupplierDirectory";
import { fold } from "@/lib/fold";

// The supplier of a buying line (a quote's, a shipment's cost): picked from the Customer Database's
// suppliers, with their stars, or typed as text when it is not one (Council Outlay 7, step 6). Picking
// links the line to the company; typing over a picked name unlinks it, so the link never names another
// company than the text. Matches come best first (5 → 1, not rated, 0, then by name), and a supplier set
// "Not in use" is not offered, though a line already linked to one keeps it (D16). A low-rated pick gets a
// note in the rating scale's words with its reason: amber at 1–2 stars, red at 0, never a block.

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
  const [typing, setTyping] = useState(false);
  const linked = value.supplierCustomerId ? byId.get(value.supplierCustomerId) : undefined;

  const options = useMemo(() => {
    const words = fold(value.name).split(/\s+/).filter(Boolean);
    return suppliers
      .filter(
        (s) =>
          s.status !== "Inactive" &&
          words.every((w) => fold(`${s.companyName} ${s.ico}`).includes(w)),
      )
      .sort(
        (a, b) =>
          ratingRank(b.supplierRating) - ratingRank(a.supplierRating) ||
          a.companyName.localeCompare(b.companyName, "cs"),
      )
      .slice(0, MAX_OPTIONS)
      .map((s) => ({
        value: s.id,
        label: (
          <span className="flex min-w-0 items-center justify-between gap-3">
            <span className="truncate">{s.companyName}</span>
            <SupplierRatingStars rating={s.supplierRating} />
          </span>
        ),
      }));
  }, [suppliers, value.name]);

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
      onFocus={() => setTyping(true)}
      onBlur={() => {
        setTyping(false);
        onBlur?.();
      }}
      // A typed name is no company: the link goes with the first keystroke.
      onSearch={(text) => onChange({ name: text, supplierCustomerId: null })}
      onSelect={(id: string) => {
        const s = byId.get(id);
        if (s) onChange({ name: s.companyName, supplierCustomerId: s.id });
        setTyping(false);
      }}
      suffixIcon={
        linked ? (
          <LinkOutlined className="text-indigo-500" aria-label="Linked to the Customer Database" />
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
      {linked && (
        <SupplierLinkNote
          id={linked.id}
          rating={linked.supplierRating}
          reason={linked.supplierRatingReason}
          notInUse={linked.status === "Inactive"}
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
      {notInUse && <span className="text-slate-500">Not in use</span>}
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
