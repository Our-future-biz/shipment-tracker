import log from "encore.dev/log";
import { getAuthData } from "~encore/auth";
import { chargeLabel } from "../../../lib/chargeCodes";
import { qtyOrOne } from "../lib/invoiceCalc";
import { centsOf, chargeChangeOf, owedCentsOf } from "../lib/shipmentStatus";
import { generatedInvoiceRepository } from "../repositories/generatedInvoice.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { invoiceFollowupOutboxRepository } from "../repositories/invoiceFollowupOutbox.repository";
import type { AfterSellingSetWrite, AfterSellingWrite, SellingLineValue, SellingLineWrite } from "../repositories/sellingCost.repository";
import { deliverInvoiceFollowups, followStatuses, followupsOfSellingChange, type FollowupActor } from "./invoiceFollowups.service";

// What a selling line written by hand owes the shipment's statuses (mock test council X1 / K14):
// a line that asks the customer for more (a new charge, or its value raised) on an invoiced job is a
// charge not invoiced - a job that read Invoiced goes back to Not Invoiced (and Billed back to
// Billing), as after a credit note; one that stopped being a charge (deleted, its value set to
// nothing) may leave the rest all invoiced - Invoiced again, as after an issue (lib/shipmentStatus
// chargeChangeOf, services/invoiceFollowups followupsOfSellingChange). A line below nothing is a
// credit owed and moves nothing (Y1 / P1). The follow-up is written in the line's own transaction,
// under the job's newest open invoice, and sent after the commit (retried by the followups cron).
//
// A charge added to a job with no open invoice is followed too (n10): the job may read Invoiced all
// the same (its invoices credited meanwhile, or marked so before every charge had to be). The row is
// kept under its newest invoice of any state; with none in this database (a job the old generator
// billed) the statuses are moved straight after the commit, once. A charge taken away from such a job
// moves nothing: with nothing on an open invoice it can't read Invoiced by its charges.
//
// Kept apart from services/invoicing so that what it loads (the signed-in user, the outbox) is loaded
// only by what follows a line. The same hook follows the other writes of a valued selling line: a
// Trucking push (its lines replaced, or a "Price change after invoice" line added to a set on an
// issued invoice), a split row's amount set or approved, its removal approved, and a house's split
// rows dropped when it leaves its master job.

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

/**
 * What a write of several lines does to the job's charges, as one change (Y1 / P1): "added" only when
 * the write raised what the job asks the customer to pay - its lines above nothing come to more after
 * it than before. A Trucking price lowered after the invoice, a credit owed, a set put back at the same
 * price raise nothing. The lines named are the ones new or raised; a line taken away and another of the
 * same value put in its place cancel out. Else "removed" when a line that asked something asks nothing
 * any more (the rest may all be invoiced now); else null.
 */
export function setChangeOf(writes: SellingLineWrite[]): { change: "added" | "removed"; lines: SellingLineValue[] } | null {
  let owedBefore = 0;
  let owedNow = 0;
  const added: SellingLineValue[] = [];
  const lowered: SellingLineValue[] = [];
  const gone: SellingLineValue[] = [];
  for (const { before, now } of writes) {
    owedBefore += owedCentsOf(before);
    owedNow += owedCentsOf(now);
    const change = chargeChangeOf(before, now);
    if (change === "added") {
      // A line whose value changed is its old value gone and the new one come.
      if (owedCentsOf(before) > 0) lowered.push(before!);
      added.push(now!);
    } else if (change === "removed") {
      gone.push(before!);
      lowered.push(before!);
    } else if (before && owedCentsOf(before) > owedCentsOf(now)) lowered.push(before);
  }
  if (owedNow > owedBefore) {
    const named = [...added];
    const left = [...lowered];
    for (let i = named.length - 1; i >= 0; i--) {
      const twin = left.findIndex((r) => centsOf(r) === centsOf(named[i]!));
      if (twin < 0) continue;
      left.splice(twin, 1);
      named.splice(i, 1);
    }
    return { change: "added", lines: named.length ? named : added };
  }
  // A line taken away and one of the same value put back (the same price pushed again) took nothing away.
  const left = [...added];
  const removed = gone.filter((g) => {
    const twin = left.findIndex((a) => centsOf(a) === centsOf(g));
    if (twin < 0) return true;
    left.splice(twin, 1);
    return false;
  });
  return removed.length ? { change: "removed", lines: removed } : null;
}

/**
 * The hook a selling line's write runs in its transaction (`after`; `afterSet` for a write of several
 * lines at once - a Trucking push), and what to send once it has committed (`deliver`: the follow-ups
 * of the invoice the hook wrote under, straight away - or, for a job with no invoice to write under,
 * its statuses moved at once; never throws).
 */
export function statusesFollow(
  companyId: string,
  shipmentId: string,
): { after: AfterSellingWrite; afterSet: AfterSellingSetWrite; deliver: () => Promise<void> } {
  let owed: string | null = null;
  let moveNow: FollowupActor | null = null;
  const afterSet: AfterSellingSetWrite = async (tx, writes) => {
    const set = setChangeOf(writes);
    if (!set) return;
    const added = set.change === "added";
    const invoiceId =
      (await invoiceRepository.latestOpenInvoiceId(shipmentId, companyId, tx)) ?? (added ? await invoiceRepository.latestInvoiceId(shipmentId, companyId, tx) : null);
    if (!invoiceId && !added) return;
    // The selling endpoints are signed in, and Trucking's push is sent as its user: the follow-up is sent as that user.
    const auth = getAuthData();
    if (!auth) {
      log.warn("a selling line's change was not followed by the shipment's statuses: no user", { companyId, shipmentId });
      return;
    }
    const actor = { userId: auth.userID, role: auth.role };
    if (!invoiceId) {
      moveNow = actor;
      return;
    }
    const sale = { companyId, shipmentId, invoiceId, change: set.change, charge: namesOf(set.lines) };
    await invoiceFollowupOutboxRepository.enqueue(tx, followupsOfSellingChange(sale, actor));
    owed = invoiceId;
  };
  const after: AfterSellingWrite = (tx, before, now) => afterSet(tx, [{ before, now }]);
  // Sent straight away; what a service does not take now is sent again by the followups cron.
  const deliver = async () => {
    if (owed) await deliverInvoiceFollowups(owed);
    if (moveNow) await moveWithoutInvoice(companyId, shipmentId, moveNow);
  };
  return { after, afterSet, deliver };
}

/**
 * A charge added to a job with no invoice in this database: of those, only a job the old invoice
 * generator billed can read Invoiced (any other is Invoiced only by its invoices), so only its
 * statuses are looked at - at once, as after a credit note. Not retried: the Money tab's "Work not
 * invoiced on a job that reads Invoiced" is the net for one that could not be moved. Never throws.
 */
async function moveWithoutInvoice(companyId: string, shipmentId: string, actor: FollowupActor): Promise<void> {
  try {
    if (!(await generatedInvoiceRepository.shipmentIdsWithInvoices([shipmentId], companyId)).length) return;
    await followStatuses(companyId, shipmentId, "status_after_credit", actor);
  } catch (err) {
    log.warn(err, "a charge added to a job the old generator billed: its statuses could not be moved", { companyId, shipmentId });
  }
}
