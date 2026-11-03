import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type { Actor } from "../../../lib/rbac";
import { businessDay } from "../../../lib/businessDate";
import { revisionRoot } from "../../../lib/salesReference";
import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";
import { isUuid } from "../../../lib/uuid";
import type { QuoteMarginApproval, QuoteMarginInquiryItem, QuoteMarginInquiryRow } from "../interfaces/interfaces";
import { answerProblem, askProblem, isEscalated, isToldAbout, officeMinutesBetween, withLiveNotifier, type InquiryAnswer } from "../lib/marginInquiry";
import { approvalBasisOf, formatMargin, roadMargin } from "../lib/roadMargin";
import { companyDirectory, companyPeople, type People } from "../lib/people";
import { quoteCommentRepository } from "../repositories/quoteComment.repository";
import { quoteInquiryRepository } from "../repositories/quoteInquiry.repository";
import { salesQuoteRepository, type QuoteTransaction } from "../repositories/salesQuote.repository";
import type { SalesQuoteRecord } from "../schemas/quote.schema";
import type { QuoteInquiryRecord } from "../schemas/quoteInquiry.schema";
import { isPlainObject, isWonRevision } from "../utils/quoteDocument.utils";
import { effectiveStatus, pricingEntry, stateOf, type LifecycleContext } from "../utils/quoteLifecycle.utils";
import { marginsFor } from "./marginRates";

// A rep asks a manager to approve a road margin below the floor; a manager approves it, approves
// it down to a counter margin, or rejects it (Council Outlay 6, step 3). The approval is the one
// the gate already reads (data.marginApproval), written without a new version of the document so
// a rep editing the quote is not disturbed. The owner's manager is told; the admins too when no
// manager is set, after 4 office hours, or close to the customer's "needs it by". A manager may
// answer a question they asked or a quote they own - allowed, and shown (owner decision D9).

/** Statuses a quote is asked about in: before it goes to the customer. */
const ASKABLE: readonly string[] = ["draft", "ready_to_send", "revised"];
/** How far back the managers' list shows answered questions. */
const ANSWERED_DAYS = 30;
/** How long the bell keeps an answer after it was opened. */
const SEEN_KEEP_DAYS = 7;
const LIST_LIMIT = 500;
const DAY = 86_400_000;

interface AskInput {
  reason: string;
  note?: string;
  needsBy?: string | null;
  competitorPrice?: string;
  volume?: string;
}

function contextOf(actor: Actor, at: Date, people: People): LifecycleContext {
  return { at, today: businessDay(at), userId: actor.userID, userEmail: people.emails.get(actor.userID) ?? "" };
}

const notFound = () => APIError.notFound("Quote not found");
// A margin question always stores its snapshot; this stands in should one ever lack it.
const NO_SNAPSHOT = { sellingCzk: 0, buyingCzk: 0, marginCzk: null, marginPercent: null, floorPercent: 0, floorMinCzk: 0 };
const snapshotOf = (row: QuoteInquiryRecord) => row.snapshot ?? NO_SNAPSHOT;
// A person by e-mail as the users have it now; one who left keeps the e-mail the row recorded.
const nameOf = (people: People, id: string | null, recorded = "") => (id ? people.emails.get(id) || recorded : "");

// The question goes to the quote's chat as a message of whoever asks or answers, so the quote's
// conversation has it. The quote is already saved: a chat that cannot be written is logged.
async function postToChat(actor: Actor, quoteNumber: string, message: string): Promise<void> {
  try {
    await quoteCommentRepository.createForCompany(actor.companyID, { threadRef: revisionRoot(quoteNumber), quoteNumber, authorId: actor.userID, message, mentionedUserIds: [] });
  } catch (err) {
    log.warn("the margin inquiry could not be posted to the quote's chat", { quoteNumber, error: String(err) });
  }
}

/**
 * A question as the API hands it out. `managers` - the users who manage Sales now, when known -
 * make a question addressed to someone who left or no longer manages Sales count as addressed to
 * nobody: the admins are told.
 */
