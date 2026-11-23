// A Co-Loading Concept sailing's Earnings tab in words and figures (Council Outlay 13). Pure, so it
// is tested without React. The server works the figures out (api lib/coLoadingEarnings); this says them.

import type { interfaces } from "@/lib/api/client";
import { fmtMoney } from "@/lib/money";

export type SailingEarnings = interfaces.SailingEarnings;
export type EarningsRow = interfaces.EarningsRow;
export type EarningsAmount = interfaces.EarningsAmount;

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
  return out;
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
  if (row.counted && row.beforeBox.czk < 0) notes.push({ text: "Costs more than it sells for", tone: "red" });
  if (row.ownBox.czk !== 0) notes.push({ text: `Own freight costs ${amountWords(row.ownBox).main}: not counted`, tone: "amber" });
  if (row.inMasterJob) notes.push({ text: "In a master job", tone: "slate" });
  if (row.unrecognisedLines > 0) notes.push({ text: `${row.unrecognisedLines} cost ${row.unrecognisedLines === 1 ? "line" : "lines"} without a code`, tone: "slate" });
  return notes;
}

/** The hint under "Invoiced so far": how much of the revenue is on invoices. */
export function invoicedHint(e: SailingEarnings): string {
  const { selling, invoiced } = e.totals;
  if (selling.czk <= 0) return "nothing to invoice yet";
  const pct = Math.round((invoiced.czk / selling.czk) * 100);
  return pct >= 100 ? "all of the revenue" : `${pct}% of the revenue`;
}
