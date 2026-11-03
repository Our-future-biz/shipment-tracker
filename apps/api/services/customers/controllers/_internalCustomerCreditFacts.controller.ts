import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getAuthData } from "~encore/auth";
import { businessDay } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import { db } from "../db/db";
import { customerTable } from "../schemas/customer.schema";
import { customerInvoiceRepository } from "../repositories/customerInvoice.repository";

interface CreditFactsRequest {
  customerIds: string[] & MaxLen<2000>;
}

interface CustomerCreditFacts {
  customerId: string;
  /** 0 = no limit set. */
  creditLimit: number;
  currency: string;
  /** Unpaid (Open / Overdue) invoices, summed per currency. */
  unpaid: { currency: string; amount: number }[];
  overdueCount: number;
  /** The due day of the oldest overdue invoice; null for none. */
  oldestOverdueDue: string | null;
}

// Internal API of the quotes service (the Sales managers' cockpit, Council Outlay 6 D17): what the
// quoted customers owe, as the Finance tab counts it - unpaid invoices, and overdue ones (marked
// so, or Open past their due date). The cockpit converts and compares with the credit limit.
export const _internalCustomerCreditFacts = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customers/credit-facts" },
  async ({ customerIds }: CreditFactsRequest): Promise<{ customers: CustomerCreditFacts[] }> => {
    const companyId = getAuthData()!.companyID;
    const ids = [...new Set(customerIds.filter(isUuid))];
    if (!ids.length) return { customers: [] };
    const [customers, unpaid] = await Promise.all([
      db
        .select({ id: customerTable.id, creditLimit: customerTable.creditLimit, currency: customerTable.currency })
        .from(customerTable)
        .where(and(eq(customerTable.companyId, companyId), inArray(customerTable.id, ids), isNull(customerTable.deletedAt))),
      customerInvoiceRepository.unpaidOf(companyId, ids, businessDay(new Date())),
    ]);
    return {
      customers: customers.map((c) => {
        const own = unpaid.filter((u) => u.customerId === c.id);
        const overdue = own.filter((u) => u.overdue > 0);
        return {
          customerId: c.id,
          creditLimit: Number(c.creditLimit) || 0,
          currency: c.currency,
          unpaid: own.map((u) => ({ currency: u.currency, amount: u.amount })),
          overdueCount: overdue.reduce((n, u) => n + u.overdue, 0),
          oldestOverdueDue: overdue.map((u) => u.oldestDue).filter((d): d is string => !!d).sort()[0] ?? null,
        };
      }),
    };
  },
);