export function toInquiryItem(row: QuoteInquiryRecord, people: People, now: Date, managers: ReadonlySet<string> = new Set()): QuoteMarginInquiryItem {
  const waiting = withLiveNotifier({ requestedAt: row.requestedAt, needsBy: row.needsBy, notifyUserId: row.notifyUserId }, managers);
  return {
    id: row.id,
    quoteNumber: row.quoteNumber,
    status: row.status,
    reason: row.reason,
    note: row.note,
    needsBy: row.needsBy?.toISOString() ?? null,
    competitorPrice: row.competitorPrice,
    volume: row.volume,
    requestedById: row.requestedById,
    requestedByName: nameOf(people, row.requestedById, row.requestedByName),
    requestedAt: row.requestedAt.toISOString(),
    snapshot: snapshotOf(row),
    notifyName: nameOf(people, waiting.notifyUserId),
    escalated: row.status === "pending" && isEscalated(waiting, now),
    waitedOfficeMinutes: officeMinutesBetween(row.requestedAt, row.decidedAt ?? (row.status === "pending" ? now : row.updatedAt)),
    decision: row.decision,
    decidedByName: nameOf(people, row.decidedById, row.decidedByName),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    approvedMarginCzk: row.approvedMarginCzk,
    approvedMarginPercent: row.approvedMarginPercent,
    comment: row.comment,
    selfDecision: row.selfDecision,
    answerSeenAt: row.answerSeenAt?.toISOString() ?? null,
  };
}

/** "3 200 CZK (3.1 %)", or "unknown". */
const marginText = (czk: number | null, percent: number | null) => (czk === null ? "unknown" : formatMargin(czk, percent));

class MarginInquiryService {
  /** A rep asks a manager to approve the quote's road margin, which is below the floor. */
  async ask(actor: Actor, quoteNumber: string, input: AskInput): Promise<QuoteMarginInquiryItem> {
    const at = new Date();
    const problem = askProblem({ reason: input.reason, note: input.note ?? "", competitorPrice: input.competitorPrice, volume: input.volume, needsBy: input.needsBy }, at);
    if (problem) throw APIError.invalidArgument(problem);
    const stored = await salesQuoteRepository.loadSales(actor.companyID, quoteNumber);
    if (!stored) throw notFound();
    const [margins, people] = await Promise.all([marginsFor(actor.companyID, [stored], at), companyDirectory()]);
    const ctx = contextOf(actor, at, people);
    let created: QuoteInquiryRecord | null = null;
    const written = await salesQuoteRepository.withLockedQuote(actor.companyID, quoteNumber, async (quote, tx) => {
      const shown = effectiveStatus(quote.status, quote.validUntil, ctx.today);
      // Before the quote goes out - or on the revision of a Won quote, whose prices stay open.
      if (!ASKABLE.includes(shown) && !isWonRevision(quote.status, quote.data)) {
        throw APIError.failedPrecondition(`The quote is ${shown.replace(/_/g, " ")}: a margin is asked about before the quote is sent`);
      }
      const margin = margins ? roadMargin(quote.data, margins) : null;
      if (!margin?.needsApproval) throw APIError.failedPrecondition("The margin is not below the floor, or an approval already covers it: nothing to ask");
      if (margin.marginCzk === null) throw APIError.failedPrecondition(`The margin cannot be worked out: ${margin.problem}`);
      // The owner's manager is told; a quote nobody owns goes to the asker's manager. One who left,
      // or no longer manages Sales, is nobody: the admins are told at once.
      const ownerId = quote.ownerUserId ?? actor.userID;
      const reportsTo = people.reportsTo.get(ownerId) ?? null;
      const notifyUserId = reportsTo && people.managers.has(reportsTo) ? reportsTo : null;
      created = await quoteInquiryRepository.insert(
        {
          companyId: actor.companyID,
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          kind: "margin",
          requestedById: actor.userID,
          requestedByName: ctx.userEmail,
          requestedAt: at,
          reason: input.reason,
          note: (input.note ?? "").trim(),
          needsBy: input.needsBy ? new Date(input.needsBy) : null,
          competitorPrice: (input.competitorPrice ?? "").trim(),
          volume: (input.volume ?? "").trim(),
          snapshot: {
            sellingCzk: margin.sellingCzk,
            buyingCzk: margin.buyingCzk,
            marginCzk: margin.marginCzk,
            marginPercent: margin.marginPercent,
            floorPercent: margin.floorPercent,
            floorMinCzk: margin.floorMinCzk,
          },
          notifyUserId,
        },
        tx,
      );
      if (!created) throw APIError.failedPrecondition("A question about this margin is already waiting for a manager");
      const comment = `Margin approval asked: ${marginText(margin.marginCzk, margin.marginPercent)} - ${input.reason}${input.note?.trim() ? `: ${input.note.trim()}` : ""}`;
      return salesQuoteRepository.writeLifecycle(tx, quote, { state: stateOf(quote), entries: [pricingEntry("margin_approval", comment, ctx)] });
    });
    if (!written || !created) throw notFound();
    const manager = nameOf(people, (created as QuoteInquiryRecord).notifyUserId);
    await postToChat(actor, written.quoteNumber, `Asked a manager to approve the margin (${input.reason})${manager ? ` - ${manager} is told` : " - the admins are told"}.`);
    return toInquiryItem(created, people, at, people.managers);
  }

