import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { invoicing } from "~encore/clients";
import { businessDay } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import type { CustomerCreditFacts, CustomerCreditWarning } from "../interfaces/interfaces";
import { isPrepayment, owedByCustomer, type OwedEntry } from "../lib/receivable";
import { customerInvoiceRepository } from "../repositories/customerInvoice.repository";
import { customerRepository } from "../repositories/customer.repository";

// What the customers owe, as the Finance tab counts it - unpaid invoices by what is left to pay on them (a partial
// credit note and the payments netted in), and the overdue ones (marked so, or Open past their due date, and still
// owing something) - for the Sales managers' cockpit (Council Outlay 6 D17) and the credit warning on a new quote or
// shipment (Council Outlay 10 D21). The rule is lib/receivable owedByCustomer. The readers convert and compare with
// the credit limit. The warning also shows the work not yet invoiced (step 7), beside the limit, never added to it.
// Since the mock test council (m5, 19 Nov 2026) the warning counts the issued invoices from Invoicing's own figures,
// as the Finance tab does, and only the rows typed by hand from this list; the cockpit's factsOf still reads the list.
class CreditFactsService {
  async factsOf(companyId: string, customerIds: string[]): Promise<CustomerCreditFacts[]> {
    const ids = [...new Set(customerIds.filter(isUuid).map((id) => id.toLowerCase()))];
    if (!ids.length) return [];
    const [customers, entries] = await Promise.all([
      customerRepository.creditLimitsOf(companyId, ids),
      customerInvoiceRepository.owedEntriesOf(companyId, ids),
    ]);
    const owed = owedByCustomer(entries, businessDay(new Date()));
    return customers.map((c) => {
      const own = owed.filter((u) => u.customerId === c.id);
      const overdue = own.filter((u) => u.overdue > 0);
      return {
        customerId: c.id,
        creditLimit: c.creditLimit,
        currency: c.currency,
        unpaid: own.map((u) => ({ currency: u.currency, amount: u.amount })),
        overdueCount: overdue.reduce((n, u) => n + u.overdue, 0),
        oldestOverdueDue: overdue.map((u) => u.oldestDue).filter((d): d is string => !!d).sort()[0] ?? null,
      };
    });
  }

  /**
   * The credit warning of a live customer of the company: its limit and terms, what it owes, and the work not yet
   * invoiced (asked of Invoicing; when it can't be asked the warning still answers, saying the work is not known).
   */
  async warningOf(companyId: string, customerId: string): Promise<CustomerCreditWarning> {
    const customer = isUuid(customerId) ? await customerRepository.getByIdForCompany(customerId, companyId) : null;
    if (!customer) throw APIError.notFound("Customer not found");
    const [owed, unbilled] = await Promise.all([this.owedOf(companyId, customer.id), unbilledOf(customer.id)]);
    return {
      customerId: customer.id,
      companyName: customer.companyName,
      creditLimit: Number(customer.creditLimit) || 0,
      currency: customer.currency,
      paymentTerms: customer.paymentTerms,
      prepayment: isPrepayment(customer.paymentTerms),
      unpaid: owed.unpaid,
      overdueCount: owed.overdueCount,
      oldestOverdueDue: owed.oldestOverdueDue,
      ...unbilled,
    };
  }

