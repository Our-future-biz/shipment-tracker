// A Co-Loading Concept sailing's Earnings tab in words and figures (Council Outlay 13). Pure, so it
// is tested without React. The server works the figures out (api lib/coLoadingEarnings); this says them.

import type { interfaces } from "@/lib/api/client";
import { fmtMoney } from "@/lib/money";

export type SailingEarnings = interfaces.SailingEarnings;
export type EarningsRow = interfaces.EarningsRow;
export type EarningsAmount = interfaces.EarningsAmount;
export type SailingBoxCosts = interfaces.SailingBoxCosts;
export type BoxCostKind = interfaces.BoxCostKind;
export type BoxCostChange = interfaces.BoxCostChange;

export const BOX_COST_LABEL: Record<BoxCostKind, string> = { origin: "Origin Costs", ocean: "Ocean Freight", destination: "Destination Costs" };
/** The currencies a box cost is typed in: EUR first, as most are. */
export const BOX_COST_CURRENCIES = ["EUR", "USD", "CZK", "GBP", "CHF", "CNY", "JPY"] as const;

/** An amount as one figure: the one shown as the main one - EUR, or CZK where no EUR rate is known. It decides profit or loss and the colour. */
export const lead = (a: EarningsAmount): number => a.eur ?? a.czk;

/** An amount as the tab shows it: EUR first with CZK underneath; CZK alone where no EUR rate is known. */
export function amountWords(a: EarningsAmount): { main: string; under: string | null } {
  if (a.eur === null) return { main: fmtMoney(a.czk, "CZK", true), under: null };
  return { main: fmtMoney(a.eur, "EUR", true), under: fmtMoney(a.czk, "CZK", true) };
}

const shipments = (n: number) => `${n} ${n === 1 ? "shipment" : "shipments"}`;
const has = (n: number) => (n === 1 ? "has" : "have");

/** What the reader must know before trusting the totals, the gravest first; empty when nothing is off. */
export function earningsWarnings(e: SailingEarnings): string[] {
  if (!e.moneyKnown) return ["The shipments' selling and costs could not be read just now, so no earnings are shown. Try again in a moment."];
  const { notes } = e;
  const out: string[] = [];
  const unread = e.rows.filter((r) => r.counted && !r.moneyKnown).length;
  if (unread > 0) out.push(`The money of ${shipments(unread)} could not be read: the totals are incomplete.`);
  if (notes.missingCurrencies.length > 0)
    out.push(`No exchange rate for ${notes.missingCurrencies.join(", ")}: amounts in ${notes.missingCurrencies.length === 1 ? "that currency" : "those currencies"} are left out, so the totals are incomplete.`);
  if (notes.noSelling > 0) out.push(`${shipments(notes.noSelling)} ${has(notes.noSelling)} no selling lines yet: the revenue is not complete.`);
  if (notes.unticked > 0) out.push(`${shipments(notes.unticked)} ${has(notes.unticked)} selling lines not ticked "Invoice": those lines are not counted.`);
  if (notes.ownBox > 0)
    out.push(`${shipments(notes.ownBox)} ${has(notes.ownBox)} freight or local charges as buying costs of ${notes.ownBox === 1 ? "its" : "their"} own. They are not counted here: the box's costs cover them.`);
  if (notes.inMasterJob > 0) out.push(`${shipments(notes.inMasterJob)} ${notes.inMasterJob === 1 ? "is" : "are"} in a master job as well. Costs shared from a master job are not counted here.`);
  if (notes.unrecognised > 0) out.push(`${shipments(notes.unrecognised)} ${has(notes.unrecognised)} buying lines with no charge code the app knows: they are counted as other shipment costs.`);
  out.push(...boxWarnings(e));
  return out;
}

const containerOf = (e: SailingEarnings, containerNo: number) => (e.boxCosts.containers.length > 1 ? ` of container ${containerNo}` : "");

/** Whether the profit is provisional: a box cost is set and its rate may still move. Shown as a mark, not a warning. */
export const profitProvisional = (e: SailingEarnings): boolean =>
  e.boxCosts.set && e.boxCosts.rateProvisional && e.boxCosts.containers.some((c) => c.lines.some((l) => l.amount !== null && l.currency !== "CZK"));

