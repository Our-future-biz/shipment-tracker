"use client";

import { Alert } from "antd";

interface ListCapNoticeProps {
  /** How many rows the list holds (the newest ones the server sent). */
  shown: number;
  /** How many rows the search and filters find in all. */
  total: number;
  /** What the rows are, plural ("shipments"). */
  noun: string;
}

/**
 * Says that a list holds only the newest of what its search finds, so nobody takes a missing row
 * for one that does not exist. Column filters, sorting and counts on the page cover only the rows
 * shown. Nothing when the list holds them all.
 */
export function ListCapNotice({ shown, total, noun }: ListCapNoticeProps) {
  if (total <= shown) return null;
  return (
    <Alert
      type="info"
      showIcon
      className="!mb-3"
      message={`Showing the newest ${shown.toLocaleString("cs-CZ")} of ${total.toLocaleString("cs-CZ")} ${noun} — search or filter to find older ones.`}
    />
  );
}
