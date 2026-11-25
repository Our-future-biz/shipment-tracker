// What the free space of a box must earn, and what a new shipment would do to it (Council Outlay 14,
// B1-B3): the Earnings tab turned from "how did we do" into "what do I sell the rest for". Pure, so
// it is tested without React. Everything here is an estimate from today's figures, and says so.
//
// "Earned before box" is a shipment's selling less its own inland delivery and other costs: what it
// brings toward the box. All money is in one currency, boxCurrency's: EUR where both the earning
// before the box and the box costs have an EUR value, else CZK - never the two mixed.

import { fmtMoney } from "@/lib/money";
import type { BoxUtilization } from "./boxUtilization";
import type { EarningsAmount, SailingEarnings } from "./earnings";

/** The margins "Sell the rest at" gives a rate for, in % of the revenue (D13). */
export const TARGET_MARGINS = [10, 15, 20] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Two amounts in one currency: EUR where both have it, else CZK. */
function inOne(a: EarningsAmount, b: EarningsAmount): { a: number; b: number; currency: "EUR" | "CZK" } {
  return a.eur !== null && b.eur !== null ? { a: a.eur, b: b.eur, currency: "EUR" } : { a: a.czk, b: b.czk, currency: "CZK" };
}

/**
 * The one currency a box's figures are set against each other in - what the free space must earn,
 * "What if I add this", Earned / W/M and the box's cost per W/M: EUR where the earning before the box
 * and the box costs both have it, else CZK. Without box costs, the earning's own.
 */
export function boxCurrency(t: { beforeBox: EarningsAmount; boxCosts: EarningsAmount | null }): "EUR" | "CZK" {
  return inOne(t.beforeBox, t.boxCosts ?? t.beforeBox).currency;
}

/** An amount in that currency. */
const valueIn = (a: EarningsAmount, currency: "EUR" | "CZK"): number | null => (currency === "EUR" ? a.eur : a.czk);

/** What the box costs for each W/M loaded, the bar a shipment's own earning per W/M is read against; null without box costs or a W/M. */
export function boxPerWmOf(t: { freightTons: number; beforeBox: EarningsAmount; boxCosts: EarningsAmount | null }): { value: number; currency: "EUR" | "CZK" } | null {
  if (!t.boxCosts || !(t.freightTons > 0)) return null;
  const { b: boxCost, currency } = inOne(t.beforeBox, t.boxCosts);
  return { value: round2(boxCost / t.freightTons), currency };
}

/**
 * The room left in a box in W/M, taken with the same mix of cargo as is loaded: today's W/M scaled by
 * the meter that fills first. Null when nothing is loaded or the box has no meter to judge by; 0 when
 * a meter is full or over.
 */
export function freeWmOf(box: BoxUtilization, loadedWm: number): { wm: number; limitedBy: "volume" | "weight" } | null {
  if (!(loadedWm > 0)) return null;
  const ratios = (
    [
      ["volume", box.volume],
      ["weight", box.weight],
    ] as const
  ).flatMap(([kind, meter]) => (meter && meter.used > 0 ? [{ kind, ratio: Math.max(0, meter.free) / meter.used }] : []));
  if (ratios.length === 0) return null;
  const tight = ratios.reduce((min, r) => (r.ratio < min.ratio ? r : min));
  return { wm: Math.round(loadedWm * tight.ratio * 10) / 10, limitedBy: tight.kind };
}

/** What the free space must earn per W/M, before the box. */
export interface SellRest {
  currency: "EUR" | "CZK";
  /** The free room in W/M, with the same mix of cargo, and the meter that fills first. */
  freeWm: number;
  limitedBy: "volume" | "weight";
  /** What is still missing to cover the box costs; 0 or less once break-even is reached. */
  shortfall: number;
  /** The earning per W/M that covers the box; 0 once it is covered; null when there is no room left to sell. */
  breakEvenRate: number | null;
  /** The earning per W/M that brings each target margin; null where no rate does (no room, or the margin is beyond what this cargo's own costs leave). */
  margins: { pct: number; rate: number | null }[];
  /** What the loaded shipments earn per W/M today, and what the box costs per loaded W/M. */
  earnedPerWm: number;
  boxPerWm: number;
}

/**
 * "Sell the rest at" (B1). Worked out only where the break-even is (the server gives none while a
 * loaded shipment is not priced or a box cost has no rate) and the box has room to measure.
 * The margin rates assume the new cargo carries costs of its own in today's proportion: of each
 * unit of revenue, the share that is left before the box stays what it is for the loaded cargo.
 */
export function sellRestOf(e: SailingEarnings, box: BoxUtilization | null): SellRest | null {
  if (!e.breakEven || !e.totals.boxCosts || !box) return null;
  const loadedWm = e.breakEven.loadedWm;
  const free = freeWmOf(box, loadedWm);
  if (!free) return null;
  const { a: earned, b: boxCost, currency } = inOne(e.totals.beforeBox, e.totals.boxCosts);
  const revenue = currency === "EUR" ? (e.totals.selling.eur ?? 0) : e.totals.selling.czk;
  const shortfall = round2(boxCost - earned);
  const room = free.wm > 0;
  // Of a unit of revenue, what is left before the box today.
  const kept = revenue > 0 ? earned / revenue : null;
  return {
    currency,
    freeWm: free.wm,
    limitedBy: free.limitedBy,
    shortfall,
    breakEvenRate: !room ? (shortfall <= 0 ? 0 : null) : round2(Math.max(0, shortfall) / free.wm),
    margins: TARGET_MARGINS.map((pct) => {
      const m = pct / 100;
      // earned + r·F − box = m · (revenue + r·F / kept)  →  r = (box − earned + m·revenue) / (F · (1 − m / kept))
      if (!room || kept === null || kept <= m) return { pct, rate: null };
      return { pct, rate: round2(Math.max(0, (boxCost - earned + m * revenue) / (free.wm * (1 - m / kept)))) };
    }),
    earnedPerWm: round2(earned / loadedWm),
    boxPerWm: round2(boxCost / loadedWm),
  };
}

