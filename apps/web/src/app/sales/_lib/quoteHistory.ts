import type { QuoteStatus, SalesQuoteData, TimelineEntry } from "./types";

/** A line of a quote's history as its History dialog lists it. */
export interface HistoryRow {
  at: string;
  /** What the line records, in a word or two ("Status", "Quoted by", "Validity", …). */
  what: string;
  /** The status a status line set: shown as its pill. */
  status?: QuoteStatus;
  /** What else the line says - the Lost reason, its comment - "" when nothing. */
  detail: string;
  /** Who: the user's id and what was recorded of them (whoDid shows them by e-mail now). */
  userId?: string;
  user?: string;
}

// What each kind of line records. A line written before kinds existed has none and is a status change.
const WHAT: Readonly<Record<string, string>> = {
  status: "Status",
  validity: "Validity",
  owner: "Quoted by",
  follow_up: "Followed up",
  shipment: "Shipment",
  deleted: "Deleted",
  road_price: "Priced from tariff",
  margin_approval: "Margin approved",
  warehouse_inquiry: "Warehouse",
};

/**
 * Every line of a quote's history (data.timeline, which only the server writes), newest first.
 * Every user who may open the quote may read it: it is part of the quote they are handed.
 */
export function historyRows(data: SalesQuoteData): HistoryRow[] {
  const { timeline } = data;
  if (!Array.isArray(timeline)) return [];
  return timeline
    .filter((entry): entry is TimelineEntry => !!entry && typeof entry === "object" && typeof entry.at === "string")
    .map((entry) => {
      const kind = entry.kind ?? "status";
      const detail = [entry.lostReason, entry.comment].map((text) => (typeof text === "string" ? text.trim() : "")).filter(Boolean).join(" · ");
      return {
        at: entry.at,
        what: Object.hasOwn(WHAT, kind) ? WHAT[kind]! : kind,
        status: kind === "status" && typeof entry.status === "string" ? entry.status : undefined,
        detail,
        userId: entry.userId,
        user: entry.user,
      };
    })
    .reverse();
}