/** What is off about the box costs, in words. */
function boxWarnings(e: SailingEarnings): string[] {
  const box = e.boxCosts;
  if (!box.set) return [];
  const out: string[] = [];
  if (box.missingCurrencies.length > 0)
    out.push(`No exchange rate for the box costs in ${box.missingCurrencies.join(", ")}: those amounts are left out, so the profit is too high.`);
  if (box.notSet.length > 0)
    out.push(`Not set yet: ${box.notSet.map((n) => `${BOX_COST_LABEL[n.kind]}${containerOf(e, n.containerNo)}`).join(", ")}. The profit does not carry ${box.notSet.length === 1 ? "it" : "them"}.`);
  if (e.boxUnshared) out.push("No shipment has a weight or a volume, so the box costs cannot be shared: the total carries them, no shipment does.");
  else if (e.notes.noShare > 0) out.push(`${shipments(e.notes.noShare)} ${has(e.notes.noShare)} no weight and no volume, so ${e.notes.noShare === 1 ? "it carries" : "they carry"} no share of the box costs.`);
  if (box.ignoredContainers.length > 0)
    out.push(`Costs are kept for container ${box.ignoredContainers.join(", ")}, which the sailing no longer has. They are not counted.`);
  return out;
}

const wm = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** The break-even in a sentence, or null while there is none to show. */
export function breakEvenWords(e: SailingEarnings): string | null {
  const b = e.breakEven;
  if (!b) return null;
  if (b.wm === null) return `No break-even: the ${b.loadedWm === 1 ? "loaded W/M earns" : `${wm(b.loadedWm)} W/M loaded earn`} nothing before the box costs.`;
  return b.reached
    ? `Break-even at ${wm(b.wm)} W/M: reached, ${wm(b.loadedWm)} W/M are loaded.`
    : `Break-even at ${wm(b.wm)} W/M: not reached, ${wm(b.loadedWm)} W/M are loaded. ${wm(Math.max(0.1, Math.round((b.wm - b.loadedWm) * 10) / 10))} W/M more at today's average earning would cover the box.`;
}

/** The unsold space in a sentence, or null while it is not known. */
export function unsoldWords(e: SailingEarnings): string | null {
  const u = e.unsold;
  if (!u) return null;
  if (u.pct <= 0) return "No unsold space: the box is full.";
  return `Unsold space: ${u.pct}% of the box, which is ${amountWords(u.cost).main} of the box costs. The loaded shipments carry it.`;
}

/** A sailing's earnings as its profit at a glance (the server gives the same for the list of sailings). */
export const sailingProfitOf = (sailingId: string, e: SailingEarnings): interfaces.SailingProfit => ({
  sailingId,
  moneyKnown: e.moneyKnown,
  boxCostsSet: e.boxCosts.set,
  profit: e.moneyKnown ? e.totals.profit : null,
  marginPct: e.moneyKnown ? e.totals.marginPct : null,
  complete: e.complete,
  boxCostsComplete: e.boxCosts.notSet.length === 0 && e.boxCosts.ignoredContainers.length === 0,
  revenueComplete: e.notes.noSelling === 0,
  provisional: profitProvisional(e),
});

/** What makes a profit less than final, the gravest first, in a few words each; empty for a firm profit. */
export function profitRemarks(p: Pick<interfaces.SailingProfit, "complete" | "boxCostsComplete" | "revenueComplete" | "provisional">): string[] {
  const out: string[] = [];
  if (!p.complete) out.push("incomplete");
  if (!p.boxCostsComplete) out.push("box costs not complete");
  if (!p.revenueComplete) out.push("revenue not complete");
  if (p.provisional) out.push("provisional");
  return out;
}

/** A sailing's profit for its header and the list of sailings: the figure, a remark and a tone. */
export function profitGlance(p: interfaces.SailingProfit | null | undefined): { main: string; note: string | null; tone: "red" | "amber" | "slate" | null } {
  // No answer for the sailing: the read failed. Never a dash, which would read as "nothing to show".
  if (!p) return { main: "Could not be read", note: null, tone: "amber" };
  if (!p.moneyKnown) return { main: "Not known", note: "the shipments' money could not be read", tone: "amber" };
  if (!p.boxCostsSet || !p.profit) return { main: "No box costs yet", note: null, tone: "slate" };
  const notes = [p.marginPct === null ? null : marginWords(p.marginPct), ...profitRemarks(p)].filter(Boolean);
  return { main: amountWords(p.profit).main, note: notes.join(" · ") || null, tone: lead(p.profit) < 0 ? "red" : null };
}

