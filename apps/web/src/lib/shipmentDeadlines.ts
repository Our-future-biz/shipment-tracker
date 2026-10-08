import { COLUMN_MAP } from "@/lib/columnConfig";

// How a shipment deadline from the Needs Attention API is worded and coloured, wherever it is shown.

// AMS and ISF are not dates on the shipment: they are due 4 days before departure.
const COMPUTED_DEADLINE_LABELS: Record<string, string> = {
  amsDeadline: "AMS (4 days before ETD)",
  isfDeadline: "ISF (4 days before ETD)",
};

export const deadlineLabel = (field: string) => COMPUTED_DEADLINE_LABELS[field] ?? COLUMN_MAP.get(field)?.title ?? field;

export const deadlineDayLabel = (daysLeft: number) => {
  if (daysLeft < 0) return `overdue ${-daysLeft} day${daysLeft === -1 ? "" : "s"}`;
  return ["today", "tomorrow"][daysLeft] ?? `in ${daysLeft} days`;
};

// Everything within 24 hours (overdue, today, tomorrow) is urgent red; the 48-hour window is orange.
export const deadlineDayColor = (daysLeft: number) => (daysLeft <= 1 ? "red" : "orange");
