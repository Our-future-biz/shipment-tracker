"use client";

import { Badge, type Tone } from "./Badge";
import { statusLabel, statusTone } from "@/lib/shipmentStatus";

interface StatusBadgeProps {
  status: string;
  label?: string;
  /** Layout only (truncate, max-w-full). */
  className?: string;
}

// The tone of each status, in the app's status colours: indigo while under way, amber waiting on
// something, green done, red late or urgent, grey not started or stopped. A status not named here
// is grey.
const STATUS_TONES: Record<string, Tone> = {
  // Shipment statuses
  booking: "i",
  "booking confirmation pending": "i",
  "in transit": "i",
  "all done - waiting to be shipped": "i",
  customs: "a",
  "customs clearance": "a",
  delivered: "g",
  completed: "g",
  overdue: "r",
  cancelled: "",

  // Quote statuses
  draft: "",
  active: "i",
  booked: "g",
  expired: "r",

  // Invoice statuses
  pending: "a",
  invoiced: "g",
  paid: "i",

  // Warehouse statuses
  "in progress": "i",

  // Priority levels
  high: "r",
  medium: "a",
  low: "i",
};

// A status as a pill (Badge), the same shape as every other mark in the app - the one way a
// shipment's status is shown. A status not named above (the shipments' own long labels, such as
// "Billed [IMP]") takes its tone from what it mentions (statusTone).
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const text = label ?? statusLabel(status);
  return (
    <Badge tone={STATUS_TONES[status.toLowerCase()] ?? statusTone(status)} title={text} className={className}>
      {text}
    </Badge>
  );
}
