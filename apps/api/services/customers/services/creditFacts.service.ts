import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { invoicing } from "~encore/clients";
import { businessDay } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import type { CustomerCreditFacts, CustomerCreditWarning } from "../interfaces/interfaces";
import { isPrepayment, owedByCustomer } from "../lib/receivable";
import { customerInvoiceRepository } from "../repositories/customerInvoice.repository";
import { customerRepository } from "../repositories/customer.repository";

// What the customers owe, as the Finance tab counts it - unpaid invoices by what is left to pay on them (a partial
// credit note and the payments netted in), and the overdue ones (marked so, or Open past their due date, and still
// owing something) - for the Sales managers' cockpit (Council Outlay 6 D17) and the credit warning on a new quote or
// shipment (Council Outlay 10 D21). The rule is lib/receivable owedByCustomer. The readers convert and compare with
// the credit limit. The warning also shows the work not yet invoiced (step 7), beside the limit, never added to it.
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
    const [[facts], unbilled] = await Promise.all([this.factsOf(companyId, [customer.id]), unbilledOf(customer.id)]);
    return {
      customerId: customer.id,
      companyName: customer.companyName,
      creditLimit: Number(customer.creditLimit) || 0,
      currency: customer.currency,
      paymentTerms: customer.paymentTerms,
      prepayment: isPrepayment(customer.paymentTerms),
      unpaid: facts?.unpaid ?? [],
      overdueCount: facts?.overdueCount ?? 0,
      oldestOverdueDue: facts?.oldestOverdueDue ?? null,
      ...unbilled,
    };
  }
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
