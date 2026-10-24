import type { CostLine, QuoteWarehouseInquiry, SalesQuoteData } from "./types";

// Heavy pieces on a Sea LCL quote: the warehouse charges extra handling for every piece of 2 t
// or more, by its weight. When the shipment weighs over 2 t, saving its cargo asks whether any
// piece does; the pieces per band then give the surcharge, posted to Pricing as a buying and a
// selling line of the same amount. A surcharge changed from the agreed rate needs a reason. A
// piece of 12.5 t or more has no rate: the warehouse is asked, and the pieces are saved only once
// it approved them. The approval itself puts its fee to Pricing (the server, warehouseInquiry.utils).

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

/** The bands with a rate whose surcharge the user changed from it (the warehouse's band has its own line). */
export function changedBands(heavy: QuoteHeavyPieces): HeavyBand[] {
  return HEAVY_BANDS.filter((band) => {
    const pieces = heavy.pieces?.[band.key] ?? 0;
    const typed = heavy.surcharge?.[band.key];
    if (pieces <= 0 || band.rate === null) return false;
    return typed !== undefined && typed !== rateSurcharge(band, pieces);
  });
}

/**
 * Where the pieces of 12.5 t or more stand with the warehouse: none to ask about, to be asked (never
 * asked, or asked about another number of pieces), waiting for its answer, approved or rejected.
 */
export type WarehouseStanding = "none" | "ask" | "pending" | "approved" | "rejected";

export function warehouseStanding(heavy: QuoteHeavyPieces, inquiry: QuoteWarehouseInquiry | null | undefined): WarehouseStanding {
  // A question waiting holds the pieces whatever they are now.
  if (inquiry?.status === "pending") return "pending";
  const pieces = heavy.anyOver2t ? (heavy.pieces?.[INQUIRY_BAND] ?? 0) : 0;
  if (pieces <= 0) return "none";
  if (!inquiry || inquiry.pieces !== pieces) return "ask";
  return inquiry.status;
}

/**
 * What still stops the heavy pieces from being saved: no piece entered, pieces of 12.5 t or more
 * the warehouse has not approved (not asked, waiting, or rejected), or a change from the rate
 * without a reason. Empty when they can be saved.
 */
export function heavyPiecesProblems(heavy: QuoteHeavyPieces, inquiry?: QuoteWarehouseInquiry | null): string[] {
  if (!heavy.anyOver2t) return [];
  const problems: string[] = [];
  const total = HEAVY_BANDS.reduce((n, band) => n + (heavy.pieces?.[band.key] ?? 0), 0);
  if (total <= 0) problems.push("Enter how many pieces are over 2 t");
  const standing = warehouseStanding(heavy, inquiry);
  if (standing === "ask") problems.push("Inquire Warehouse about the pieces of 12,500 kg and more");
  if (standing === "pending") problems.push("The warehouse has not answered yet - the pieces can be saved once it approves");
  if (standing === "rejected") problems.push("The warehouse rejected the pieces of 12,500 kg and more - change the pieces or ask again");
  if (changedBands(heavy).length > 0 && !heavy.reason?.trim()) problems.push("Give the reason for the changed surcharge");
  return problems;
}

/** The whole surcharge of the bands with a rate, in EUR (the warehouse's fee is a line of its own). */
export function heavyTotal(heavy: QuoteHeavyPieces): number {
  if (!heavy.anyOver2t) return 0;
  return HEAVY_BANDS.reduce((n, band) => n + (band.rate !== null && (heavy.pieces?.[band.key] ?? 0) > 0 ? (bandSurcharge(band, heavy) ?? 0) : 0), 0);
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
    if (band.rate !== null && typed !== undefined && typed !== rateSurcharge(band, n)) surcharge[band.key] = typed;
  }
  const kept: QuoteHeavyPieces = { anyOver2t: true, pieces };
  if (Object.keys(surcharge).length) kept.surcharge = surcharge;
  if (changedBands(kept).length && heavy.reason?.trim()) kept.reason = heavy.reason.trim();
  return kept;
}

/** The pricing lines of the surcharge carry this pair id: a new answer replaces them. */
export const HEAVY_PAIR_ID = "heavy-pieces";

