"use client";

import Link from "next/link";
import { Alert, Checkbox } from "antd";
import { lowRated, needsConfirmation } from "../_lib/haulierRating";

interface HaulierRatingNoteProps {
  customerId: string | null;
  rating: number | null | undefined;
  /** Only for 0 stars: whether the user said to use it anyway. */
  confirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
}

// Under a picked haulier that is low rated: amber at 1–2 stars, red with a confirmation at 0. Never a block;
// why it was rated so is on its page in the Customer Database.
export function HaulierRatingNote({ customerId, rating, confirmed, onConfirm }: HaulierRatingNoteProps) {
  if (!customerId || !lowRated(rating)) return null;
  const why = (
    <Link href={`/customers/${customerId}`} target="_blank" className="font-semibold">
      See why
    </Link>
  );
  if (!needsConfirmation(rating)) {
    return <Alert className="mt-3" type="warning" showIcon message={<>Rated {rating} of 5: use with caution, prefer another haulier where there is one. {why}</>} />;
  }
  return (
    <Alert
      className="mt-3"
      type="error"
      showIcon
      message={<>Rated 0 of 5: do not use, unless under an open corrective action. {why}</>}
      description={
        <Checkbox checked={confirmed} onChange={(e) => onConfirm(e.target.checked)}>
          Use this haulier anyway
        </Checkbox>
      }
    />
  );
}
