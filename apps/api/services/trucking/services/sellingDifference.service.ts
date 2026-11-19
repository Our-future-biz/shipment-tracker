import { db, inTx } from "../db/db";
import { consignmentRepository } from "../repositories/consignment.repository";
import { appendEvent, recordedNoticeKeys } from "../repositories/event.repository";
import type { TruckingOutboxRecord } from "../schemas/truckingOutbox.schema";
import type { ConsignmentNotice } from "../interfaces/interfaces";
import { roundToStep } from "../lib/rateEngine";

// A price change after the customer invoice (decision 9): Invoicing keeps the invoiced selling set
// and adds only the difference as its own line ("<sourceRef>:diff:<n>", "Price change after
// invoice"). Trucking reads that answer after each costs push and records every difference line it
// has not recorded yet: an event and a notice in Needs attention (until a manager clears it). Keyed
// by the line, so a retried push records it once - and a later push, which answers every difference
// line of the set again, never brings back a notice a manager cleared (the events keep the keys).
// One notice per set and currency: a newer line replaces the notice of an earlier one. A price changed
// again before its difference was invoiced is a new line in place of the open one (1000 → 950 → 900:
// −50, then −100 instead), and what a partial credit note left owed of a line is a new line too - the
// notices of both would add up to more than is owed.

/** A difference line as Invoicing answers it (TruckingLinesResult.differences). */
export interface SellingDifference {
  sourceRef: string;
  currency: string;
  amount: number;
}

const signed = (n: number, currency: string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${roundToStep(Math.abs(n), 0.01).toLocaleString("en-US")} ${currency}`;

const DIFF = ":diff:";
/** A difference line's set ("<set>:diff:<n>" without ":diff:<n>") and number. */
const lineOf = (ref: string) => {
  const at = ref.lastIndexOf(DIFF);
  return at < 0 ? { set: ref, n: 0 } : { set: ref.slice(0, at), n: Number(ref.slice(at + DIFF.length)) || 0 };
};
/** Whether a notice is about a difference line of this set in this currency (its key "<ref>|<currency>"). */
const sameSetAndCurrency = (notice: ConsignmentNotice, d: SellingDifference) => {
  const at = notice.key.lastIndexOf("|");
  return notice.code === "PRICE_CHANGE_AFTER_INVOICE" && at >= 0 && notice.key.slice(at + 1) === d.currency && lineOf(notice.key.slice(0, at)).set === lineOf(d.sourceRef).set;
};

/** Records the difference lines of a costs push on the row's consignment; never throws for a consignment that is gone. */
export async function recordSellingDifferences(row: Pick<TruckingOutboxRecord, "companyId" | "consignmentId">, differences: SellingDifference[] | undefined): Promise<number> {
  if (!differences?.length) return 0;
  const c = await consignmentRepository.find(row.companyId, row.consignmentId);
  if (!c) return 0;
  const known = new Set([...(c.notices ?? []).map((n) => n.key), ...(await recordedNoticeKeys(db, c.companyId, c.id, "selling_difference_pushed"))]);
  // Oldest line first: of one set and currency, the newest line's notice is the one that stays.
  const fresh = differences.filter((d) => !known.has(`${d.sourceRef}|${d.currency}`)).sort((a, b) => lineOf(a.sourceRef).n - lineOf(b.sourceRef).n);
  if (!fresh.length) return 0;
  let added = 0;
  let notices = [...(c.notices ?? [])];
  await inTx(async (tx) => {
    for (const d of fresh) {
      const key = `${d.sourceRef}|${d.currency}`;
      const amount = signed(d.amount, d.currency);
      const notice = {
        key,
        code: "PRICE_CHANGE_AFTER_INVOICE" as const,
        // A lower price is a credit owed: it leaves the job Invoiced, and a credit note of the invoice gives it (Y1 / P1).
        text:
          d.amount < 0
            ? `Price change after invoice: ${amount} on job ${c.jobNumber} — a credit is owed: give it on a credit note of the invoice`
            : `Price change after invoice: ${amount} added to job ${c.jobNumber} as its own line — invoice it`,
        at: new Date().toISOString(),
      };
      if (!(await consignmentRepository.addNotice(tx, c.companyId, c.id, notice))) continue;
      added++;
      // What an earlier line of the set said in this currency is no longer what is owed or to bill: this line says it now.
      const replaced = notices.filter((n) => n.key !== key && sameSetAndCurrency(n, d)).map((n) => n.key);
      if (replaced.length) await consignmentRepository.removeNotices(tx, c.companyId, c.id, replaced);
      notices = [...notices.filter((n) => !replaced.includes(n.key)), notice];
      await appendEvent(tx, c.companyId, {
        kind: "selling_difference_pushed",
        consignmentId: c.id,
        byUserId: null,
        byName: "Invoicing",
        payload: {
          changes: {},
          summary: `The customer invoice was issued already: the price change of ${amount} was added to job ${c.jobNumber} as "Price change after invoice"`,
          facts: { sourceRef: d.sourceRef, currency: d.currency, amount: d.amount, noticeKey: key },
        },
      });
    }
  });
  return added;
}