  /** The newest question of a quote, for its page. */
  async latest(actor: Actor, quoteNumber: string): Promise<QuoteMarginInquiryItem | null> {
    const quote = await salesQuoteRepository.loadSales(actor.companyID, quoteNumber);
    if (!quote) throw notFound();
    const row = await quoteInquiryRepository.latestOf(actor.companyID, quote.id);
    if (!row) return null;
    const people = await companyDirectory();
    return toInquiryItem(row, people, new Date(), people.managers);
  }

  /** The one who asked takes a waiting question back (a manager may too). */
  async withdraw(actor: Actor, quoteNumber: string, inquiryId: string): Promise<QuoteMarginInquiryItem> {
    if (!isUuid(inquiryId)) throw APIError.invalidArgument("inquiryId must be a uuid");
    const at = new Date();
    const people = await companyPeople();
    const ctx = contextOf(actor, at, people);
    let changed: QuoteInquiryRecord | null = null;
    const written = await salesQuoteRepository.withLockedQuote(actor.companyID, quoteNumber, async (quote, tx) => {
      const pending = await quoteInquiryRepository.pendingOf(actor.companyID, quote.id, tx);
      if (!pending || pending.id !== inquiryId) throw APIError.failedPrecondition("This question no longer waits for an answer");
      if (pending.requestedById !== actor.userID && !canDecideQuoteInquiry(actor.role)) throw APIError.permissionDenied("Only the one who asked can take the question back");
      // Who took it back is kept: the asker, or a manager taking a rep's question back.
      changed = await quoteInquiryRepository.answer(actor.companyID, inquiryId, { status: "withdrawn", decidedById: actor.userID, decidedByName: ctx.userEmail }, tx);
      if (!changed) throw APIError.failedPrecondition("This question no longer waits for an answer");
      return salesQuoteRepository.writeLifecycle(tx, quote, { state: stateOf(quote), entries: [pricingEntry("margin_approval", "Margin approval request withdrawn", ctx)] });
    });
    if (!written || !changed) throw notFound();
    await postToChat(actor, written.quoteNumber, "Took back the question to approve the margin.");
    return toInquiryItem(changed, people, at);
  }

