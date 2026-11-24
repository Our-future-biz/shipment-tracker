// The costs of a Co-Loading Concept sailing's boxes (Council Outlay 13). Each container has its own
// Origin Costs, Ocean Freight and Destination Costs: an estimate a manager sets, in its own
// currency, with a note. They are added up for the sailing and shared over its loaded shipments by
// W/M, to the cent. Pure: the service reads the rows and the day's rates, this checks, values and
// shares them.

import type { BoxCostContainer, BoxCostKind, EarningsAmount, SailingBoxCosts } from "../interfaces/interfaces";

export const BOX_COST_KINDS: readonly BoxCostKind[] = ["origin", "ocean", "destination"];
export const BOX_COST_LABEL: Record<BoxCostKind, string> = { origin: "Origin Costs", ocean: "Ocean Freight", destination: "Destination Costs" };

const MAX_AMOUNT = 99_999_999.99;
const MAX_NOTE = 200;
const round2 = (v: number) => Math.round(v * 100) / 100 || 0;

/** A day's ČNB rates: CZK for one unit of each currency, the fixing they are from, and whether a later fixing may still replace them. */
export interface BoxRates {
  rates: ReadonlyMap<string, number>;
  fixingDate: string | null;
  provisional: boolean;
}

/** A box cost as typed or as stored: no amount means "not set". */
export interface BoxCostLineInput {
  kind: string;
  amount: number | null;
  currency: string;
  note: string;
}
export interface BoxCostStored extends BoxCostLineInput {
  containerNo: number;
}

/**
 * One container's three costs as they will be stored - every kind once, in order, a kind left out
 * as "not set" - or, in words, what is wrong with what was sent.
 */
export function checkBoxCosts(containerNo: number, containerCount: number, lines: readonly BoxCostLineInput[]): { lines: (BoxCostLineInput & { kind: BoxCostKind })[] } | { error: string } {
  if (!Number.isInteger(containerNo) || containerNo < 1 || containerNo > containerCount)
    return { error: containerCount === 1 ? "This sailing has one container." : `This sailing has ${containerCount} containers: pick one of them.` };
  const out: (BoxCostLineInput & { kind: BoxCostKind })[] = [];
  for (const kind of BOX_COST_KINDS) {
    const sent = lines.filter((l) => l.kind === kind);
    if (sent.length > 1) return { error: `${BOX_COST_LABEL[kind]} is given twice.` };
    const line = sent[0];
    const amount = line?.amount ?? null;
    if (amount !== null) {
      if (!Number.isFinite(amount) || amount < 0) return { error: `${BOX_COST_LABEL[kind]}: give an amount of 0 or more.` };
      if (amount > MAX_AMOUNT) return { error: `${BOX_COST_LABEL[kind]}: the amount is too large.` };
      if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) return { error: `${BOX_COST_LABEL[kind]}: give the amount with at most two decimals.` };
    }
    const currency = (line?.currency ?? "").trim().toUpperCase() || "EUR";
    if (!/^[A-Z]{3}$/.test(currency)) return { error: `${BOX_COST_LABEL[kind]}: pick a currency.` };
    const note = (line?.note ?? "").trim();
    if (note.length > MAX_NOTE) return { error: `${BOX_COST_LABEL[kind]}: keep the note to ${MAX_NOTE} characters.` };
    out.push({ kind, amount: amount === null ? null : round2(amount), currency, note });
  }
  if (lines.some((l) => !BOX_COST_KINDS.includes(l.kind as BoxCostKind))) return { error: "A box cost is Origin Costs, Ocean Freight or Destination Costs." };
  return { lines: out };
}

/** The lines that differ from what is stored: what the record of changes gets. A kind never set and still not set is no change. */
export function boxCostChanges<T extends BoxCostLineInput>(stored: readonly BoxCostLineInput[], next: readonly T[]): { old: BoxCostLineInput | null; next: T }[] {
  const out: { old: BoxCostLineInput | null; next: T }[] = [];
  for (const line of next) {
    const old = stored.find((s) => s.kind === line.kind) ?? null;
    const same = old ? old.amount === line.amount && old.note === line.note && (old.currency === line.currency || (old.amount === null && line.amount === null)) : line.amount === null && line.note === "";
    if (!same) out.push({ old, next: line });
  }
  return out;
}

/**
 * Whether a container's costs changed since the dialog read them (Council Review 7, K12): `expected`
 * is what the dialog showed, `stored` what is there now. The name of who changed the first line that
 * differs, "" when not recorded; null when nothing changed, and the save may go on. A kind with no
 * row is "not set"; the currency of a cost that is not set does not count.
 */
export function boxCostsChangedBy(stored: readonly (BoxCostLineInput & { updatedByName?: string })[], expected: readonly BoxCostLineInput[]): string | null {
  for (const kind of BOX_COST_KINDS) {
    const now = stored.find((s) => s.kind === kind);
    const then = expected.find((e) => e.kind === kind);
    const a = { amount: now?.amount ?? null, currency: now?.currency ?? "", note: now?.note ?? "" };
    const b = { amount: then?.amount ?? null, currency: (then?.currency ?? "").trim().toUpperCase(), note: (then?.note ?? "").trim() };
    if (a.amount !== b.amount || a.note !== b.note || (a.amount !== null && a.currency !== b.currency)) return now?.updatedByName ?? "";
  }
  return null;
}

