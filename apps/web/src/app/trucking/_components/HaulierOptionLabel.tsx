import type { ReactNode } from "react";
import { SupplierRatingStars } from "@/app/customers/_components/SupplierRatingStars";

/** A haulier as an option of a Select: the label stays plain text (typing finds it), the stars sit on the right. */
export function HaulierOptionLabel({ label, rating }: { label: ReactNode; rating: number | null | undefined }) {
  return (
    <span className="flex min-w-0 items-center justify-between gap-3">
      <span className="truncate">{label}</span>
      {rating !== undefined && <SupplierRatingStars rating={rating} />}
    </span>
  );
}