  /** A manager answers: approve (the margin asked about or better), approve down to a counter margin, or reject. */
  async decide(actor: Actor, quoteNumber: string, inquiryId: string, answer: InquiryAnswer): Promise<QuoteMarginInquiryItem> {
    if (!canDecideQuoteInquiry(actor.role)) throw APIError.permissionDenied("Only a manager answers a margin inquiry");
    if (!isUuid(inquiryId)) throw APIError.invalidArgument("inquiryId must be a uuid");
    const problem = answerProblem(answer);
    if (problem) throw APIError.invalidArgument(problem);
    const at = new Date();
    const people = await companyPeople();
    const ctx = contextOf(actor, at, people);
    const comment = (answer.comment ?? "").trim();
    let decided: QuoteInquiryRecord | null = null;
    const written = await salesQuoteRepository.withLockedQuote(actor.companyID, quoteNumber, async (quote, tx) => {
      const pending = await quoteInquiryRepository.pendingOf(actor.companyID, quote.id, tx);
      if (!pending || pending.id !== inquiryId) {
        const row = await quoteInquiryRepository.byId(actor.companyID, inquiryId);
        if (row && row.status !== "pending") throw APIError.failedPrecondition(`This question was already ${row.status} by ${nameOf(people, row.decidedById, row.decidedByName) || "someone"}`);
        throw APIError.notFound("This question is no longer on the quote");
      }
      const selfDecision = pending.requestedById === actor.userID || quote.ownerUserId === actor.userID;
      const snapshot = snapshotOf(pending);
      if (answer.decision === "reject") {
        decided = await quoteInquiryRepository.answer(actor.companyID, inquiryId, { status: "rejected", decision: "reject", decidedById: actor.userID, decidedByName: ctx.userEmail, decidedAt: at, comment, selfDecision }, tx);
        if (!decided) throw APIError.failedPrecondition("This question no longer waits for an answer");
        return salesQuoteRepository.writeLifecycle(tx, quote, {
          state: stateOf(quote),
          entries: [pricingEntry("margin_approval", `Margin approval rejected: ${comment}${selfDecision ? " (self-decision)" : ""}`, ctx)],
        });
      }
      // Approve covers the margin asked about or a better one; a counter covers the manager's figure.
      const marginCzk = answer.decision === "counter" ? Math.round(answer.counterMarginCzk! * 100) / 100 : snapshot.marginCzk;
      if (marginCzk === null) throw APIError.failedPrecondition("The margin asked about is unknown: nothing can be approved");
      const selling = snapshot.sellingCzk;
      const marginPercent = answer.decision === "counter" ? (selling ? Math.round((marginCzk / selling) * 1000) / 10 : null) : snapshot.marginPercent;
      const approval: QuoteMarginApproval = {
        byUserId: actor.userID,
        byName: ctx.userEmail,
        at: at.toISOString(),
        reason: comment || `Approved on request: ${pending.reason}`,
        marginCzk,
        marginPercent,
        // What the quote is now: a change of customer, mode, containers, owner or validity ends it (D10).
        basis: approvalBasisOf(quote.data),
      };
      decided = await quoteInquiryRepository.answer(
        actor.companyID,
        inquiryId,
        { status: "approved", decision: answer.decision, decidedById: actor.userID, decidedByName: ctx.userEmail, decidedAt: at, approvedMarginCzk: marginCzk, approvedMarginPercent: marginPercent, comment, selfDecision },
        tx,
      );
      if (!decided) throw APIError.failedPrecondition("This question no longer waits for an answer");
      const what = answer.decision === "counter" ? `Margin approved down to ${formatMargin(marginCzk, marginPercent)}` : `Margin approved: ${formatMargin(marginCzk, marginPercent)}`;
      return salesQuoteRepository.writeLifecycle(tx, quote, {
        state: stateOf(quote),
        entries: [pricingEntry("margin_approval", `${what} - ${approval.reason}${selfDecision ? " (self-approval)" : ""}`, ctx)],
        // The approval the gate reads, stored without a new document version (a rep may be editing).
        serverKeys: { marginApproval: approval },
      });
    });
    if (!written || !decided) throw notFound();
    const done = decided as QuoteInquiryRecord;
    const said = done.status === "rejected" ? `Rejected the margin: ${comment}` : done.decision === "counter" ? `Approved the margin down to ${formatMargin(done.approvedMarginCzk!, done.approvedMarginPercent)}${comment ? `: ${comment}` : ""}` : `Approved the margin${comment ? `: ${comment}` : ""}`;
    await postToChat(actor, written.quoteNumber, said);
    return toInquiryItem(done, people, at);
  }