/** A box cost as typed: "2,100.00 USD", or "Not set". */
export const boxCostWords = (amount: number | null, currency: string): string => (amount === null ? "Not set" : fmtMoney(amount, currency, true));

/** The margin for its tile: "24.8%", or a dash without revenue or box costs. */
export const marginWords = (pct: number | null): string => (pct === null ? "—" : `${pct.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

/** The day's rate the box costs are valued at, in words; null when nothing needed a rate. */
export function boxRateWords(box: SailingBoxCosts, formatDate: (d: string) => string): string | null {
  if (!box.set) return null;
  if (!box.rateDate) return "The exchange rates could not be read: only amounts in CZK are valued.";
  const rates = `the ČNB rates of ${formatDate(box.rateDate)}${box.eurRate ? ` (1 EUR = ${box.eurRate.toLocaleString("en-US", { maximumFractionDigits: 3 })} CZK)` : ""}`;
  if (!box.departureDate) return `Provisional: valued at ${rates}, the latest ones, because the sailing has no departure date yet. Set it in Edit sailing to fix the rate.`;
  if (box.rateProvisional) return `Provisional: valued at ${rates}, the latest ones, until the rates of the departure date, ${formatDate(box.departureDate)}, are out.`;
  return `Valued at ${rates}: the rates of the departure date, ${formatDate(box.departureDate)}.`;
}

/** One kept change in words: "Ocean Freight of container 2: 2,100.00 USD → 2,250.00 USD". */
export function changeWords(c: BoxCostChange, severalContainers: boolean): string {
  const what = `${BOX_COST_LABEL[c.kind]}${severalContainers ? ` of container ${c.containerNo}` : ""}`;
  const parts: string[] = [];
  const amountChanged = c.oldAmount !== c.newAmount || (c.newAmount !== null && c.oldCurrency !== c.newCurrency);
  if (amountChanged) parts.push(`${boxCostWords(c.oldAmount, c.oldCurrency)} → ${boxCostWords(c.newAmount, c.newCurrency)}`);
  if (c.oldNote !== c.newNote) parts.push(c.newNote ? `note "${c.newNote}"` : "note removed");
  return `${what}: ${parts.join(", ") || "saved again"}`;
}

/** The marks on a shipment's row. */
export function earningsNotes(row: EarningsRow): { text: string; tone: "amber" | "red" | "slate" }[] {
  const notes: { text: string; tone: "amber" | "red" | "slate" }[] = [];
  if (!row.counted) notes.push({ text: "Cancelled: not counted", tone: "slate" });
  if (!row.moneyKnown) {
    notes.push({ text: "Money not known", tone: "red" });
    return notes;
  }
  if (row.counted && row.noSelling) notes.push({ text: "No selling lines", tone: "amber" });
  if (row.untickedLines > 0) notes.push({ text: `${row.untickedLines} selling ${row.untickedLines === 1 ? "line" : "lines"} not ticked`, tone: "amber" });
  if (row.missingCurrencies.length > 0) notes.push({ text: `No rate: ${row.missingCurrencies.join(", ")}`, tone: "red" });
  if (row.noShare) notes.push({ text: "No weight or volume: no share of the box", tone: "amber" });
  if (row.counted && lead(row.beforeBox) < 0) notes.push({ text: "Costs more than it sells for", tone: "red" });
  else if (row.profit && lead(row.profit) < 0) notes.push({ text: "Loss after its share of the box", tone: "red" });
  if (row.ownBox.czk !== 0) notes.push({ text: `Own freight costs ${amountWords(row.ownBox).main}: not counted`, tone: "amber" });
  if (row.inMasterJob) notes.push({ text: "In a master job", tone: "slate" });
  if (row.unrecognisedLines > 0) notes.push({ text: `${row.unrecognisedLines} cost ${row.unrecognisedLines === 1 ? "line" : "lines"} without a code`, tone: "slate" });
  return notes;
}

/** The hint under "Invoiced so far": how much of the revenue is on invoices. */
export function invoicedHint(e: SailingEarnings): string {
  const { selling, invoiced } = e.totals;
  if (selling.czk <= 0) return "nothing to invoice yet";
  // "All" only when all of it is: 99.6% is not all of the revenue.
  if (invoiced.czk >= selling.czk) return "all of the revenue";
  return `${Math.min(99, Math.floor((invoiced.czk / selling.czk) * 100))}% of the revenue`;
}
