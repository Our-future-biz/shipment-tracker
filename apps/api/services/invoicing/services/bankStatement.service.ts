import { createHash } from "node:crypto";
import { APIError, ErrCode } from "encore.dev/api";
import log from "encore.dev/log";
import { businessDay } from "../../../lib/businessDate";
import { userEmailOf } from "../../../lib/companyUsers";
import type { Actor } from "../../../lib/rbac";
import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";
import { isUuid } from "../../../lib/uuid";
import {
  allocationProblem,
  bankKeyPrefix,
  decidableProblem,
  DECIDABLE,
  entryAllocationState,
  ignoreProblem,
  matchEntry,
  storedCandidate,
  type EntryAllocationState,
  type MatchedCandidate,
  type OpenInvoice,
} from "../lib/bankMatch";
import { bookedEntriesOnce, Camt053Error, parseCamt053, type CamtEntry } from "../lib/camt053";
import { round2 } from "../lib/invoiceCalc";
import { isOwed } from "../lib/receivables";
import { bankStatementRepository as repo, type StatusCount } from "../repositories/bankStatement.repository";
import type { BankEntryAllocation, BankStatementEntryRecord, BankStatementRecord, NewBankStatementEntryRecord } from "../schemas/bankStatement.schema";
import { deliverInvoiceFollowups } from "./invoiceFollowups.service";
import { receivableService } from "./receivable.service";
import type {
  BankEntryCandidateItem,
  BankStatementCounts,
  BankStatementDetailResponse,
  BankStatementEntryItem,
  BankStatementListResponse,
  BankStatementSummary,
} from "../interfaces/bankStatement";
import type { ReceivableItem } from "../interfaces/interfaces";

// Finance → Accounts Receivable → Bank statements (step 7; the owner's bank gives CAMT.053). A manager reads a
// statement file: each incoming entry is matched to the invoices it may pay (lib/bankMatch) and waits for a manager,
// who confirms it as payments (receivableService.noteAllocations, in the same transaction as the entry's change, with
// the entry's version checked) or sets it aside with a reason. Nothing is ever noted without that confirm (D11). The
// same file twice is refused; an entry read again from an overlapping file is kept once. The file is not kept: only
// what was read from it. Managers only, reading too (mock test council X6): a statement shows money out as well.

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ENTRIES = 10_000;

const notThere = () => APIError.notFound("This bank statement is not there");
const entryNotThere = () => APIError.notFound("This entry is not on the statement");
const changedMeanwhile = () => APIError.aborted("This entry changed meanwhile: open the statement again to see how it is now");
const managersOnly = () => APIError.permissionDenied("Only a manager reads a bank statement, confirms its payments or sets an entry aside");
const readersOnly = () => APIError.permissionDenied("Only a manager sees the bank statements: they show every payment in and out of the account");

