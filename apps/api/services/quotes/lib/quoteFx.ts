// A sales quote is priced with ČNB rates and the company ROE % (see web sales/_lib/types
// QuoteFx). While the quote is a draft it uses today's rates live; once it is sent the
// rates are stored in data.fx and never change. Revising a quote reopens it: the stored
// rates are dropped and stored afresh when it is sent again.

export interface StoredFx {
  date: string;
  fixingDate: string | null;
  roePct: number;
  rates: Record<string, number>;
  lockedAt: string;
}

// Statuses before the quote goes to the customer — priced live.
const DRAFT_STATUSES = new Set(["draft", "ready_to_send", "revised"]);

export type FxAction = "keep" | "clear" | "stamp";

export function fxActionFor(data: unknown): FxAction {
  if (!data || typeof data !== "object") return "keep";
  const d = data as { quoteStatus?: unknown; fx?: unknown };
  // Not a sales quote (no lifecycle status): leave it alone.
  if (typeof d.quoteStatus !== "string" || !d.quoteStatus) return "keep";
  if (DRAFT_STATUSES.has(d.quoteStatus)) return d.fx ? "clear" : "keep";
  return d.fx ? "keep" : "stamp";
}
