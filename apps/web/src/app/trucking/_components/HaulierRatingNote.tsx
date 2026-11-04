"use client";

import Link from "next/link";
import { Alert, Checkbox } from "antd";
import { lowRatingNote } from "@/lib/supplierRating";
import { needsConfirmation } from "../_lib/haulierRating";

interface HaulierRatingNoteProps {
  customerId: string | null;
  rating: number | null | undefined;
  /** Why it was rated so, from the Customer Database ("" when none). */
  reason?: string;
  /** Only for 0 stars: whether the user said to use it anyway. */
  confirmed?: boolean;
  /** Only for 0 stars: without it the note only warns (the confirmation is asked where the haulier is set). */
  onConfirm?: (confirmed: boolean) => void;
}

// Under a picked haulier that is low rated, in the rating scale's words with the reason (K10, K11): amber at
// 1–2 stars, red with a confirmation at 0. Never a block; the full story is on its Customer Database page.
export function HaulierRatingNote({ customerId, rating, reason = "", confirmed = false, onConfirm }: HaulierRatingNoteProps) {
  const note = lowRatingNote(rating);
  if (!customerId || !note) return null;
  const message = (
    <>
      Rated {rating} of 5 · {note.title}: {note.text}
      {reason && <> Reason: “{reason}”.</>}{" "}
      <Link href={`/customers/${customerId}`} target="_blank" className="font-semibold">
        See why
      </Link>
    </>
  );
  if (!needsConfirmation(rating)) return <Alert className="mt-3" type="warning" showIcon message={message} />;
  return (
    <Alert
      className="mt-3"
      type="error"
      showIcon
      message={message}
      description={
        onConfirm ? (
          <Checkbox checked={confirmed} onChange={(e) => onConfirm(e.target.checked)}>
            Use this haulier anyway
          </Checkbox>
        ) : undefined
      }
    />
  );
}
