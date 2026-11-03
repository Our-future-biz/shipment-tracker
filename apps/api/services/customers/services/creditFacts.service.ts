import { businessDay } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import type { CustomerCreditFacts } from "../interfaces/interfaces";
import { customerInvoiceRepository } from "../repositories/customerInvoice.repository";
import { customerRepository } from "../repositories/customer.repository";

// What the quoted customers owe, as the Finance tab counts it - unpaid invoices, and overdue ones
// (marked so, or Open past their due date) - for the Sales managers' cockpit (Council Outlay 6
// D17). The cockpit converts and compares with the credit limit.
class CreditFactsService {
  async factsOf(companyId: string, customerIds: string[]): Promise<CustomerCreditFacts[]> {
    const ids = [...new Set(customerIds.filter(isUuid))];
    if (!ids.length) return [];
    const [customers, unpaid] = await Promise.all([
      customerRepository.creditLimitsOf(companyId, ids),
      customerInvoiceRepository.unpaidOf(companyId, ids, businessDay(new Date())),
    ]);
    return customers.map((c) => {
      const own = unpaid.filter((u) => u.customerId === c.id);
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
}

export const creditFactsService = new CreditFactsService();
