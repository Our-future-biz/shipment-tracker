import { inTx } from "../db/db";
import { consignmentRepository } from "../repositories/consignment.repository";
import { appendEvent } from "../repositories/event.repository";
import type { TruckingOutboxRecord } from "../schemas/truckingOutbox.schema";
import { roundToStep } from "../lib/rateEngine";

// A price change after the customer invoice (decision 9): Invoicing keeps the invoiced selling set
// and adds only the difference as its own line ("<sourceRef>:diff:<n>", "Price change after
// invoice"). Trucking reads that answer after each costs push and records every difference line it
// has not recorded yet: an event and a notice in Needs attention (until a manager clears it). Keyed
// by the line, so a retried push records it once.

/** A difference line as Invoicing answers it (TruckingLinesResult.differences). */
export interface SellingDifference {
  sourceRef: string;
  currency: string;
  amount: number;
}

const signed = (n: number, currency: string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${roundToStep(Math.abs(n), 0.01).toLocaleString("en-US").replace(/,/g, " ")} ${currency}`;

/** Records the difference lines of a costs push on the row's consignment; never throws for a consignment that is gone. */
export async function recordSellingDifferences(row: Pick<TruckingOutboxRecord, "companyId" | "consignmentId">, differences: SellingDifference[] | undefined): Promise<number> {
  if (!differences?.length) return 0;
  const c = await consignmentRepository.find(row.companyId, row.consignmentId);
  if (!c) return 0;
  const known = new Set((c.notices ?? []).map((n) => n.key));
  const fresh = differences.filter((d) => !known.has(`${d.sourceRef}|${d.currency}`));
  if (!fresh.length) return 0;
  let added = 0;
  await inTx(async (tx) => {
    for (const d of fresh) {
      const key = `${d.sourceRef}|${d.currency}`;
      const amount = signed(d.amount, d.currency);
      const notice = {
        key,
        code: "PRICE_CHANGE_AFTER_INVOICE" as const,
        text: `Price change after invoice: ${amount} added to job ${c.jobNumber} as its own line — invoice it${d.amount < 0 ? " as a credit note" : ""}`,
        at: new Date().toISOString(),
      };
      if (!(await consignmentRepository.addNotice(tx, c.companyId, c.id, notice))) continue;
      added++;
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
