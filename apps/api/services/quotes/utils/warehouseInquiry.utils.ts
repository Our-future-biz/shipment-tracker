import { isPlainObject } from "./quoteDocument.utils";
import type { QuoteWarehouseInquiry } from "../interfaces/interfaces";

// The warehouse inquiry of a Sea LCL quote: pieces of 12.5 t or more have no handling rate, so
// Sales asks the warehouse (the "Inquire Warehouse" button of the heavy-pieces dialog). A
// warehouse manager approves with the extra handling per piece, or rejects with a reason, on the
// Warehouse Concept Managers page; the answer reaches the one who asked under the bell. While the
// question is open, or after a rejection, the quote cannot be made Ready to Send or Quoted.
// Stored in the quote document under `warehouseInquiry` (a key only the server writes); pure.

/** The heavy-pieces band without a rate: pieces of 12,500 kg and more. */
export const INQUIRY_BAND = "12500";
export const MAX_INQUIRY_PIECES = 1000;
export const MAX_INQUIRY_NOTE = 1000;
export const MIN_REJECT_REASON = 3;
/** The highest extra handling per piece a manager may give, EUR. */
export const MAX_PRICE_PER_PIECE = 100_000;
/** Statuses a quote cannot be moved to while the warehouse has not approved. */
export const INQUIRY_GATED_STATUSES: readonly string[] = ["ready_to_send", "quoted"];

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The quote's inquiry as stored, or null when it has none (or an unreadable one). */
export function readInquiry(data: unknown): QuoteWarehouseInquiry | null {
  const d = isPlainObject(data) ? data.warehouseInquiry : undefined;
  if (!isPlainObject(d)) return null;
  const status = str(d.status);
  if (status !== "pending" && status !== "approved" && status !== "rejected") return null;
  if (!str(d.id) || !str(d.requestedById)) return null;
  return {
    id: str(d.id),
    status,
    pieces: num(d.pieces) ?? 0,
    grossWeightKg: num(d.grossWeightKg) ?? 0,
    note: str(d.note),
    requestedById: str(d.requestedById),
    requestedByName: str(d.requestedByName),
    requestedAt: str(d.requestedAt),
    decidedById: str(d.decidedById) || null,
    decidedByName: str(d.decidedByName) || null,
    decidedAt: str(d.decidedAt) || null,
    priceEurPerPiece: num(d.priceEurPerPiece),
    comment: str(d.comment),
    answerSeenAt: str(d.answerSeenAt) || null,
  };
}

/** Pieces of 12.5 t or more the quote's saved heavy-pieces answer has (0 when none). */
export function heavyInquiryPieces(data: unknown): number {
  const h = isPlainObject(data) ? data.heavyPieces : undefined;
  if (!isPlainObject(h) || h.anyOver2t !== true || !isPlainObject(h.pieces)) return 0;
  const n = num(h.pieces[INQUIRY_BAND]);
  return n !== null && n > 0 ? Math.floor(n) : 0;
}

/**
 * Why the quote may not move to `to` now because of its pieces of 12.5 t or more, or null when it
 * may: the warehouse has not answered yet, or rejected. A question waiting holds the quote even
 * before its pieces are saved: the heavy pieces cannot be saved until the warehouse answers.
 */
export function inquiryGateMessage(data: unknown, to: string): string | null {
  if (!INQUIRY_GATED_STATUSES.includes(to)) return null;
  const inquiry = readInquiry(data);
  if (inquiry?.status === "pending") return "Pieces of 12.5 t or more are waiting for the warehouse's answer — the quote can be sent once the warehouse approves";
  if (heavyInquiryPieces(data) === 0) return null;
  if (inquiry?.status === "rejected") {
    return `The warehouse rejected the pieces of 12.5 t or more${inquiry.comment ? ` (${inquiry.comment})` : ""} — change the cargo or ask the warehouse again`;
  }
  return null;
}

// ─── The approved fee in Pricing ──────────

/** The pricing lines of the warehouse's approved fee carry this pair id: a new approval replaces them. */
export const WAREHOUSE_PAIR_ID = "heavy-cargo-warehouse";
export const HEAVY_CARGO_FEE = "Heavy Cargo Handling Fee";
/** What the selling line of the fee is above its buying line, EUR. */
export const HEAVY_CARGO_MARKUP_EUR = 50;

const lines = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isPlainObject) : []);

/**
 * What an approval writes to the quote: the fee (price × pieces) as a buying line "Heavy Cargo
 * Handling Fee" and a selling line EUR 50 above it, each with the pieces asked about as its quantity - replacing those of an earlier approval,
 * every other line stays - and the pieces of 12.5 t or more in the heavy-pieces answer.
 */
export function approvedPricing(data: unknown, inquiry: QuoteWarehouseInquiry): Record<string, unknown> {
  const d = isPlainObject(data) ? data : {};
  const buy = Math.round((inquiry.priceEurPerPiece ?? 0) * inquiry.pieces * 100) / 100;
  const line = (amount: number) => ({
    type: "Handling",
    chargeCode: "handling",
    description: HEAVY_CARGO_FEE,
    currency: "EUR",
    amount,
    value: inquiry.pieces,
    pairId: WAREHOUSE_PAIR_ID,
  });
  const others = (v: unknown) => lines(v).filter((l) => l.pairId !== WAREHOUSE_PAIR_ID);
  const heavy = isPlainObject(d.heavyPieces) ? d.heavyPieces : {};
  const pieces = isPlainObject(heavy.pieces) ? heavy.pieces : {};
  // The fee is its own line now: a figure typed for the band before has no place any more.
  const { surcharge: typed, ...answer } = heavy;
  const surcharge = isPlainObject(typed) ? Object.fromEntries(Object.entries(typed).filter(([k]) => k !== INQUIRY_BAND)) : {};
  return {
    heavyPieces: { ...answer, anyOver2t: true, pieces: { ...pieces, [INQUIRY_BAND]: inquiry.pieces }, ...(Object.keys(surcharge).length ? { surcharge } : {}) },
    buyingLines: [...others(d.buyingLines), line(buy)],
    sellingLines: [...others(d.sellingLines), line(Math.round((buy + HEAVY_CARGO_MARKUP_EUR) * 100) / 100)],
  };
}
