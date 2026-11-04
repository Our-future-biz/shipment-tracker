"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AutoComplete } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import { SupplierRatingStars } from "@/app/customers/_components/SupplierRatingStars";
import { useSupplierDirectory } from "@/hooks/useSupplierDirectory";
import { fold } from "@/lib/fold";

// The supplier of a buying line (a quote's, a shipment's cost): picked from the Customer Database's
// suppliers, with their stars, or typed as text when it is not one (Council Outlay 7, step 6). Picking
// links the line to the company; typing over a picked name unlinks it, so the link never names another
// company than the text. A low-rated pick gets a note: amber at 1–2 stars, red at 0, never a block.

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
  /** Shown as plain text, like the other fields of a locked grid row (it opens with the row). */
  plain?: boolean;
  size?: "small" | "middle";
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
}

const MAX_OPTIONS = 30;

export function SupplierPicker({ value, onChange, onBlur, readOnly = false, plain = false, size = "small", className, ariaLabel = "Supplier", placeholder = "Supplier" }: SupplierPickerProps) {
  const { suppliers, byId } = useSupplierDirectory();
  const [typing, setTyping] = useState(false);
  const linked = value.supplierCustomerId ? byId.get(value.supplierCustomerId) : undefined;

  const options = useMemo(() => {
    const words = fold(value.name).split(/\s+/).filter(Boolean);
    return suppliers
      .filter((s) => words.every((w) => fold(`${s.companyName} ${s.ico}`).includes(w)))
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

  return (
    <div className={className}>
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
        suffixIcon={linked ? <LinkOutlined className="text-indigo-500" aria-label="Linked to the Customer Database" /> : plain ? null : undefined}
      />
      {linked && <SupplierLinkNote id={linked.id} rating={linked.supplierRating} />}
    </div>
  );
}

/** Under a picked supplier: its stars, and a word when it is low rated, leading to why. */
function SupplierLinkNote({ id, rating }: { id: string; rating: number | null }) {
  const low = rating !== null && rating <= 2;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] leading-4">
      <SupplierRatingStars rating={rating} />
      {low && (
        <span className={rating === 0 ? "font-medium text-red-600" : "text-amber-700"}>
          {rating === 0 ? "Do not use" : "Use with caution"} ·{" "}
          <Link href={`/customers/${id}`} target="_blank" className="font-semibold underline">
            See why
          </Link>
        </span>
      )}
    </div>
  );
}