/** What "Edit sailing" changed that moves the box costs: the number of containers and the departure date (K13). Kept in the record of changes. */
export function sailingDetailChanges(
  before: { containerCount: number; departureDate: string | null },
  after: { containerCount: number; departureDate?: string | null },
): { kind: "containers" | "departure"; oldAmount: number | null; newAmount: number | null; oldNote: string; newNote: string }[] {
  const out: ReturnType<typeof sailingDetailChanges> = [];
  if (after.containerCount !== before.containerCount) out.push({ kind: "containers", oldAmount: before.containerCount, newAmount: after.containerCount, oldNote: "", newNote: "" });
  if (after.departureDate !== undefined && (after.departureDate ?? null) !== before.departureDate)
    out.push({ kind: "departure", oldAmount: null, newAmount: null, oldNote: before.departureDate ?? "", newNote: after.departureDate ?? "" });
  return out;
}

/**
 * The sailing's box costs, valued. `rates` are CZK for one unit of each currency (CZK itself needs
 * none) with the day of their fixing; null when the rates could not be read - then only CZK amounts
 * are valued. They are the rates of the sailing's departure date (D10); until it has one, or until
 * that day's fixing is out, the latest ones, and the valuation is provisional. An amount with no rate is left out and its currency named. Costs kept for a container
 * the sailing no longer has are not counted, and the container named. A `day` of null once a cost is
 * set means the rates could not be read: `ratesNotRead` says so.
 */
export function boxCostsOf(containerCount: number, stored: readonly BoxCostStored[], day: BoxRates | null, departureDate: string | null = null): SailingBoxCosts {
  const rates = day?.rates ?? null;
  const eurRate = rates?.get("EUR") ?? null;
  const missing = new Set<string>();
  const inCzk = (amount: number, currency: string): number | null => {
    if (currency === "CZK") return amount;
    const rate = rates?.get(currency);
    if (!rate) {
      missing.add(currency);
      return null;
    }
    return round2(amount * rate);
  };
  const amountOf = (czk: number): EarningsAmount => ({ czk: round2(czk), eur: eurRate ? round2(czk / eurRate) : null });

  const containers: BoxCostContainer[] = [];
  for (let containerNo = 1; containerNo <= Math.max(1, containerCount); containerNo++) {
    const lines = BOX_COST_KINDS.map((kind) => {
      const row = stored.find((s) => s.containerNo === containerNo && s.kind === kind);
      const amount = row?.amount ?? null;
      const currency = row?.currency ?? "EUR";
      return { kind, amount, currency, note: row?.note ?? "", czk: amount === null ? null : inCzk(amount, currency) };
    });
    containers.push({ containerNo, lines, total: amountOf(lines.reduce((sum, l) => sum + (l.czk ?? 0), 0)) });
  }
  const set = containers.some((c) => c.lines.some((l) => l.amount !== null));
  return {
    set,
    containers,
    total: amountOf(containers.reduce((sum, c) => sum + c.total.czk, 0)),
    eurRate,
    rateDate: day?.fixingDate ?? null,
    departureDate,
    rateProvisional: departureDate === null || (day?.provisional ?? true),
    // Not one rate to go by (the rates service did not answer), which is not the same as a currency ČNB has no rate for.
    ratesNotRead: set && day === null,
    missingCurrencies: [...missing].sort(),
    notSet: set ? containers.flatMap((c) => c.lines.filter((l) => l.amount === null).map((l) => ({ containerNo: c.containerNo, kind: l.kind }))) : [],
    ignoredContainers: [...new Set(stored.filter((s) => s.containerNo > containerCount && s.amount !== null).map((s) => s.containerNo))].sort((a, b) => a - b),
  };
}

/**
 * `totalCents` split by `weights`, in whole cents, so the parts add up to the total (the largest
 * remainder method, as a master job's costs are split: invoicing lib/costSplit). A weight of 0
 * gets 0; null when no weight is above 0 - there is nothing to share it over.
 */
export function shareCents(totalCents: number, weights: readonly number[]): number[] | null {
  const sum = weights.reduce((a, w) => a + (w > 0 ? w : 0), 0);
  if (sum <= 0) return null;
  const exact = weights.map((w) => (w > 0 ? (totalCents * w) / sum : 0));
  const parts = exact.map(Math.floor);
  let left = totalCents - parts.reduce((a, p) => a + p, 0);
  const byRemainder = exact
    .map((x, i) => ({ i, remainder: x - Math.floor(x) }))
    .filter(({ i }) => weights[i]! > 0)
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % byRemainder.length, left -= 1) parts[byRemainder[k]!.i]! += 1;
  return parts;
}
