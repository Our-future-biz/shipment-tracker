import { COLUMN_MAP } from "@/lib/columnConfig";

// How a shipment deadline from the Needs Attention API is worded and coloured, wherever it is shown.

// AMS / ISF Deadline: the date entered on the shipment, or 4 days before ETD when none is.
export const deadlineLabel = (field: string) => COLUMN_MAP.get(field)?.title ?? field;

export const deadlineDayLabel = (daysLeft: number) => {
  if (daysLeft < 0) return `overdue ${-daysLeft} day${daysLeft === -1 ? "" : "s"}`;
  return ["today", "tomorrow"][daysLeft] ?? `in ${daysLeft} days`;
};

// Everything within 24 hours (overdue, today, tomorrow) is urgent red; the 48-hour window is orange.
export const deadlineDayColor = (daysLeft: number) => (daysLeft <= 1 ? "red" : "orange");
