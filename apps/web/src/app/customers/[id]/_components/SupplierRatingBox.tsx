"use client";

import { useRef, useState } from "react";
import { Popover, Tooltip } from "antd";
import type { CustomerItem } from "@/hooks/useCustomers";
import { useCustomer } from "@/hooks/useCustomers";
import { useSupplierRating } from "@/hooks/useSupplierRating";
import { apiErrorMessage } from "@/lib/api";
import { businessDayOf, formatDate } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { SupplierRatingStars } from "../../_components/SupplierRatingStars";
import { SupplierRatingEditor } from "./SupplierRatingEditor";

interface SupplierRatingBoxProps {
  customer: CustomerItem;
}

// A supplier's rating in the page header, in the shape of the Sales Owner box beside it: the stars, who
// set them and when, the reason on hover. A manager opens the editor from it (the server decides who
// may: canRateSupplier); everyone else sees it read-only.
export function SupplierRatingBox({ customer }: SupplierRatingBoxProps) {
  const toast = useToast();
  const { canRateSupplier } = useCustomer(customer.id);
  const { setRating, saving } = useSupplierRating(customer.id, { historyEnabled: false });
  const [open, setOpen] = useState(false);
  // The box gets the focus back when the editor closes (saved, cancelled, Escape), so the keyboard is not lost (R10).
  const trigger = useRef<HTMLButtonElement>(null);
  const rated = customer.supplierRating !== null;
  const by = rated ? [customer.supplierRatingBy, customer.supplierRatingAt ? formatDate(businessDayOf(customer.supplierRatingAt)) : ""].filter(Boolean).join(" · ") : "";
  const reasonId = `supplier-rating-reason-${customer.id}`;

  const save = (rating: number | null, reason: string) =>
    setRating({ rating, reason }).then(
      () => {
        setOpen(false);
        toast.success(rating === null ? "Rating cleared" : "Rating saved");
      },
      (err: unknown) => toast.error(`The rating was not saved: ${apiErrorMessage(err)}`),
    );

  const body = (
    <>
      <span className="block text-[11px] leading-4 text-slate-500">Supplier rating</span>
      <span className="flex h-6 items-center">
        <SupplierRatingStars rating={customer.supplierRating} />
      </span>
      {by && <span className="block truncate text-[11px] leading-4 text-slate-400">{by}</span>}
      {customer.supplierRatingReason && (
        <span id={reasonId} className="sr-only">
          Reason: {customer.supplierRatingReason}
        </span>
      )}
    </>
  );
  const boxClass = "block w-[220px] max-w-full rounded-lg border border-slate-200 bg-white pl-3 pr-2 pt-1 pb-1 text-left";
  const tooltip = canRateSupplier ? customer.supplierRatingReason || undefined : [customer.supplierRatingReason, "Only a manager can change the rating"].filter(Boolean).join(" · ");

  if (!canRateSupplier) {
    return (
      <Tooltip title={tooltip}>
        {/* Focusable, so the keyboard reaches its tooltip (the reason, who may change it). */}
        <div className={`${boxClass} focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500`} tabIndex={0} aria-describedby={customer.supplierRatingReason ? reasonId : undefined}>
          {body}
        </div>
      </Tooltip>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => !saving && setOpen(next)}
      trigger="click"
      placement="bottomRight"
      title={`Supplier rating · ${customer.companyName}`}
      destroyOnHidden
      afterOpenChange={(isOpen) => {
        if (!isOpen) trigger.current?.focus();
      }}
      content={
        <SupplierRatingEditor
          rating={customer.supplierRating}
          reason={customer.supplierRatingReason}
          saving={saving}
          onSave={(rating, reason) => save(rating, reason)}
          onClear={() => save(null, "")}
          onCancel={() => setOpen(false)}
        />
      }
    >
      <Tooltip title={open ? undefined : tooltip ?? "Rate this supplier"}>
        <button
          ref={trigger}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-describedby={customer.supplierRatingReason ? reasonId : undefined}
          aria-label={`Supplier rating: ${rated ? `${customer.supplierRating} of 5` : "not rated"}. Change it.`}
          className={`${boxClass} cursor-pointer transition-colors hover:border-indigo-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500`}
        >
          {body}
        </button>
      </Tooltip>
    </Popover>
  );
}
