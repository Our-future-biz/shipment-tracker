import log from "encore.dev/log";
import { customers } from "~encore/clients";
import { addDays, businessDay } from "../../../lib/businessDate";
import { quoteMargin } from "../lib/quoteMargin";
import { roadMargin } from "../lib/roadMargin";
import { companyPeople } from "../lib/people";
import type { SalesManagersFacts, SalesManagersQuoteFact } from "../interfaces/interfaces";
import { salesQuoteRepository } from "../repositories/salesQuote.repository";
import type { SalesQuoteRecord } from "../schemas/quote.schema";
import { isPlainObject, isWonRevision } from "../utils/quoteDocument.utils";
import { effectiveStatus, isFollowUpDue, lastContact, stateOf } from "../utils/quoteLifecycle.utils";
import { readInquiry } from "../utils/warehouseInquiry.utils";
import { marginsFor, todaysSheet } from "./marginRates";
import { quoteInquiryRepository } from "../repositories/quoteInquiry.repository";
import type { QuoteInquiryRecord } from "../schemas/quoteInquiry.schema";
import { isEscalated, officeMinutesBetween } from "../lib/marginInquiry";
import { ownerBackfillService } from "./ownerBackfill.service";
import type { MarginContext } from "../lib/roadMargin";
import type { QuoteRates } from "../lib/quoteMargin";
import { median, overLimitCzk, statusSinceOf, type CreditFacts } from "../utils/managersFacts.utils";

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
/** The audit line counts this many days. */
export const AUDIT_DAYS = 7;
/** The team line counts this many days. */
export const TEAM_DAYS = 30;
const DAY = 86_400_000;
// Statuses a margin is asked about in (before the quote goes out).
const ASKABLE = new Set(["draft", "ready_to_send", "revised"]);


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
  credit?: CreditFacts,
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
    belowFloor: road?.needsApproval ?? false,
    wonRevision: isWonRevision(state.status, data),
    statusSince: statusSinceOf(data, row.createdAt),
    approvalAt: road?.approval && road.approvalValid ? road.approval.at : null,
    approvalLapsed: road?.approval && !road.approvalValid ? (road.approvalEnded ?? (road.marginCzk === null ? "the margin can't be worked out" : "the margin got worse")) : null,
    credit: credit ? { overdueCount: credit.overdueCount, oldestOverdueDue: credit.oldestOverdueDue, overLimitCzk: overLimitCzk(credit, sheet) } : null,
    warehouseInquiry: inquiry ? { status: inquiry.status, requestedAt: inquiry.requestedAt } : null,
    marginInquiry: pending
      ? {
          requestedAt: pending.requestedAt.toISOString(),
          needsBy: pending.needsBy?.toISOString() ?? null,
          escalated: isEscalated({ requestedAt: pending.requestedAt, needsBy: pending.needsBy, notifyUserId: pending.notifyUserId }, now),
          waitedOfficeMinutes: officeMinutesBetween(pending.requestedAt, now),
          askedMarginCzk: pending.snapshot?.marginCzk ?? null,
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
    const customerIds = [...new Set(rows.map((r) => r.customerId).filter((id): id is string => !!id))];
    const teamSince = new Date(now.getTime() - TEAM_DAYS * DAY);
    const [people, sheet, margins, pending, credits, team, asked, unseen] = await Promise.all([
      companyPeople(),
      todaysSheet(now),
      marginsFor(companyId, rows, now),
      quoteInquiryRepository.pending(companyId),
      // A customer nobody can read leaves its quotes without credit facts: the cockpit stays up.
      customers._internalCustomerCreditFacts({ customerIds }).then(
        (r) => r.customers,
        (err) => {
          log.warn(err, "credit facts could not be read for the Sales managers' cockpit");
          return [];
        },
      ),
      salesQuoteRepository.teamFacts(companyId, teamSince),
      quoteInquiryRepository.marginSince(companyId, teamSince),
      quoteInquiryRepository.unseenMarginAnswers(companyId, teamSince),
    ]);
    const pendingByQuote = new Map(pending.map((p) => [p.quoteId, p]));
    const creditOf = new Map(credits.map((c) => [c.customerId, c]));
    const quotes = rows.map((row) => factOf(row, people.emails, now, sheet, margins, pendingByQuote.get(row.id), row.customerId ? creditOf.get(row.customerId) : undefined));

    // The audit line: the last AUDIT_DAYS days of margin questions.
    const auditSince = now.getTime() - AUDIT_DAYS * DAY;
    const decidedIn = (r: QuoteInquiryRecord) => !!r.decidedAt && r.decidedAt.getTime() >= auditSince;
    const recent = asked.filter((r) => r.requestedAt.getTime() >= auditSince || (r.updatedAt.getTime() >= auditSince && r.status !== "pending"));
    const audit = {
      days: AUDIT_DAYS,
      asked: recent.filter((r) => r.requestedAt.getTime() >= auditSince).length,
      approved: recent.filter((r) => decidedIn(r) && r.decision === "approve").length,
      counter: recent.filter((r) => decidedIn(r) && r.decision === "counter").length,
      rejected: recent.filter((r) => decidedIn(r) && r.decision === "reject").length,
      withdrawn: recent.filter((r) => r.status === "withdrawn" && r.updatedAt.getTime() >= auditSince).length,
      selfApprovals: recent.filter((r) => decidedIn(r) && r.selfDecision && r.decision !== "reject").length,
      escalated: pending.filter((p) => isEscalated({ requestedAt: p.requestedAt, needsBy: p.needsBy, notifyUserId: p.notifyUserId }, now)).length,
      medianOfficeMinutesToDecide: median(recent.filter(decidedIn).map((r) => officeMinutesBetween(r.requestedAt, r.decidedAt!))),
    };
    const inTeam = asked.filter((r) => r.requestedAt.getTime() >= teamSince.getTime());

    // Questions waiting on a quote that can no longer be sent, and answers nobody will open.
    const open = new Map(quotes.map((q) => [q.quoteNumber, q]));
    const inquiriesOnClosedQuotes = pending
      .filter((p) => {
        const q = open.get(p.quoteNumber);
        return !q || (!ASKABLE.has(q.shownStatus) && !q.wonRevision);
      })
      .map((p) => p.quoteNumber);
    const active = new Set(people.users.map((u) => u.id));
    const answersNobodyReceived = unseen.filter((u) => !active.has(u.requestedById) && !(u.ownerUserId && active.has(u.ownerUserId))).map((u) => u.quoteNumber);

    return {
      today,
      quotes,
      capped,
      audit,
      team: {
        days: TEAM_DAYS,
        ...team,
        asked: inTeam.length,
        approved: inTeam.filter((r) => r.status === "approved").length,
        rejected: inTeam.filter((r) => r.status === "rejected").length,
      },
      inquiriesOnClosedQuotes: [...new Set(inquiriesOnClosedQuotes)],
      answersNobodyReceived: [...new Set(answersNobodyReceived)],
    };
  }
}

export const managersFactsService = new ManagersFactsService();
