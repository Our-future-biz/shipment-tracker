import type { CostLine, QuoteWarehouseInquiry, SalesQuoteData } from "./types";

// Heavy pieces on a Sea LCL quote: the warehouse charges extra handling for every piece of 2 t
// or more, by its weight. When the shipment weighs over 2 t, saving its cargo asks whether any
// piece does; the pieces per band then give the surcharge, posted to Pricing as a buying and a
// selling line of the same amount. A surcharge changed from the agreed rate needs a reason, and
// so does a piece of 12.5 t or more, which has no rate: the warehouse is asked.

export type HeavyBandKey = "2000" | "3000" | "5000" | "7500" | "10000" | "12500";

export interface HeavyBand {
  key: HeavyBandKey;
  label: string;
  /** The lightest piece of the band, in kg. */
  min: number;
  /** EUR per piece; null for pieces too heavy for a rate (the warehouse quotes them). */
  rate: number | null;
}

export const HEAVY_BANDS: readonly HeavyBand[] = [
  { key: "2000", label: "2,000 – 2,999 kg", min: 2000, rate: 50 },
  { key: "3000", label: "3,000 – 4,999 kg", min: 3000, rate: 100 },
  { key: "5000", label: "5,000 – 7,499 kg", min: 5000, rate: 200 },
  { key: "7500", label: "7,500 – 9,999 kg", min: 7500, rate: 350 },
  { key: "10000", label: "10,000 – 12,499 kg", min: 10000, rate: 500 },
  { key: "12500", label: "12,500 kg and more", min: 12500, rate: null },
];

/** The bands a shipment of this gross weight can have pieces in: no piece weighs more than the whole shipment. */
export function heavyBandsFor(grossWeightKg: number): HeavyBand[] {
  return HEAVY_BANDS.filter((band) => band.min <= grossWeightKg);
}

/** An earlier answer without the bands the shipment's weight no longer allows (it was made lighter since). */
export function withinWeight(heavy: QuoteHeavyPieces, grossWeightKg: number): QuoteHeavyPieces {
  const allowed = new Set(heavyBandsFor(grossWeightKg).map((b) => b.key));
  const keep = <T,>(rec: Partial<Record<HeavyBandKey, T>> | undefined) =>
    rec ? (Object.fromEntries(Object.entries(rec).filter(([k]) => allowed.has(k as HeavyBandKey))) as Partial<Record<HeavyBandKey, T>>) : undefined;
  return { ...heavy, pieces: keep(heavy.pieces), surcharge: keep(heavy.surcharge) };
}

/** What a quote keeps of the answer: whether any piece is over 2 t, the pieces and the surcharge per band, and why it differs from the rate. */
export interface QuoteHeavyPieces {
  anyOver2t: boolean;
  pieces?: Partial<Record<HeavyBandKey, number>>;
  /** EUR per band as charged; absent where it is the rate × pieces. */
  surcharge?: Partial<Record<HeavyBandKey, number>>;
  reason?: string;
}

/** The weight above which saving a Sea LCL quote's cargo asks about pieces over 2 t, in kg. */
export const HEAVY_SHIPMENT_KG = 2000;

/** Whether saving the cargo asks about heavy pieces: a Sea LCL quote of over 2 t. */
export function asksHeavyPieces(serviceType: string | undefined, grossWeightKg: number): boolean {
  return serviceType === "Sea LCL" && grossWeightKg > HEAVY_SHIPMENT_KG;
}

/** The surcharge of a band at the agreed rate; null for a band without a rate. */
export function rateSurcharge(band: HeavyBand, pieces: number): number | null {
  return band.rate === null ? null : band.rate * (Number(pieces) || 0);
}

/** The surcharge charged for a band: as typed, else the rate × pieces (none for a band without a rate and nothing typed). */
export function bandSurcharge(band: HeavyBand, heavy: QuoteHeavyPieces): number | null {
  const typed = heavy.surcharge?.[band.key];
  return typed !== undefined ? typed : rateSurcharge(band, heavy.pieces?.[band.key] ?? 0);
}

/** The bands with pieces whose surcharge isn't the agreed rate: changed by the user, or without a rate (12.5 t and more). */
export function changedBands(heavy: QuoteHeavyPieces): HeavyBand[] {
  return HEAVY_BANDS.filter((band) => {
    const pieces = heavy.pieces?.[band.key] ?? 0;
    const typed = heavy.surcharge?.[band.key];
    if (pieces <= 0) return false;
    if (band.rate === null) return true;
    return typed !== undefined && typed !== rateSurcharge(band, pieces);
  });
}

/**
 * What still stops the heavy pieces from being saved: no piece entered, a 12.5 t+ piece without
 * the warehouse's figure (unless the warehouse is asked and its answer awaited: `warehouseAsked`),
 * or a change from the rate without a reason. Empty when they can be saved.
 */
export function heavyPiecesProblems(heavy: QuoteHeavyPieces, { warehouseAsked = false }: { warehouseAsked?: boolean } = {}): string[] {
  if (!heavy.anyOver2t) return [];
  const problems: string[] = [];
  const total = HEAVY_BANDS.reduce((n, band) => n + (heavy.pieces?.[band.key] ?? 0), 0);
  if (total <= 0) problems.push("Enter how many pieces are over 2 t");
  if ((heavy.pieces?.["12500"] ?? 0) > 0 && heavy.surcharge?.["12500"] === undefined && !warehouseAsked) {
    problems.push("Inquire Warehouse and enter the surcharge for the pieces of 12,500 kg and more");
  }
  if (changedBands(heavy).length > 0 && !heavy.reason?.trim()) problems.push("Give the reason for the changed surcharge");
  return problems;
}