const wm = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** "Sell the rest at" in sentences: the room, the rate that covers the box, the rates for the margins. */
export function sellRestWords(s: SellRest): string[] {
  const room = `Room for about ${wm(s.freeWm)} W/M more with the same mix of cargo (${s.limitedBy} fills first).`;
  if (s.freeWm <= 0) return [s.shortfall > 0 ? `No room left to sell: the box is full by ${s.limitedBy}, and ${fmtMoney(s.shortfall, s.currency, true)} of its costs are not covered.` : `No room left to sell: the box is full by ${s.limitedBy}.`];
  const first =
    s.shortfall <= 0
      ? `${room} The box is paid for: whatever the rest earns before the box is profit.`
      : `${room} To break even the rest must earn at least ${fmtMoney(s.breakEvenRate ?? 0, s.currency, true)} per W/M before the box.`;
  const rates = s.margins.filter((m) => m.rate !== null);
  const out = [first];
  // A margin today's cargo already brings needs nothing of the rest: said so, not as a rate of 0.
  if (rates.length > 0) out.push(`For a margin of ${rates.map((m) => `${m.pct}%: ${m.rate === 0 ? "reached already" : `${fmtMoney(m.rate!, s.currency, true)} per W/M`}`).join(" · ")}.`);
  out.push(`Today's cargo earns ${fmtMoney(s.earnedPerWm, s.currency, true)} per W/M; the box costs ${fmtMoney(s.boxPerWm, s.currency, true)} per loaded W/M.`);
  return out;
}

/**
 * What a shipment earns per W/M before the box, in the given currency (boxCurrency's), so every row
 * reads against the box's cost per W/M in the same one; null where it cannot be said (no W/M, money
 * not known, cancelled, no value in that currency).
 */
export function earnedPerWm(row: { counted: boolean; moneyKnown: boolean; freightTons: number; beforeBox: EarningsAmount }, currency: "EUR" | "CZK"): { value: number; currency: "EUR" | "CZK" } | null {
  if (!row.counted || !row.moneyKnown || !(row.freightTons > 0)) return null;
  const earned = valueIn(row.beforeBox, currency);
  return earned === null ? null : { value: round2(earned / row.freightTons), currency };
}

/** A shipment someone thinks of adding: its cargo, and what it would earn per W/M before the box. */
export interface WhatIfInput {
  cbm: number;
  kg: number;
  rate: number;
}

export interface WhatIf {
  currency: "EUR" | "CZK";
  /** The newcomer's W/M: the greater of its tonnes and its cbm. */
  wm: number;
  /** The box after it: each meter's percentage, and whether it would be over. */
  volumePct: number | null;
  weightPct: number | null;
  over: boolean;
  /** What it earns before the box, the share of the box it would carry, and what is left of it after. */
  earns: number;
  share: number;
  after: number;
  /** The sailing's profit today and with it. */
  profitNow: number;
  profitThen: number;
  /** What the other shipments' shares of the box drop by, together. */
  othersRelief: number;
}

/**
 * "What if I add this" (B3): the box and the money with one more shipment, nothing saved. The box
 * costs stay what they are, so the newcomer's whole earning before the box goes to the profit; its
 * share of the box is the W/M share it would carry, which the others no longer do. The rate is taken
 * in boxCurrency's currency, the one the card asks for it in. Null while there are no box costs to
 * share or the input is no cargo.
 */
export function whatIfOf(e: SailingEarnings, box: BoxUtilization | null, input: WhatIfInput): WhatIf | null {
  if (!e.totals.boxCosts || !e.totals.profit || !box) return null;
  const newWm = Math.max(input.kg / 1000, input.cbm);
  if (!(newWm > 0) || !(input.rate >= 0)) return null;
  // The profit as the server works it out (before the box less the box costs), in that one currency.
  const { a: earned, b: boxCost, currency } = inOne(e.totals.beforeBox, e.totals.boxCosts);
  const profitNow = earned - boxCost;
  const pct = (meter: BoxUtilization["volume"], more: number) => (meter && meter.limit > 0 ? Math.round(((meter.used + more) / meter.limit) * 100) : null);
  const [volumePct, weightPct] = [pct(box.volume, input.cbm), pct(box.weight, input.kg)];
  const earns = round2(input.rate * newWm);
  const share = round2((boxCost * newWm) / (e.totals.freightTons + newWm));
  return {
    currency,
    wm: Math.round(newWm * 100) / 100,
    volumePct,
    weightPct,
    over: (volumePct ?? 0) > 100 || (weightPct ?? 0) > 100,
    earns,
    share,
    after: round2(earns - share),
    profitNow: round2(profitNow),
    profitThen: round2(profitNow + earns),
    othersRelief: share,
  };
}