  /**
   * A manager approved the margin directly on the quote: the question `pending` waiting about it is
   * answered by that - inside the approval's transaction (`tx`), so the two cannot disagree.
   */
  async closeByDirectApproval(actor: Actor, quote: SalesQuoteRecord, pending: QuoteInquiryRecord, approval: QuoteMarginApproval, tx: QuoteTransaction): Promise<void> {
    await quoteInquiryRepository.answer(
      actor.companyID,
      pending.id,
      {
        status: "approved",
        decision: "approve",
        decidedById: actor.userID,
        decidedByName: approval.byName,
        decidedAt: new Date(approval.at),
        approvedMarginCzk: approval.marginCzk,
        approvedMarginPercent: approval.marginPercent,
        comment: approval.reason,
        selfDecision: pending.requestedById === actor.userID || quote.ownerUserId === actor.userID,
      },
      tx,
    );
  }

  /** The managers' Quote Inquiries list: what waits, and what was answered in the last 30 days. */
  async list(actor: Actor): Promise<QuoteMarginInquiryRow[]> {
    if (!canDecideQuoteInquiry(actor.role)) throw APIError.permissionDenied("Quote Inquiries are for managers");
    const now = new Date();
    const [rows, people] = await Promise.all([quoteInquiryRepository.list(actor.companyID, new Date(now.getTime() - ANSWERED_DAYS * DAY), LIST_LIMIT), companyDirectory()]);
    return this.rowsOf(actor, rows, now, people, people.managers);
  }

  /** What the bell of `actor` shows: questions they are told about, and answers to their own questions or quotes. */
  async forMe(actor: Actor): Promise<{ waiting: QuoteMarginInquiryRow[]; answers: QuoteMarginInquiryItem[] }> {
    const now = new Date();
    const [pending, answerRows, people] = await Promise.all([
      canDecideQuoteInquiry(actor.role) ? quoteInquiryRepository.pending(actor.companyID) : Promise.resolve([]),
      quoteInquiryRepository.answersFor(actor.companyID, actor.userID, new Date(now.getTime() - ANSWERED_DAYS * DAY), new Date(now.getTime() - SEEN_KEEP_DAYS * DAY), 100),
      companyDirectory(),
    ]);
    // The role as the token has it now (the auth handler reads it from the user on every request).
    const me = { id: actor.userID, role: actor.role };
    const told = pending.filter((r) => isToldAbout(withLiveNotifier({ requestedAt: r.requestedAt, needsBy: r.needsBy, notifyUserId: r.notifyUserId }, people.managers), me, now));
    return { waiting: await this.rowsOf(actor, told, now, people, people.managers), answers: answerRows.map((r) => toInquiryItem(r, people, now, people.managers)) };
  }

  /** The answers were opened by whoever they are for: the bell keeps them 7 more days. */
  async seen(actor: Actor, ids: string[]): Promise<void> {
    await quoteInquiryRepository.markSeen(actor.companyID, actor.userID, ids.filter(isUuid), new Date());
  }

  // Each question with its quote as it is now (customer, owner, status, today's road margin).
  private async rowsOf(actor: Actor, rows: QuoteInquiryRecord[], now: Date, people: People, managers: ReadonlySet<string>): Promise<QuoteMarginInquiryRow[]> {
    if (!rows.length) return [];
    const numbers = [...new Set(rows.map((r) => r.quoteNumber))];
    const quotes = (await Promise.all(numbers.map((n) => salesQuoteRepository.loadSales(actor.companyID, n)))).filter((q): q is SalesQuoteRecord => !!q);
    const byId = new Map(quotes.map((q) => [q.id, q]));
    const margins = await marginsFor(actor.companyID, quotes, now);
    const today = businessDay(now);
    return rows.map((r) => {
      const quote = byId.get(r.quoteId);
      const data = quote && isPlainObject(quote.data) ? quote.data : {};
      const state = quote ? stateOf(quote) : null;
      return {
        inquiry: toInquiryItem(r, people, now, managers),
        customer: typeof data.customerName === "string" ? data.customerName : "",
        ownerName: state ? (state.ownerUserId && people.emails.get(state.ownerUserId)) || state.ownerLabel : "",
        serviceType: typeof data.serviceType === "string" ? data.serviceType : "",
        quoteStatus: state ? effectiveStatus(state.status, state.validUntil, today) : "",
        margin: quote && margins ? roadMargin(quote.data, margins) : null,
      };
    });
  }
}

export const marginInquiryService = new MarginInquiryService();