/** The whole surcharge in EUR. */
export function heavyTotal(heavy: QuoteHeavyPieces): number {
  if (!heavy.anyOver2t) return 0;
  return HEAVY_BANDS.reduce((n, band) => n + ((heavy.pieces?.[band.key] ?? 0) > 0 ? (bandSurcharge(band, heavy) ?? 0) : 0), 0);
}

// The answer as kept: only the bands that have pieces, a surcharge only where it isn't the rate,
// and a reason only while something differs from it.
function tidy(heavy: QuoteHeavyPieces): QuoteHeavyPieces {
  const pieces: Partial<Record<HeavyBandKey, number>> = {};
  const surcharge: Partial<Record<HeavyBandKey, number>> = {};
  for (const band of HEAVY_BANDS) {
    const n = heavy.pieces?.[band.key] ?? 0;
    if (n <= 0) continue;
    pieces[band.key] = n;
    const typed = heavy.surcharge?.[band.key];
    if (typed !== undefined && typed !== rateSurcharge(band, n)) surcharge[band.key] = typed;
  }
  const kept: QuoteHeavyPieces = { anyOver2t: true, pieces };
  if (Object.keys(surcharge).length) kept.surcharge = surcharge;
  if (changedBands(kept).length && heavy.reason?.trim()) kept.reason = heavy.reason.trim();
  return kept;
}

/** The pricing lines of the surcharge carry this pair id: a new answer replaces them. */
export const HEAVY_PAIR_ID = "heavy-pieces";

/** The surcharge's line, the same on the buying and the selling side. */
function heavyLine(heavy: QuoteHeavyPieces): CostLine {
  const counted = HEAVY_BANDS.filter((band) => (heavy.pieces?.[band.key] ?? 0) > 0).map((band) => `${heavy.pieces![band.key]}× ${band.label}`);
  return {
    type: "Handling",
    chargeCode: "handling",
    description: `Extra handling - heavy pieces (${counted.join(", ")})`,
    currency: "EUR",
    amount: heavyTotal(heavy),
    pairId: HEAVY_PAIR_ID,
  };
}

/**
 * The quote with the answer kept and its pricing lines replaced: the surcharge's buying and selling
 * line when there is one to charge, none otherwise. Other lines stay where they are.
 */
export function withHeavyPieces(data: SalesQuoteData, heavy: QuoteHeavyPieces): Partial<SalesQuoteData> {
  const others = (lines: CostLine[] | undefined) => (lines ?? []).filter((l) => l.pairId !== HEAVY_PAIR_ID);
  const kept: QuoteHeavyPieces = heavy.anyOver2t ? tidy(heavy) : { anyOver2t: false };
  const charged = heavyTotal(kept) > 0 ? [heavyLine(kept)] : [];
  return {
    heavyPieces: kept,
    buyingLines: [...others(data.buyingLines), ...charged],
    sellingLines: [...others(data.sellingLines), ...charged.map((l) => ({ ...l }))],
  };
}

// ─── The warehouse inquiry (pieces of 12.5 t or more) ──────────

/** The band the warehouse is asked about: no rate. */
export const INQUIRY_BAND: HeavyBandKey = "12500";

const shortDay = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Europe/Prague" }).replace(/\//g, ".") + "." : "");

const WAITING_REASON_START = "The warehouse was asked ";

/** The reason the heavy pieces carry for the warehouse's band, from its answer (or the question waiting). */
export function inquiryReason(inquiry: QuoteWarehouseInquiry): string {
  if (inquiry.status === "approved") {
    return `Warehouse approved EUR ${inquiry.priceEurPerPiece ?? 0} per piece (${inquiry.decidedByName || "warehouse manager"}, ${shortDay(inquiry.decidedAt ?? "")})`;
  }
  return `${WAITING_REASON_START}${shortDay(inquiry.requestedAt)} — waiting for its figure`;
}

/**
 * The answer as the dialog starts from it, with the warehouse's approved price filled in for the
 * 12.5 t+ pieces (price × pieces) where no figure is entered yet, and the reason from the answer
 * where none is given. Anything entered by hand stays.
 */
export function withInquiryAnswer(heavy: QuoteHeavyPieces, inquiry: QuoteWarehouseInquiry | null | undefined): QuoteHeavyPieces {
  const pieces = heavy.pieces?.[INQUIRY_BAND] ?? 0;
  if (!inquiry || pieces <= 0) return heavy;
  let next = heavy;
  if (inquiry.status === "approved" && inquiry.priceEurPerPiece !== null && heavy.surcharge?.[INQUIRY_BAND] === undefined) {
    next = { ...next, surcharge: { ...next.surcharge, [INQUIRY_BAND]: Math.round(inquiry.priceEurPerPiece * pieces * 100) / 100 } };
  }
  // A reason this module wrote for the question waiting gives way to the answer; one typed stays.
  const generated = !next.reason?.trim() || next.reason.startsWith(WAITING_REASON_START);
  if ((inquiry.status === "approved" || inquiry.status === "pending") && generated) next = { ...next, reason: inquiryReason(inquiry) };
  return next;
}
