// A sales quote is priced with ČNB rates and the company ROE % (see web sales/_lib/types
// QuoteFx). While the quote is a draft it uses today's rates live; once it is sent the
// rates are stored in data.fx and never change. Revising a quote reopens it: the stored
// rates are dropped and stored afresh when it is sent again.
//
// data.fx is the server's alone: whatever `fx` a client sends is ignored — a sent quote
// keeps the rates stored on it, or gets them stamped here.

export interface StoredFx {
  date: string;
  fixingDate: string | null;
  roePct: number;
  rates: Record<string, number>;
  lockedAt: string;
}

// Statuses before the quote goes to the customer — priced live.
const DRAFT_STATUSES = new Set(["draft", "ready_to_send", "revised"]);

export type FxPlan =
  | { action: "leave" } // not a sales quote, or a draft without rates: store the data as sent
  | { action: "clear" } // a draft: no stored rates
  | { action: "reuse"; fx: StoredFx } // sent: keep the rates already stored on the quote
  | { action: "stamp" }; // sent for the first time: store today's rates

function isStoredFx(value: unknown): value is StoredFx {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<StoredFx>;
  return typeof v.date === "string" && typeof v.roePct === "number" && !!v.rates && typeof v.rates === "object";
}

/** What to do with data.fx when a quote is saved; `previous` is the stored data (none on create). */
export function planQuoteFx(data: unknown, previous?: unknown): FxPlan {
  if (!data || typeof data !== "object") return { action: "leave" };
  const d = data as { quoteStatus?: unknown; fx?: unknown };
  // Not a sales quote (no lifecycle status): leave it alone.
  if (typeof d.quoteStatus !== "string" || !d.quoteStatus) return { action: "leave" };
  if (DRAFT_STATUSES.has(d.quoteStatus)) return "fx" in d ? { action: "clear" } : { action: "leave" };
  const stored = previous && typeof previous === "object" ? (previous as { fx?: unknown }).fx : undefined;
  return isStoredFx(stored) ? { action: "reuse", fx: stored } : { action: "stamp" };
}

/** Whether a quote moving to `status` may need today's rates stamped (a sent status, not Lost). */
export function mayStampFx(status: string): boolean {
  return !DRAFT_STATUSES.has(status) && status !== "lost";
}

/**
 * The fx write for a quote moving to `status`, given its stored document and today's rates
 * (fetched beforehand, outside any row lock): the stored rates stay on a sent quote, today's are
 * stamped on one sent now, a draft has none. Undefined when the document keeps what it has. A Lost
 * quote that was never sent gets no rates. `today` must be given whenever mayStampFx(status).
 */
export function fxWriteFor(status: string, stored: unknown, today: StoredFx | undefined): { fx: StoredFx | null } | undefined {
  const previous = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const plan = planQuoteFx({ quoteStatus: status, ...("fx" in previous ? { fx: previous.fx } : {}) }, previous);
  if (plan.action === "clear") return previous.fx === null ? undefined : { fx: null };
  if (plan.action !== "stamp" || status === "lost") return undefined;
  if (!today) throw new Error(`today's rates are needed to send a quote as "${status}"`);
  return { fx: today };
}