/** dd.mm.yyyy of a yyyy-mm-dd day. */
const czDay = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`;

const openInvoiceOf = (r: ReceivableItem): OpenInvoice => ({
  invoiceId: r.id,
  number: r.number,
  customer: r.customer,
  jobNumber: r.jobNumber,
  leftToPay: r.leftToPay,
  currency: r.currency,
  dueDate: r.dueDate,
  version: r.version,
});

const candidateItem = (c: MatchedCandidate): BankEntryCandidateItem => ({
  invoiceId: c.invoiceId,
  number: c.number,
  customer: c.customer,
  jobNumber: c.jobNumber,
  leftToPay: c.leftToPay,
  currency: c.currency,
  dueDate: c.dueDate,
  reasons: c.reasons,
  score: c.score,
  version: c.version,
});

const sameAllocations = (allocations: readonly BankEntryAllocation[], items: { invoiceId: string; amount: number }[]) => {
  const a = allocations.map((x) => `${x.invoiceId}:${round2(x.amount).toFixed(2)}`).sort();
  const b = items.map((x) => `${x.invoiceId}:${round2(x.amount).toFixed(2)}`).sort();
  return a.length === b.length && a.every((x, i) => x === b[i]);
};

function countsOf(statuses: { status: string; n: number }[], entries: number): BankStatementCounts {
  const n = (status: string) => statuses.filter((x) => x.status === status).reduce((sum, x) => sum + x.n, 0);
  const own = statuses.reduce((sum, x) => sum + x.n, 0);
  const proposed = n("proposed");
  const noMatch = n("no_match");
  return {
    toDecide: proposed + noMatch,
    proposed,
    noMatch,
    confirmed: n("confirmed"),
    ignored: n("ignored"),
    notIncoming: n("not_incoming"),
    seenBefore: Math.max(0, entries - own),
  };
}

const summaryOf = (st: BankStatementRecord, counts: BankStatementCounts): BankStatementSummary => ({
  id: st.id,
  fileName: st.fileName,
  format: st.format,
  statementRef: st.statementRef,
  accountIban: st.accountIban,
  currency: st.currency,
  fromDate: st.fromDate,
  toDate: st.toDate,
  entries: st.entries,
  importedBy: st.importedBy,
  importedAt: st.createdAt.toISOString(),
  counts,
});

const minDay = (days: (string | null)[]) => days.filter((d): d is string => !!d).sort()[0] ?? null;
const maxDay = (days: (string | null)[]) => days.filter((d): d is string => !!d).sort().at(-1) ?? null;

class BankStatementService {
  canAct = (actor: Pick<Actor, "role">) => canDecideQuoteInquiry(actor.role);

  private requireManager(actor: Actor) {
    if (!this.canAct(actor)) throw managersOnly();
  }

  /**
   * Reading a statement is for managers too (mock test council X6, K7): it shows every line of the company's account -
   * money out with its names, accounts and messages - not only the customers' payments. The same roles as the import
   * and the confirm (superadmin, admin, manager).
   */
  private requireReader(actor: Actor) {
    if (!this.canAct(actor)) throw readersOnly();
  }

  /** The invoices owed now, as Accounts Receivable shows them (the one place their figures are worked out). */
  private async openInvoices(actor: Actor): Promise<{ invoices: OpenInvoice[]; capped: boolean }> {
    const page = await receivableService.list(actor, "90d");
    return { invoices: page.rows.filter(isOwed).map(openInvoiceOf), capped: page.truncated };
  }

  // ── Reading a file ──

  /**
   * A manager reads a CAMT.053 file. Refused: the same file read before ("This statement was read on … by …"), a
   * file that is not a camt.053.001.02–08 statement or not well-formed, a file of several accounts. Only booked
   * entries are kept; money out is kept for the record only; an entry stored before from another file stays as it
   * is (decided or not). The file itself is not kept.
   */
  async importFile(actor: Actor, input: { fileName: string; contentBase64: string }): Promise<BankStatementDetailResponse> {
    this.requireManager(actor);
    const fileName = String(input.fileName ?? "").trim();
    if (!fileName) throw APIError.invalidArgument("The file has no name");
    const base64 = String(input.contentBase64 ?? "")
      .replace(/^data:[^,]*;base64,/, "")
      .replace(/\s+/g, "");
    if (!base64) throw APIError.invalidArgument("The file is empty");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw APIError.invalidArgument("The file did not arrive whole: send it again");
    if (base64.length > Math.ceil(MAX_BYTES / 3) * 4) throw APIError.invalidArgument("The file is larger than 10 MB");
    const bytes = Buffer.from(base64, "base64");
    if (!bytes.length) throw APIError.invalidArgument("The file is empty");
    const sha = createHash("sha256").update(bytes).digest("hex");
    await this.refuseReadBefore(actor.companyID, sha);

    let parsed;
    try {
      parsed = parseCamt053(bytes);
    } catch (err) {
      if (err instanceof Camt053Error) throw APIError.invalidArgument(err.message);
      throw err;
    }
    const accounts = [...new Set(parsed.statements.map((s) => s.iban))];
    if (accounts.length > 1) throw APIError.invalidArgument(`This file holds statements of ${accounts.length} accounts: read each account's file on its own`);
    // Pending and information-only entries are not money on the account yet; an entry given twice in the file is one.
    const entries: CamtEntry[] = bookedEntriesOnce(parsed);
    if (entries.length > MAX_ENTRIES) throw APIError.invalidArgument(`The file holds more than ${MAX_ENTRIES} entries: ask the bank for a shorter period`);

    const incoming = entries.some((e) => e.credit && !e.reversal);
    const { invoices } = incoming ? await this.openInvoices(actor) : { invoices: [] };
    const by = await userEmailOf(actor.userID);
    const rows: Omit<NewBankStatementEntryRecord, "statementId">[] = entries.map((e) => {
      const match = e.reversal ? { status: "not_incoming" as const, candidates: [] } : matchEntry(e, invoices);
      return {
        companyId: actor.companyID,
        entryKey: e.key,
        bookingDate: e.bookingDate,
        valueDate: e.valueDate,
        amount: e.amount.toFixed(2),
        currency: e.currency,
        credit: e.credit,
        variableSymbol: e.variableSymbol,
        constantSymbol: e.constantSymbol,
        specificSymbol: e.specificSymbol,
        endToEndId: e.endToEndId,
        counterpartyName: e.counterpartyName,
        counterpartyAccount: e.counterpartyAccount,
        message: e.message,
        status: match.status,
        candidates: match.candidates.map(storedCandidate),
      };
    });
    const currencies = [...new Set(parsed.statements.map((s) => s.currency).filter(Boolean))];
    const entryCurrencies = [...new Set(entries.map((e) => e.currency))];
    const bookings = entries.map((e) => e.bookingDate);
    const made = await repo.importStatement(
      {
        companyId: actor.companyID,
        fileName: fileName.slice(0, 300),
        fileSha256: sha,
        format: parsed.version,
        statementRef: parsed.statements
          .map((s) => s.id)
          .filter(Boolean)
          .join(", ")
          .slice(0, 500),
        accountIban: accounts[0] ?? "",
        currency: currencies.length === 1 ? currencies[0]! : entryCurrencies.length === 1 ? entryCurrencies[0]! : "",
        fromDate: minDay(parsed.statements.map((s) => s.fromDate)) ?? minDay(bookings),
        toDate: maxDay(parsed.statements.map((s) => s.toDate)) ?? maxDay(bookings),
        entries: entries.length,
        importedByUserId: actor.userID,
        importedBy: by,
      },
      rows,
    );
    if (!made) {
      // The same file was read by someone else a moment ago.
      await this.refuseReadBefore(actor.companyID, sha);
      throw APIError.alreadyExists("This statement was read a moment ago");
    }
    return this.detail(actor, made.statement.id);
  }

  private async refuseReadBefore(companyId: string, sha: string): Promise<void> {
    const earlier = await repo.bySha(companyId, sha);
    if (earlier) throw APIError.alreadyExists(`This statement was read on ${czDay(businessDay(earlier.createdAt))} by ${earlier.importedBy || "someone"}`);
  }

  // ── Reading ──

  /** The statements read (managers only: they hold every line of the account, money out too). */
  async list(actor: Actor): Promise<BankStatementListResponse> {
    this.requireReader(actor);
    const statements = await repo.list(actor.companyID);
    const counts = await repo.statusCounts(
      actor.companyID,
      statements.map((s) => s.id),
    );
    const byStatement = new Map<string, StatusCount[]>();
    for (const c of counts) byStatement.set(c.statementId, [...(byStatement.get(c.statementId) ?? []), c]);
    return {
      statements: statements.map((s) => summaryOf(s, countsOf(byStatement.get(s.id) ?? [], s.entries))),
      canAct: this.canAct(actor),
    };
  }

  /**
   * The statement with its entries: its own and those of its account and days another file stored first. An entry
   * still to decide gets its candidates worked out again from the invoices owed now (one paid meanwhile drops out).
   */
  async detail(actor: Actor, statementId: string): Promise<BankStatementDetailResponse> {
    this.requireReader(actor);
    if (!isUuid(statementId)) throw notThere();
    const statement = await repo.byId(actor.companyID, statementId);
    if (!statement) throw notThere();
    const entries = await repo.entriesOf(statement);
    const takenBack = await repo.takenBack(
      actor.companyID,
      entries.flatMap((e) => e.allocations.map((a) => a.paymentId)),
    );
    const states = new Map(entries.map((e) => [e.id, entryAllocationState({ status: e.status, amount: Number(e.amount), allocations: e.allocations }, takenBack)]));
    const open = entries.some((e) => (DECIDABLE.includes(e.status) || states.get(e.id)!.reopened) && e.credit);
    const [{ invoices, capped }, files] = await Promise.all([
      open ? this.openInvoices(actor) : Promise.resolve({ invoices: [] as OpenInvoice[], capped: false }),
      repo.fileNames(actor.companyID, entries.filter((e) => e.statementId !== statement.id).map((e) => e.statementId)),
    ]);
    const items = entries.map((e) => this.entryItem(e, statement, invoices, files, takenBack, states.get(e.id)!));
    const ownCounts = countsOf(
      items.filter((i) => !i.firstReadIn).map((i) => ({ status: i.status, n: 1 })),
      statement.entries,
    );
    return {
      statement: summaryOf(statement, ownCounts),
      entries: items,
      canAct: this.canAct(actor),
      fileKept: false,
      candidatesCapped: capped,
      today: businessDay(new Date()),
    };
  }

  private entryItem(
    e: BankStatementEntryRecord,
    statement: BankStatementRecord,
    invoices: OpenInvoice[],
    files: Map<string, string>,
    takenBack: ReadonlySet<string>,
    state: EntryAllocationState,
  ): BankStatementEntryItem {
    const amount = Number(e.amount);
    const open = DECIDABLE.includes(e.status) || state.reopened;
    // A reopened entry is matched for what is free on it, not its whole amount.
    const fresh = open ? matchEntry({ ...e, amount: state.reopened ? state.free : amount }, invoices) : null;
    return {
      id: e.id,
      entryKey: e.entryKey,
      bookingDate: e.bookingDate,
      valueDate: e.valueDate,
      amount,
      currency: e.currency,
      credit: e.credit,
      variableSymbol: e.variableSymbol,
      constantSymbol: e.constantSymbol,
      specificSymbol: e.specificSymbol,
      endToEndId: e.endToEndId,
      counterpartyName: e.counterpartyName,
      counterpartyAccount: e.counterpartyAccount,
      message: e.message,
      // An open entry's status follows its candidates now (a credit with none is no_match, one with some proposed).
      status: fresh && fresh.status !== "not_incoming" ? fresh.status : e.status,
      candidates: fresh
        ? fresh.candidates.map(candidateItem)
        : e.candidates.map((c) => candidateItem({ ...c, dueDate: "", version: 0 })),
      allocations: e.allocations.map((a) => ({ invoiceId: a.invoiceId, number: a.number, amount: Number(a.amount), paymentId: a.paymentId, takenBack: takenBack.has(a.paymentId) })),
      unallocated: e.status === "confirmed" ? round2(state.free) : 0,
      reopened: state.reopened,
      decidedAt: e.decidedAt ? e.decidedAt.toISOString() : null,
      decidedBy: e.decidedBy,
      decisionReason: e.decisionReason,
      version: e.version,
      firstReadIn: e.statementId !== statement.id ? { statementId: e.statementId, fileName: files.get(e.statementId) ?? "" } : null,
    };
  }

  private async entry(actor: Actor, statementId: string, entryId: string): Promise<{ statement: BankStatementRecord; entry: BankStatementEntryRecord }> {
    if (!isUuid(statementId)) throw notThere();
    if (!isUuid(entryId)) throw entryNotThere();
    const statement = await repo.byId(actor.companyID, statementId);
    if (!statement) throw notThere();
    const entry = await repo.entryOf(statement, entryId);
    if (!entry) throw entryNotThere();
    return { statement, entry };
  }

  /** The entry's allocations as they stand now (its payments taken back since, if any). */
  private async stateOf(actor: Actor, entry: BankStatementEntryRecord): Promise<EntryAllocationState> {
    const takenBack = await repo.takenBack(
      actor.companyID,
      entry.allocations.map((a) => a.paymentId),
    );
    return entryAllocationState({ status: entry.status, amount: Number(entry.amount), allocations: entry.allocations }, takenBack);
  }

  private refuseDecided(entry: BankStatementEntryRecord, state?: EntryAllocationState) {
    if (state?.reopened) return;
    const problem = decidableProblem({ status: entry.status, decidedBy: entry.decidedBy, decidedOn: entry.decidedAt ? czDay(businessDay(entry.decidedAt)) : null });
    if (problem) throw APIError.failedPrecondition(problem);
  }

  // ── Deciding ──

  /**
   * A manager confirms an incoming entry as payments of one or several invoices (amounts in the entry's currency,
   * each at most what is left to pay on its invoice, together at most the entry). The payments are noted by
   * receivableService.noteAllocations (all or nothing, each invoice's version checked, the booking day as the day paid,
   * the entry's key as the bank reference) in the same transaction as the entry's change, from the entry's version:
   * a double click or a second manager never notes it twice.
   */
  async confirm(
    actor: Actor,
    statementId: string,
    entryId: string,
    input: { version: number; items: { invoiceId: string; receivableVersion: number; amount: number }[] },
  ): Promise<BankStatementDetailResponse> {
    this.requireManager(actor);
    const items = (input.items ?? []).map((i) => ({ invoiceId: String(i.invoiceId ?? "").trim(), receivableVersion: Number(i.receivableVersion), amount: Number(i.amount) }));
    if (items.some((i) => !isUuid(i.invoiceId))) throw APIError.invalidArgument("An invoice chosen is not there");
    if (items.some((i) => !Number.isInteger(i.receivableVersion))) throw APIError.invalidArgument("Open the statement again: an invoice's version is missing");
    const { statement, entry } = await this.entry(actor, statementId, entryId);
    // A payment it noted taken back since: the entry may be confirmed again for what is free on it, as a confirmation
    // of its own (its own idempotency keys), the earlier allocations kept and shown as taken back.
    const state = await this.stateOf(actor, entry);
    if (entry.status === "confirmed" && !state.reopened && sameAllocations(state.lastRound, items)) return this.detail(actor, statementId);
    this.refuseDecided(entry, state);
    if (!entry.credit) throw APIError.failedPrecondition("This entry is money out of the account: it is not a customer's payment");
    if (entry.version !== input.version) throw changedMeanwhile();
    const paidOn = entry.bookingDate ?? entry.valueDate;
    if (!paidOn) throw APIError.failedPrecondition("This entry has no booking day: note its payment on the invoice by hand");

    // The invoices as they are now (the owed ones on the page; one chosen beyond it read on its own).
    const { invoices } = await this.openInvoices(actor);
    const known = new Map(invoices.map((i) => [i.invoiceId, { number: i.number, leftToPay: i.leftToPay, currency: i.currency, owed: true }]));
    for (const id of new Set(items.map((i) => i.invoiceId))) {
      if (known.has(id)) continue;
      // Only an invoice that isn't there reads as not owed; any other failure says so, never "not owed any more".
      const row = await receivableService
        .detail(actor, id)
        .then((d) => d.row)
        .catch((err: unknown) => {
          if (err instanceof APIError && err.code === ErrCode.NotFound) return null;
          throw err;
        });
      if (row) known.set(id, { number: row.number, leftToPay: row.leftToPay, currency: row.currency, owed: isOwed(row) });
    }
    const amount = state.reopened ? state.free : Number(entry.amount);
    const problem = allocationProblem({ amount, currency: entry.currency }, items, known);
    if (problem) throw APIError.failedPrecondition(problem);

    const by = await userEmailOf(actor.userID);
    const note = `Bank statement ${statement.fileName}${entry.counterpartyName ? `, ${entry.counterpartyName}` : ""}`;
    // noteAllocations inside a caller's transaction needs the receivables made and their old Paid carried over first.
    await receivableService.prepareInvoices(
      actor,
      items.map((i) => i.invoiceId),
    );
    const row = await repo.confirm(actor.companyID, entry.id, input.version, { userId: actor.userID, by }, async (tx): Promise<BankEntryAllocation[]> => {
      const noted = await receivableService.noteAllocations(
        actor,
        {
          paidOn,
          bankRef: entry.entryKey,
          note,
          idempotencyKeyPrefix: bankKeyPrefix(entry.id, state.reopened ? state.nextRound : 1),
          currency: entry.currency,
          items: items.map((i) => ({ invoiceId: i.invoiceId, version: i.receivableVersion, amount: round2(i.amount) })),
        },
        tx,
      );
      const ids = new Map(noted.map((n) => [n.invoiceId, n.paymentId]));
      const made = items.map((i): BankEntryAllocation => {
        const paymentId = ids.get(i.invoiceId);
        // Never store a confirm whose payments can't be named: everything is rolled back.
        if (!paymentId) throw new Error(`noteAllocations named no payment for invoice ${i.invoiceId}`);
        const line: BankEntryAllocation = { invoiceId: i.invoiceId, number: known.get(i.invoiceId)?.number ?? "", amount: round2(i.amount), paymentId };
        return state.reopened ? { ...line, round: state.nextRound } : line;
      });
      // The earlier confirmations' allocations stay on the entry (shown as taken back where they were).
      return state.reopened ? [...entry.allocations, ...made] : made;
    }, state.reopened);
    if (!row) {
      const { entry: now } = await this.entry(actor, statementId, entryId);
      const nowState = await this.stateOf(actor, now);
      if (now.status === "confirmed" && !nowState.reopened && sameAllocations(nowState.lastRound, items)) return this.detail(actor, statementId);
      this.refuseDecided(now, nowState);
      throw changedMeanwhile();
    }
    for (const id of new Set(items.map((i) => i.invoiceId))) {
      await deliverInvoiceFollowups(id).catch((err: unknown) => log.warn(err, "bank statement: follow-ups not delivered now (the outbox retries)", { invoiceId: id }));
    }
    return this.detail(actor, statementId);
  }

  /** A manager sets an open entry aside with a reason (not a customer's payment, noted otherwise, …). */
  async ignore(actor: Actor, statementId: string, entryId: string, input: { version: number; reason: string }): Promise<BankStatementDetailResponse> {
    this.requireManager(actor);
    const reason = String(input.reason ?? "").trim();
    const bad = ignoreProblem(reason);
    if (bad) throw APIError.invalidArgument(bad);
    const { entry } = await this.entry(actor, statementId, entryId);
    const state = await this.stateOf(actor, entry);
    this.refuseDecided(entry, state);
    if (entry.version !== input.version) throw changedMeanwhile();
    const by = await userEmailOf(actor.userID);
    const row = await repo.ignore(actor.companyID, entry.id, input.version, { userId: actor.userID, by, reason: reason.slice(0, 1000) }, state.reopened);
    if (!row) {
      const { entry: now } = await this.entry(actor, statementId, entryId);
      this.refuseDecided(now, await this.stateOf(actor, now));
      throw changedMeanwhile();
    }
    return this.detail(actor, statementId);
  }
}

export const bankStatementService = new BankStatementService();
