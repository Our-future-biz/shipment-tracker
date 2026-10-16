import { APIError } from "encore.dev/api";
import { inTx } from "../db/db";
import { internalRepository } from "../repositories/internal.repository";
import { consignmentRepository } from "../repositories/consignment.repository";
import { truckingOutboxRepository } from "../repositories/truckingOutbox.repository";
import { appendEvent } from "../repositories/event.repository";
import type { FileDownload } from "../interfaces/interfaces";
import type { InternalCharge, InternalMonth } from "../interfaces/internal.interfaces";
import type { Actor } from "../../../lib/rbac";
import { chargeItem, cleanMonth, closeRefusal, monthItem, monthOf, monthsBack, statementGroups, statementYear } from "../lib/internalBilling";
import { buildInternalMonthWorkbook, buildInternalStatementPdf } from "../lib/internalStatementPdf";
import { requireManager } from "../lib/roles";
import { userName } from "../lib/users";
import { internalBillingService } from "./internalBilling.service";
import { ourCompany } from "./transportOrder.service";
import { deliverDue } from "./truckingOutbox.service";

// The internal billing months (Phase 6 C): the list (current month and the 12 before), a month's
// charges, the manager's close (one ICZ statement per receiving department; the jobs' internal
// lines get the statement number), the statement PDF and the month's Excel export.

const MONTHS_BACK = 12;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

class InternalMonthService {
  async list(actor: Actor): Promise<InternalMonth[]> {
    const months = monthsBack(monthOf(new Date()), MONTHS_BACK);
    const [charges, closed, statements] = await Promise.all([
      internalRepository.chargesForMonths(actor.companyID, months),
      internalRepository.closedMonths(actor.companyID, months),
      internalRepository.statementsForMonths(actor.companyID, months),
    ]);
    return months.map((m) =>
      monthItem(
        m,
        closed.find((x) => x.month === m) ?? null,
        charges.filter((c) => c.month === m),
        statements.filter((s) => s.month === m),
      ),
    );
  }

  async charges(actor: Actor, month: unknown): Promise<InternalCharge[]> {
    return (await internalRepository.chargesForMonths(actor.companyID, [cleanMonth(month)])).map(chargeItem);
  }

  /**
   * Manager. Refused for the current (or a future) month, a closed one, and while a charge of the
   * month is not priced. Writes the month's statements (ICZ numbers from the locked counter) and
   * re-sends the internal line of every consignment charged in it, now with the statement number.
   */
  async close(actor: Actor, rawMonth: unknown): Promise<InternalMonth> {
    requireManager(actor.role, "close an internal billing month");
    const month = cleanMonth(rawMonth);
    const companyId = actor.companyID;
    const by = await userName(actor.userID);
    const now = new Date();
    await inTx(async (tx) => {
      await internalRepository.lockLedger(tx, companyId);
      const closed = await internalRepository.closedMonths(companyId, [month], tx);
      const charges = await internalRepository.chargesForMonths(companyId, [month], tx);
      const reversed = await internalRepository.reversedAmong(companyId, charges.filter((c) => c.notPriced).map((c) => c.id), tx);
      const refusal = closeRefusal(month, monthOf(now), closed.length > 0, charges, reversed);
      if (refusal) throw APIError.failedPrecondition(refusal);
      if (!(await internalRepository.closeMonth(tx, companyId, month, { name: by, userId: actor.userID || null }))) throw APIError.aborted(`${month} was closed meanwhile`);
      const numbers: string[] = [];
      for (const g of statementGroups(charges)) {
        const number = await internalRepository.allocateStatementNumber(tx, companyId, statementYear(month));
        await internalRepository.insertStatement(tx, { companyId, number, month, department: g.department, issuedAt: now, issuedBy: by, amount: g.amount, lineCount: g.lineCount });
        numbers.push(`${number} ${g.department}`);
      }
      await appendEvent(tx, companyId, {
        kind: "internal_month_closed",
        byUserId: actor.userID || null,
        byName: by,
        payload: { changes: {}, summary: `Internal billing ${month} closed${numbers.length ? `: ${numbers.join(", ")}` : " (no charges)"}`, facts: { month, statements: numbers } },
      });
      const consignments = await consignmentRepository.findMany(companyId, [...new Set(charges.map((c) => c.consignmentId))], tx);
      const owes = [];
      for (const c of consignments) owes.push(await internalBillingService.lineOwed(tx, actor, c));
      await truckingOutboxRepository.enqueue(tx, companyId, owes);
    });
    await deliverDue();
    return (await this.list(actor)).find((m) => m.month === month) ?? (await this.monthOnly(actor, month));
  }

  // A closed month older than the list shows.
  private async monthOnly(actor: Actor, month: string): Promise<InternalMonth> {
    const [charges, closed, statements] = await Promise.all([
      internalRepository.chargesForMonths(actor.companyID, [month]),
      internalRepository.closedMonths(actor.companyID, [month]),
      internalRepository.statementsForMonths(actor.companyID, [month]),
    ]);
    return monthItem(month, closed[0] ?? null, charges, statements);
  }

  /** The statement as a PDF (Czech and English, no VAT). */
  async statementPdf(actor: Actor, number: string): Promise<FileDownload> {
    const s = /^ICZ\d{8}$/.test(number) ? await internalRepository.statement(actor.companyID, number) : null;
    if (!s) throw APIError.notFound("Statement not found");
    const [charges, our] = await Promise.all([internalRepository.chargesForMonths(actor.companyID, [s.month]), ourCompany()]);
    const lines = charges.filter((c) => c.department === s.department).map(chargeItem);
    const bytes = await buildInternalStatementPdf({
      number: s.number,
      month: s.month,
      department: s.department,
      issuedAt: s.issuedAt.toISOString(),
      ourCompany: our,
      lines,
      total: s.amount,
    });
    return { fileName: `${s.number}.pdf`, fileBase64: Buffer.from(bytes).toString("base64"), contentType: "application/pdf" };
  }

  /** The month as an Excel workbook: a summary and one sheet per department. */
  async exportMonth(actor: Actor, rawMonth: unknown): Promise<FileDownload> {
    const month = cleanMonth(rawMonth);
    const [charges, closed, statements] = await Promise.all([
      internalRepository.chargesForMonths(actor.companyID, [month]),
      internalRepository.closedMonths(actor.companyID, [month]),
      internalRepository.statementsForMonths(actor.companyID, [month]),
    ]);
    const bytes = await buildInternalMonthWorkbook(
      month,
      closed.length ? "CLOSED" : "OPEN",
      charges.map(chargeItem),
      new Map(statements.map((s) => [s.department, s.number])),
    );
    return { fileName: `internal-billing-${month}.xlsx`, fileBase64: bytes.toString("base64"), contentType: XLSX };
  }
}

export const internalMonthService = new InternalMonthService();