  /**
   * What the customer owes for the credit warning, as its Finance tab shows it (mock test council m5): Invoicing's own
   * figures for the issued invoices (Accounts Receivable's, so one whose hand-over to this list failed counts too),
   * plus the rows typed by hand here, which Invoicing does not know. When Invoicing can't be asked, this list's copy
   * of every row is counted instead (as before), so the warning still answers.
   */
  private async owedOf(companyId: string, customerId: string): Promise<Pick<CustomerCreditFacts, "unpaid" | "overdueCount" | "oldestOverdueDue">> {
    let issued: InvoicingOwed;
    try {
      issued = readOwed(await invoicing._internalCustomerOwed({ customerId }));
    } catch (err) {
      log.warn(err, "what the customer owes could not be read from Invoicing for a credit warning: the customer's list is counted", { customerId });
      const [facts] = await this.factsOf(companyId, [customerId]);
      return { unpaid: facts?.unpaid ?? [], overdueCount: facts?.overdueCount ?? 0, oldestOverdueDue: facts?.oldestOverdueDue ?? null };
    }
    const rows = await customerInvoiceRepository.findByCustomer(customerId, companyId);
    const typed: OwedEntry[] = rows
      .filter((r) => r.source === "typed")
      .map((r) => ({
        customerId,
        currency: r.currency,
        amount: Number(r.amount),
        leftToPay: r.leftToPay === null || r.leftToPay === undefined ? null : Number(r.leftToPay),
        status: r.status,
        dueDate: r.dueDate ? String(r.dueDate).slice(0, 10) : null,
      }));
    const byHand = owedByCustomer(typed, businessDay(new Date()));
    const cents = new Map<string, number>();
    for (const a of [...issued.unpaid, ...byHand.map((u) => ({ currency: u.currency, amount: u.amount }))]) {
      cents.set(a.currency, (cents.get(a.currency) ?? 0) + Math.round(a.amount * 100));
    }
    const overdueDays = [issued.oldestOverdueDue, ...byHand.filter((u) => u.overdue > 0).map((u) => u.oldestDue)].filter((d): d is string => !!d).sort();
    return {
      unpaid: [...cents.entries()].filter(([, c]) => c !== 0).map(([currency, c]) => ({ currency, amount: c / 100 })).sort((a, b) => a.currency.localeCompare(b.currency)),
      overdueCount: issued.overdueCount + byHand.reduce((n, u) => n + u.overdue, 0),
      oldestOverdueDue: overdueDays[0] ?? null,
    };
  }
}

/** What invoicing `_internalCustomerOwed` answers. */
interface InvoicingOwed {
  unpaid: { currency: string; amount: number }[];
  overdueCount: number;
  oldestOverdueDue: string | null;
}

/** Invoicing's answer read strictly: anything unreadable throws (the warning then counts the customer's list). */
function readOwed(answer: InvoicingOwed | null | undefined): InvoicingOwed {
  const unpaid = Array.isArray(answer?.unpaid) ? answer.unpaid : null;
  if (!answer || !unpaid || !unpaid.every((a) => typeof a?.currency === "string" && Number.isFinite(a?.amount)) || !Number.isFinite(answer.overdueCount)) {
    throw new Error("an unreadable answer");
  }
  return { unpaid, overdueCount: answer.overdueCount, oldestOverdueDue: typeof answer.oldestOverdueDue === "string" ? answer.oldestOverdueDue : null };
}

// What invoicing `_internalUnbilledOfCustomer` answers (`capped`: it stopped counting at its limit of jobs).
interface UnbilledAnswer {
  amounts: { currency: string; amount: number }[];
  jobs: number;
  capped: boolean;
}

type UnbilledFacts = Pick<CustomerCreditWarning, "unbilled" | "unbilledJobs" | "unbilledKnown">;

/**
 * The customer's work not yet invoiced, as Invoicing counts it (per currency, never converted). A credit warning never
 * fails for it: when Invoicing can't be asked, or answers with something unreadable, it is "not known".
 */
async function unbilledOf(customerId: string): Promise<UnbilledFacts> {
  try {
    const answer: UnbilledAnswer = await invoicing._internalUnbilledOfCustomer({ customerId });
    const amounts = Array.isArray(answer?.amounts) ? answer.amounts : null;
    if (!amounts || !amounts.every((a) => typeof a?.currency === "string" && Number.isFinite(a?.amount))) {
      throw new Error("an unreadable answer");
    }
    return {
      unbilled: amounts.filter((a) => a.amount !== 0).map((a) => ({ currency: a.currency, amount: a.amount })),
      unbilledJobs: Number.isFinite(answer.jobs) ? answer.jobs : 0,
      unbilledKnown: true,
    };
  } catch (err) {
    log.warn(err, "the work not yet invoiced could not be read for a credit warning; it is shown as not known", { customerId });
    return { unbilled: [], unbilledJobs: 0, unbilledKnown: false };
  }
}

export const creditFactsService = new CreditFactsService();
