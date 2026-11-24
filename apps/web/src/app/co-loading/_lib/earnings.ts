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

/** One thing to know about the figures: `wrong` when it makes a total wrong, else a note on how something was counted. */
export interface EarningsCheck {
  text: string;
  wrong: boolean;
}

/**
 * What the reader must know about the figures, the gravest first, in two kinds (Council Review 7,
 * K17): what makes a total wrong until it is fixed, and how something was counted.
 */
export function earningsChecks(e: SailingEarnings): EarningsCheck[] {
  const wrong = (text: string): EarningsCheck => ({ text, wrong: true });
  const note = (text: string): EarningsCheck => ({ text, wrong: false });
  if (!e.moneyKnown) return [wrong("The shipments' selling and costs could not be read just now, so no earnings are shown. Try again in a moment.")];
  const { notes } = e;
  const out: EarningsCheck[] = [];
  const unread = e.rows.filter((r) => r.counted && !r.moneyKnown).length;
  if (unread > 0) out.push(wrong(`The money of ${shipments(unread)} could not be read: the totals are incomplete.`));
  if (notes.missingCurrencies.length > 0)
    out.push(wrong(`No exchange rate for ${notes.missingCurrencies.join(", ")}: amounts in ${notes.missingCurrencies.length === 1 ? "that currency" : "those currencies"} are left out, so the totals are incomplete.`));
  if (notes.noSelling > 0) out.push(wrong(`${shipments(notes.noSelling)} ${has(notes.noSelling)} no selling lines yet: the revenue is not complete.`));
  if (notes.unticked > 0) out.push(note(`${shipments(notes.unticked)} ${has(notes.unticked)} selling lines not ticked "Invoice": those lines are not counted.`));
  if (notes.ownBox > 0)
    out.push(note(`${shipments(notes.ownBox)} ${has(notes.ownBox)} freight, fuel or terminal handling as buying costs of ${notes.ownBox === 1 ? "its" : "their"} own. They are not counted here: the box costs cover them.`));
  if (notes.odd > 0) out.push(wrong(`${shipments(notes.odd)} ${notes.odd === 1 ? "is" : "are"} not what this box is for. Take ${notes.odd === 1 ? "it" : "them"} off the sailing: ${notes.odd === 1 ? "it takes" : "they take"} a share of the box costs meanwhile.`));
  if (notes.cargoImplausible > 0) out.push(wrong(`${shipments(notes.cargoImplausible)} ${has(notes.cargoImplausible)} cargo figures that cannot be right, so the shares of the box costs are not to be trusted until they are corrected.`));
  if (notes.cargoGap > 0) out.push(wrong(`${shipments(notes.cargoGap)} ${has(notes.cargoGap)} a weight or a volume missing: ${notes.cargoGap === 1 ? "its share" : "their shares"} of the box costs may be too low, and the others' too high.`));
  if (notes.handRoad > 0) out.push(note(`${shipments(notes.handRoad)} ${has(notes.handRoad)} road freight typed by hand. If it is the trunk haul to the hub, it belongs under Origin Costs of the box: check it is not counted twice.`));
  if (notes.inMasterJob > 0) out.push(note(`${shipments(notes.inMasterJob)} ${notes.inMasterJob === 1 ? "is" : "are"} in a master job as well. Costs shared from a master job are not counted here.`));
  if (notes.unrecognised > 0) out.push(note(`${shipments(notes.unrecognised)} ${has(notes.unrecognised)} buying lines with no charge code the app knows: they are counted as other shipment costs.`));
  // Everything about the box costs moves the profit.
  out.push(...boxWarnings(e).map(wrong));
  return out;
}

/** The same as sentences, in their order. */
export const earningsWarnings = (e: SailingEarnings): string[] => earningsChecks(e).map((c) => c.text);

