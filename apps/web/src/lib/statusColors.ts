export interface StatusStyle {
  bg: string;
  text: string;
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  // Shipment statuses
  booking: { bg: "#e0e7ff", text: "#4f46e5" },
  "booking confirmation pending": { bg: "#e0e7ff", text: "#4f46e5" },
  "in transit": { bg: "#dbeafe", text: "#1d4ed8" },
  "all done - waiting to be shipped": { bg: "#dbeafe", text: "#1d4ed8" },
  customs: { bg: "#fef3c7", text: "#d97706" },
  "customs clearance": { bg: "#fef3c7", text: "#d97706" },
  delivered: { bg: "#dcfce7", text: "#16a34a" },
  completed: { bg: "#dcfce7", text: "#16a34a" },
  overdue: { bg: "#fee2e2", text: "#dc2626" },
  cancelled: { bg: "#f1f5f9", text: "#64748b" },

  // Quote statuses
  draft: { bg: "#f1f5f9", text: "#64748b" },
  active: { bg: "#dbeafe", text: "#1d4ed8" },
  booked: { bg: "#dcfce7", text: "#16a34a" },
  expired: { bg: "#fee2e2", text: "#dc2626" },

  // Invoice statuses
  pending: { bg: "#fef3c7", text: "#d97706" },
  invoiced: { bg: "#dcfce7", text: "#16a34a" },
  paid: { bg: "#dbeafe", text: "#1d4ed8" },
};

const DEFAULT_STYLE: StatusStyle = { bg: "#f1f5f9", text: "#64748b" };

export function getStatusStyle(status: string): StatusStyle {
  return STATUS_STYLES[status.toLowerCase()] ?? DEFAULT_STYLE;
}