/** The surcharge's line, the same on the buying and the selling side, the pieces charged for as its quantity. */
function heavyLine(heavy: QuoteHeavyPieces): CostLine {
  const bands = HEAVY_BANDS.filter((band) => band.rate !== null && (heavy.pieces?.[band.key] ?? 0) > 0);
  const counted = bands.map((band) => `${heavy.pieces![band.key]}× ${band.label}`);
  return {
    type: "Handling",
    chargeCode: "handling",
    description: `Extra handling - heavy pieces (${counted.join(", ")})`,
    currency: "EUR",
    amount: heavyTotal(heavy),
    value: bands.reduce((n, band) => n + heavy.pieces![band.key]!, 0),
    pairId: HEAVY_PAIR_ID,
  };
}

/**
 * The quote with the answer kept and its pricing lines replaced: the surcharge's buying and selling
 * line when there is one to charge, none otherwise. The warehouse's fee stays as the approval put
 * it (and as Sales adjusted its selling line) - gone only when no piece of 12.5 t or more is left.
 * Other lines stay where they are.
 */
export function withHeavyPieces(data: SalesQuoteData, heavy: QuoteHeavyPieces): Partial<SalesQuoteData> {
  const kept: QuoteHeavyPieces = heavy.anyOver2t ? tidy(heavy) : { anyOver2t: false };
  const dropped = new Set([HEAVY_PAIR_ID, ...((kept.pieces?.[INQUIRY_BAND] ?? 0) > 0 ? [] : [WAREHOUSE_PAIR_ID])]);
  const others = (lines: CostLine[] | undefined) => (lines ?? []).filter((l) => !l.pairId || !dropped.has(l.pairId));
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

/** The pricing lines of the warehouse's approved fee (written by the server on approval) carry this pair id. */
export const WAREHOUSE_PAIR_ID = "heavy-cargo-warehouse";
/** What the selling line of the warehouse's fee starts above its buying line, EUR. */
export const HEAVY_CARGO_MARKUP_EUR = 50;

/** The warehouse's fee for the pieces it approved: price per piece × pieces, EUR. */
export function approvedFee(inquiry: QuoteWarehouseInquiry): number {
  return Math.round((inquiry.priceEurPerPiece ?? 0) * inquiry.pieces * 100) / 100;
}

/** Sales removed the warehouse's fee from Pricing, with a reason: it is not put back for that answer. */
export interface HeavyFeeRemoval {
  inquiryId: string;
  reason: string;
}

/** The fee's buying line and its selling line EUR 50 above it, the pieces asked about as their quantity - as the server writes them on approval. */
export function warehouseFeeLines(inquiry: QuoteWarehouseInquiry): { buying: CostLine; selling: CostLine } {
  const buy = approvedFee(inquiry);
  const line = (amount: number): CostLine => ({
    type: "Handling",
    chargeCode: "handling",
    description: "Heavy Cargo Handling Fee",
    currency: "EUR",
    amount,
    value: inquiry.pieces,
    pairId: WAREHOUSE_PAIR_ID,
  });
  return { buying: line(buy), selling: line(Math.round((buy + HEAVY_CARGO_MARKUP_EUR) * 100) / 100) };
}

/**
 * The fee lines a quote should have and has not: approved by the warehouse for the pieces the
 * quote has, but neither line in Pricing (an approval from before the server put them there) and
 * not removed by Sales for that answer - or fee lines without their quantity (the pieces asked
 * about), from before it was set. Null when nothing is missing.
 */
export function missingWarehouseFee(data: SalesQuoteData): Partial<SalesQuoteData> | null {
  const inquiry = data.warehouseInquiry;
  if (!inquiry || inquiry.status !== "approved" || inquiry.priceEurPerPiece === null) return null;
  if (!data.heavyPieces?.anyOver2t || data.heavyPieces.pieces?.[INQUIRY_BAND] !== inquiry.pieces) return null;
  if (data.heavyFeeRemoved?.inquiryId === inquiry.id) return null;
  const has = (lines: CostLine[] | undefined) => (lines ?? []).some((l) => l.pairId === WAREHOUSE_PAIR_ID);
  if (has(data.buyingLines) || has(data.sellingLines)) {
    const counted = (lines: CostLine[] | undefined) => (lines ?? []).map((l) => (l.pairId === WAREHOUSE_PAIR_ID && l.value === undefined ? { ...l, value: inquiry.pieces } : l));
    const uncounted = [...(data.buyingLines ?? []), ...(data.sellingLines ?? [])].some((l) => l.pairId === WAREHOUSE_PAIR_ID && l.value === undefined);
    return uncounted ? { buyingLines: counted(data.buyingLines), sellingLines: counted(data.sellingLines) } : null;
  }
  const { buying, selling } = warehouseFeeLines(inquiry);
  return { buyingLines: [...(data.buyingLines ?? []), buying], sellingLines: [...(data.sellingLines ?? []), selling] };
}
