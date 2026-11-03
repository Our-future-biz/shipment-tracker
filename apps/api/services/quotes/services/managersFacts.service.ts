import { addDays, businessDay } from "../../../lib/businessDate";
import { quoteMargin } from "../lib/quoteMargin";
import { roadMargin } from "../lib/roadMargin";
import { companyPeople } from "../lib/people";
import type { SalesManagersFacts, SalesManagersQuoteFact } from "../interfaces/interfaces";
import { salesQuoteRepository } from "../repositories/salesQuote.repository";
import type { SalesQuoteRecord } from "../schemas/quote.schema";
import { isPlainObject } from "../utils/quoteDocument.utils";
import { effectiveStatus, isFollowUpDue, lastContact, stateOf } from "../utils/quoteLifecycle.utils";
import { readInquiry } from "../utils/warehouseInquiry.utils";
import { marginsFor, todaysSheet } from "./marginRates";
import { quoteInquiryRepository } from "../repositories/quoteInquiry.repository";
import type { QuoteInquiryRecord } from "../schemas/quoteInquiry.schema";
import { isEscalated, officeMinutesBetween } from "../lib/marginInquiry";
import { ownerBackfillService } from "./ownerBackfill.service";
import type { MarginContext } from "../lib/roadMargin";
import type { QuoteRates } from "../lib/quoteMargin";

// What the Sales managers' cockpit judges, quote by quote (Council Outlay 6, step 2). The sales
// service turns these into tiles and cards; the facts are the quotes service's, as its own lists
// show them: the status as shown, the follow-up, the owner by e-mail, the margin as the editor
// works it out.

/** Quotes read at most; past it the cockpit says it shows part of them. */
export const MANAGERS_ROWS_LIMIT = 2000;
/** Expired quotes stay on the cockpit this many days after their validity ended. */
const EXPIRED_DAYS = 7;
/** Won quotes with a shipment are read this many days back (a loss is still news). */
const WON_DAYS = 30;

const str = (value: unknown) => (typeof value === "string" ? value : "");
const ymd = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);
const iso = (at: Date | null) => at?.toISOString() ?? null;

export function factOf(
  row: SalesQuoteRecord,
  userEmails: Map<string, string>,
  now: Date,
  sheet: QuoteRates,
  margins: MarginContext | undefined,
  pending?: QuoteInquiryRecord,
): SalesManagersQuoteFact {
  const state = stateOf(row);
  const today = businessDay(now);
  const data = isPlainObject(row.data) ? row.data : {};
  const margin = quoteMargin(data, sheet);
  const road = margins ? roadMargin(data, margins) : null;
  const inquiry = readInquiry(data);
  return {
    quoteNumber: row.quoteNumber,
    status: state.status,
    shownStatus: effectiveStatus(state.status, state.validUntil, today),
    serviceType: str(data.serviceType),
    customer: str(data.customerName),
    customerId: row.customerId,
    ownerUserId: state.ownerUserId,
    ownerName: (state.ownerUserId && userEmails.get(state.ownerUserId)) || state.ownerLabel,
    createdAt: row.createdAt.toISOString(),
    firstSentAt: iso(state.firstSentAt),
    decidedAt: iso(state.decidedAt),
    validUntil: state.validUntil,
    lastContactAt: iso(lastContact(state)),
    followUpDue: isFollowUpDue(state, now, today),
    shipmentId: state.shipmentId,
    readyDate: ymd(data.readyDate),
    sellingCzk: margin?.sellingCzk ?? 0,
    marginCzk: margin?.marginCzk ?? null,
    marginPercent: margin?.marginPercent ?? null,
    marginProblem: margin?.problem ?? null,
    belowRoadFloor: road?.needsApproval ?? false,
    warehouseInquiry: inquiry ? { status: inquiry.status, requestedAt: inquiry.requestedAt } : null,
    marginInquiry: pending
      ? {
          requestedAt: pending.requestedAt.toISOString(),
          needsBy: pending.needsBy?.toISOString() ?? null,
          escalated: isEscalated({ requestedAt: pending.requestedAt, needsBy: pending.needsBy, notifyUserId: pending.notifyUserId }, now),
          waitedOfficeMinutes: officeMinutesBetween(pending.requestedAt, now),
          askedMarginCzk: pending.snapshot.marginCzk,
        }
      : null,
  };
}

class ManagersFactsService {
  async facts(companyId: string): Promise<SalesManagersFacts> {
    // As every read of sales quotes starts (SalesQuoteService.catchUp).
    await salesQuoteRepository.adoptPending(companyId);
    await ownerBackfillService.ensureOwnersMatched(companyId);
    const now = new Date();
    const today = businessDay(now);
    const { rows, capped } = await salesQuoteRepository.managersRows(
      companyId,
      { today, expiredSince: addDays(today, -EXPIRED_DAYS), wonSince: addDays(today, -WON_DAYS), decidedSince: `${today.slice(0, 8)}01` },
      MANAGERS_ROWS_LIMIT,
    );
    const [people, sheet, margins, pending] = await Promise.all([companyPeople(), todaysSheet(now), marginsFor(rows, now), quoteInquiryRepository.pending(companyId)]);
    const pendingByQuote = new Map(pending.map((p) => [p.quoteId, p]));
    return { today, quotes: rows.map((row) => factOf(row, people.emails, now, sheet, margins, pendingByQuote.get(row.id))), capped };
  }
}

export const managersFactsService = new ManagersFactsService();
