import log from "encore.dev/log";
import { getAuthData } from "~encore/auth";
import { chargeLabel } from "../../../lib/chargeCodes";
import { qtyOrOne } from "../lib/invoiceCalc";
import { chargeChangeOf } from "../lib/shipmentStatus";
import { invoiceRepository } from "../repositories/invoice.repository";
import { invoiceFollowupOutboxRepository } from "../repositories/invoiceFollowupOutbox.repository";
import type { AfterSellingSetWrite, AfterSellingWrite, SellingLineValue, SellingLineWrite } from "../repositories/sellingCost.repository";
import { deliverInvoiceFollowups, followupsOfSellingChange } from "./invoiceFollowups.service";

// What a selling line written by hand owes the shipment's statuses (mock test council X1 / K14):
// a line that became a charge, or whose value changed, on a job with an open invoice is a charge not
// invoiced - a job that read Invoiced goes back to Not Invoiced (and Billed back to Billing), as after
// a credit note; one that stopped being a charge (deleted, its value set to nothing) may leave the
// rest all invoiced - Invoiced again, as after an issue (lib/shipmentStatus chargeChangeOf,
// services/invoiceFollowups followupsOfSellingChange). The follow-up is written in the line's own
// transaction, under the job's newest open invoice, and sent after the commit (retried by the
// followups cron). A job with no open invoice has nothing invoiced to move back from: nothing is
// written. Kept apart from services/invoicing so that what it loads (the signed-in user, the outbox)
// is loaded only by what follows a line. The same hook follows the other writes of a valued selling
// line: a Trucking push (its lines replaced, or a "Price change after invoice" line added to a set on
// an issued invoice) and a split row's amount set or approved, or its removal approved.

/** A selling line in words, as its follow-up names it: its own text (else its charge) and what it comes to - "Demurrage 300.00 EUR". */
export function chargeText(row: SellingLineValue): string {
  const name = (row.description ?? "").trim() || chargeLabel(row.category ?? "").trim() || "Selling line";
  const total = Number(row.amount ?? 0) * qtyOrOne(row.qty);
  return [name, Number.isFinite(total) ? total.toFixed(2) : "", (row.currency ?? "").trim()].filter(Boolean).join(" ");
}

/** At most this many lines are named in one follow-up; the rest are counted ("and 2 more"). */
const NAMED_LINES = 3;

const namesOf = (lines: SellingLineValue[]): string => {
  const named = lines.slice(0, NAMED_LINES).map(chargeText).join(", ");
  return lines.length > NAMED_LINES ? `${named} and ${lines.length - NAMED_LINES} more` : named;
};

const centsOf = (line: SellingLineValue): number => Math.round(Number(line.amount ?? 0) * qtyOrOne(line.qty) * 100);

/**
 * What a write of several lines does to the job's charges, as one change: "added" when any line
 * became a charge (it is on no invoice, so the job no longer has all of them invoiced - whatever else
 * the write took away), else "removed" when any stopped being one. A line taken away and another of
 * the same value put in its place (a Trucking push of the same price again) cancel out: the job's
 * charges are as they were, and nothing is owed.
 */
export function setChangeOf(writes: SellingLineWrite[]): { change: "added" | "removed"; lines: SellingLineValue[] } | null {
  const added: SellingLineValue[] = [];
  const removed: SellingLineValue[] = [];
  for (const { before, now } of writes) {
    const change = chargeChangeOf(before, now);
    if (change === "added") {
      // A line whose value changed is its old value gone and the new one come.
      if (before && centsOf(before) !== 0) removed.push(before);
      added.push(now!);
    } else if (change === "removed") removed.push(before!);
  }
  for (let i = added.length - 1; i >= 0; i--) {
    const twin = removed.findIndex((r) => centsOf(r) === centsOf(added[i]!));
    if (twin < 0) continue;
    removed.splice(twin, 1);
    added.splice(i, 1);
  }
  if (added.length) return { change: "added", lines: added };
  if (removed.length) return { change: "removed", lines: removed };
  return null;
}

/**
 * The hook a selling line's write runs in its transaction (`after`; `afterSet` for a write of several
 * lines at once - a Trucking push), and what to send once it has committed (`deliver`: the follow-ups
 * of the invoice the hook wrote under, straight away; never throws).
 */
export function statusesFollow(
  companyId: string,
  shipmentId: string,
): { after: AfterSellingWrite; afterSet: AfterSellingSetWrite; deliver: () => Promise<void> } {
  let owed: string | null = null;
  const afterSet: AfterSellingSetWrite = async (tx, writes) => {
    const set = setChangeOf(writes);
    if (!set) return;
    const invoiceId = await invoiceRepository.latestOpenInvoiceId(shipmentId, companyId, tx);
    if (!invoiceId) return;
    // The selling endpoints are signed in, and Trucking's push is sent as its user: the follow-up is sent as that user.
    const auth = getAuthData();
    if (!auth) {
      log.warn("a selling line's change was not followed by the shipment's statuses: no user", { companyId, shipmentId });
      return;
    }
    const sale = { companyId, shipmentId, invoiceId, change: set.change, charge: namesOf(set.lines) };
    await invoiceFollowupOutboxRepository.enqueue(tx, followupsOfSellingChange(sale, { userId: auth.userID, role: auth.role }));
    owed = invoiceId;
  };
  const after: AfterSellingWrite = (tx, before, now) => afterSet(tx, [{ before, now }]);
  // Sent straight away; what a service does not take now is sent again by the followups cron.
  const deliver = async () => {
    if (owed) await deliverInvoiceFollowups(owed);
  };
  return { after, afterSet, deliver };
}