/** The one line over the folded list: what there is to fix and what there is to read. */
export function checksSummary(checks: readonly EarningsCheck[]): string | null {
  const wrong = checks.filter((c) => c.wrong).length;
  const notes = checks.length - wrong;
  const parts = [wrong > 0 ? `${wrong} ${wrong === 1 ? "thing" : "things"} to fix before trusting these figures` : null, notes > 0 ? `${notes} ${notes === 1 ? "note" : "notes"} on how they were counted` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
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
  // The rates service not answering is another matter than a currency with no rate: it goes by itself.
  if (box.missingCurrencies.length > 0 && box.ratesNotRead)
    out.push(`The exchange rates could not be read just now, so the box costs in ${box.missingCurrencies.join(", ")} are left out and the profit is too high. Try again in a moment.`);
  else if (box.missingCurrencies.length > 0)
    out.push(`No exchange rate for the box costs in ${box.missingCurrencies.join(", ")}: those amounts are left out, so the profit is too high.`);
  if (box.notSet.length > 0)
    out.push(`Not set yet: ${box.notSet.map((n) => `${BOX_COST_LABEL[n.kind]}${containerOf(e, n.containerNo)}`).join(", ")}. The profit does not carry ${box.notSet.length === 1 ? "it" : "them"}.`);
  if (e.boxUnshared) out.push("No shipment has a weight or a volume, so the box costs cannot be shared: the total carries them, no shipment does.");
  else if (e.notes.noShare > 0) out.push(`${shipments(e.notes.noShare)} ${has(e.notes.noShare)} no weight and no volume, so ${e.notes.noShare === 1 ? "it carries" : "they carry"} no share of the box costs.`);
  if (box.ignoredContainers.length > 0)
    out.push(`Costs are kept for container ${box.ignoredContainers.join(", ")}, which the sailing no longer has. They are not counted.`);
  return out;
}

// As the table shows a W/M: up to two decimals, so the sentence and the table say the same figure.
const wm = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** The break-even in a sentence, or null while there is none to show. */
export function breakEvenWords(e: SailingEarnings): string | null {
  const b = e.breakEven;
  // The server works none out from box costs with amounts left out: it would read too low.
  if (!b && e.boxCosts.set && e.boxCosts.missingCurrencies.length > 0)
    return e.boxCosts.ratesNotRead ? "No break-even until the exchange rates can be read." : "No break-even until every box cost has an exchange rate.";
  if (!b) return null;
  if (b.wm === null) return `No break-even: the ${b.loadedWm === 1 ? "loaded W/M earns" : `${wm(b.loadedWm)} W/M loaded earn`} nothing before the box costs.`;
  if (b.reached) return `Break-even at ${wm(b.wm)} W/M: reached, ${wm(b.loadedWm)} W/M are loaded.`;
  const short = `Break-even at ${wm(b.wm)} W/M: not reached, ${wm(b.loadedWm)} W/M are loaded.`;
  // More than the box is planned to take, with the same mix of cargo: no load at this earning pays for it.
  if (b.boxPct !== null && b.boxPct > 100) return `${short} That is ${b.boxPct}% of the box: more than it takes, so it cannot break even at today's earning per W/M.`;
  return `${short} ${wm(Math.max(0.1, Math.round((b.wm - b.loadedWm) * 10) / 10))} W/M more at today's average earning would cover the box.`;
}

/** The loaded shipments still to price before a break-even is worked out (K11): their job numbers, to open and fix. */
export const unpricedShipments = (e: SailingEarnings): { shipmentId: string; jobNumber: string }[] =>
  e.breakEvenWaitsFor > 0 ? e.rows.filter((r) => r.counted && (r.noSelling || !r.moneyKnown)).map((r) => ({ shipmentId: r.shipmentId, jobNumber: r.jobNumber })) : [];

/** The unsold space in a sentence, or null while it is not known. */
export function unsoldWords(e: SailingEarnings): string | null {
  const u = e.unsold;
  if (!u) return null;
  if (u.pct <= 0) return "No unused space: the box is full.";
  return `Unused space: ${u.pct}% of the box against its planning limit, which is ${amountWords(u.cost).main} of the box costs. It is already inside the profit: the loaded shipments carry it.`;
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
export function boxRateWords(box: SailingBoxCosts, formatDate: (d: string) => string, closed = false): string | null {
  if (!box.set) return null;
  if (!box.rateDate) return "The exchange rates could not be read: only amounts in CZK are valued.";
  const rates = `the ČNB rates of ${formatDate(box.rateDate)}${box.eurRate ? ` (1 EUR = ${box.eurRate.toLocaleString("en-US", { maximumFractionDigits: 3 })} CZK)` : ""}`;
  if (!box.departureDate) return `Provisional: valued at ${rates}, the latest ones, because the sailing has no departure date yet. ${closed ? "The service is closed: reopen it to set the date in Edit sailing." : "Set it in Edit sailing to fix the rate."}`;
  if (box.rateProvisional) return `Provisional: valued at ${rates}, the latest ones, until the rates of the departure date, ${formatDate(box.departureDate)}, are out.`;
  return `Valued at ${rates}: the rates of the departure date, ${formatDate(box.departureDate)}.`;
}

const SAILING_FACT_LABEL: Partial<Record<BoxCostChange["kind"], string>> = { vessel: "Vessel", voyage: "Voyage", pol: "Port of Loading", pod: "Port of Discharge", hub: "HUB", container_type: "Container type" };

/** One kept change in words: "Ocean Freight of container 2: 2,100.00 USD → 2,250.00 USD". */
export function changeWords(c: BoxCostChange, severalContainers: boolean, formatDate: (d: string) => string = (d) => d): string {
  // A change of the sailing itself that moves the box costs.
  if (c.kind === "containers") return `Number of containers: ${c.oldAmount ?? "—"} → ${c.newAmount ?? "—"}`;
  if (c.kind === "departure") return `Departure date: ${c.oldNote ? formatDate(c.oldNote) : "none"} → ${c.newNote ? formatDate(c.newNote) : "none"}`;
  if (c.kind === "cutoff") return `Cut-off: ${c.oldNote ? formatDate(c.oldNote) : "none"} → ${c.newNote ? formatDate(c.newNote) : "none"}`;
  // What the sailing's own history keeps in the same record (Council Outlay 14, C3 and C5).
  if (c.kind === "stage") return `Stage: ${c.oldNote || "none"} → ${c.newNote || "none"}`;
  if (c.kind === "note") return c.newNote ? "Hand-over note changed" : "Hand-over note cleared";
  if (c.kind === "check") return c.newNote ? `Ticked: ${c.newNote}` : `Unticked: ${c.oldNote}`;
  // The sailing's own facts (Edit sailing): old and new words.
  const fact = SAILING_FACT_LABEL[c.kind];
  if (fact) return `${fact}: ${c.oldNote || "none"} → ${c.newNote || "none"}`;
  const what = `${BOX_COST_LABEL[c.kind as BoxCostKind]}${severalContainers ? ` of container ${c.containerNo}` : ""}`;
  const parts: string[] = [];
  const amountChanged = c.oldAmount !== c.newAmount || (c.newAmount !== null && c.oldCurrency !== c.newCurrency);
  if (amountChanged) parts.push(`${boxCostWords(c.oldAmount, c.oldCurrency)} → ${boxCostWords(c.newAmount, c.newCurrency)}`);
  if (c.oldNote !== c.newNote) parts.push(c.newNote ? `note "${c.newNote}"` : "note removed");
  return `${what}: ${parts.join(", ") || "saved with no change"}`;
}

/** A mark on a shipment's row: a few words, with the whole sentence to hover. */
export interface EarningsNote {
  text: string;
  tone: "amber" | "red" | "slate";
  title: string;
}

/** The marks on a shipment's row: short, so the table stays narrow; each with its sentence in full. */
export function earningsNotes(row: EarningsRow): EarningsNote[] {
  const notes: EarningsNote[] = [];
  const add = (text: string, tone: EarningsNote["tone"], title: string) => notes.push({ text, tone, title });
  if (!row.counted) add("Cancelled", "slate", "Cancelled: listed, not counted in the totals, and it carries no share of the box costs.");
  if (!row.moneyKnown) {
    add("Money not known", "red", "Its selling and costs could not be read just now.");
    return notes;
  }
  if (row.counted && row.noSelling) add("No selling lines", "amber", "No selling lines yet: it carries its share of the box costs with no revenue against it.");
  if (row.untickedLines > 0) add(`${row.untickedLines} ${row.untickedLines === 1 ? "line" : "lines"} not ticked`, "amber", `${row.untickedLines} selling ${row.untickedLines === 1 ? "line is" : "lines are"} not ticked "Invoice": not counted as revenue.`);
  if (row.missingCurrencies.length > 0) add(`No rate: ${row.missingCurrencies.join(", ")}`, "red", "Amounts in a currency with no exchange rate are left out.");
  if (row.odd) add(row.odd, "amber", `${row.odd}: not what this box is for. Take it off the sailing.`);
  if (row.noShare) add("No W/M", "amber", "No weight and no volume: it carries no share of the box costs.");
  if (row.cargoImplausible) add("Check cargo figures", "red", "Its cargo figures cannot be right, so its share of the box costs is not to be trusted.");
  else if (row.cargoGap) add(`${row.cargoGap === "weight" ? "Weight" : "Volume"} missing`, "amber", `Its ${row.cargoGap} is missing: its share of the box costs may be too low.`);
  if (row.handRoadLines > 0) add("Road freight by hand", "slate", "Road freight typed by hand: if it is the trunk haul to the hub, it belongs under Origin Costs of the box.");
  if (row.counted && lead(row.beforeBox) < 0) add("Sells below cost", "red", "Its own costs are more than it sells for, before any box costs.");
  else if (row.profit && lead(row.profit) < 0) add("Loss after box share", "red", "It earns less than its share of the box costs.");
  if (row.ownBox.czk !== 0) add(`Own freight ${amountWords(row.ownBox).main}`, "amber", "Freight, fuel or terminal handling as its own buying cost: not counted here, the box costs cover it.");
  if (row.inMasterJob) add("Master job", "slate", "In a master job as well: costs shared from the master job are not counted here.");
  if (row.unrecognisedLines > 0) add(`${row.unrecognisedLines} ${row.unrecognisedLines === 1 ? "line" : "lines"}, no code`, "slate", "Buying lines with no charge code the app knows: counted as other costs.");
  return notes;
}

/** The hint under "Invoiced so far": how much of the revenue is on invoices. */
export function invoicedHint(e: SailingEarnings): string {
  const { selling, invoiced } = e.totals;
  if (selling.czk <= 0) return "nothing to invoice yet";
  // "All" only when all of it is: 99.6% is not all of the revenue.
  if (invoiced.czk >= selling.czk) return "fully invoiced";
  return `${Math.min(99, Math.floor((invoiced.czk / selling.czk) * 100))}% invoiced`;
}
