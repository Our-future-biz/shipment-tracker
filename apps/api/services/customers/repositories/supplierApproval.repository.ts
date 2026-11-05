import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db/db";
import { customerTable, type CustomerRecord } from "../schemas/customer.schema";
import type { SupplierApprovalDecision } from "../interfaces/interfaces";

/** A new supplier as the Company approval list shows it, with its main contact. */
export type SupplierApprovalRow = Pick<
  CustomerRecord,
  | "id"
  | "companyName"
  | "ico"
  | "dic"
  | "registeredAddress"
  | "city"
  | "country"
  | "dataSource"
  | "roles"
  | "approvalStatus"
  | "approvalRequestedBy"
  | "approvalRequestedByUserId"
  | "approvalRequestedAt"
  | "approvalQuoteNumber"
  | "approvalDecision"
  | "approvalDecidedBy"
  | "approvalDecidedAt"
  | "approvalComment"
  | "approvalAnswerSeenAt"
> & { contactName: string; contactEmail: string; contactPhone: string };

// The main contact given with the company. A declined one's contacts were hidden with it, so its
// contact is read whether deleted or not: the newest main one.
const mainContact = (column: "name" | "email" | "phone") => {
  const value = sql.raw(`c.${column}`);
  return sql<string>`coalesce((select ${value} from contact as c where c.customer_id = "customer"."id" and c.company_id = "customer"."company_id" and c.is_main order by c.created_at desc limit 1), '')`;
};

class SupplierApprovalRepository {
  /** What waits for a manager, and what was answered since `since` (declined ones are deleted, and listed too). */
  async list(companyId: string, since: Date): Promise<SupplierApprovalRow[]> {
    return db
      .select({
        id: customerTable.id,
        companyName: customerTable.companyName,
        ico: customerTable.ico,
        dic: customerTable.dic,
        registeredAddress: customerTable.registeredAddress,
        city: customerTable.city,
        country: customerTable.country,
        dataSource: customerTable.dataSource,
        roles: customerTable.roles,
        approvalStatus: customerTable.approvalStatus,
        approvalRequestedBy: customerTable.approvalRequestedBy,
        approvalRequestedByUserId: customerTable.approvalRequestedByUserId,
        approvalRequestedAt: customerTable.approvalRequestedAt,
        approvalQuoteNumber: customerTable.approvalQuoteNumber,
        approvalDecision: customerTable.approvalDecision,
        approvalDecidedBy: customerTable.approvalDecidedBy,
        approvalDecidedAt: customerTable.approvalDecidedAt,
        approvalComment: customerTable.approvalComment,
        approvalAnswerSeenAt: customerTable.approvalAnswerSeenAt,
        contactName: mainContact("name"),
        contactEmail: mainContact("email"),
        contactPhone: mainContact("phone"),
      })
      .from(customerTable)
      .where(
        and(
          eq(customerTable.companyId, companyId),
          isNotNull(customerTable.approvalRequestedAt),
          or(
            and(eq(customerTable.approvalStatus, "pending"), isNull(customerTable.deletedAt)),
            gte(customerTable.approvalDecidedAt, since),
          ),
        ),
      )
      .orderBy(desc(customerTable.approvalRequestedAt))
      .limit(500);
  }

  /**
   * A manager's answer to a supplier that still waits: approved it is a supplier like any other,
   * declined it is marked so (the service then deletes it). Null when it no longer waits (answered
   * meanwhile, or deleted): nothing is written.
   */
  async decide(
    companyId: string,
    id: string,
    answer: { decision: Exclude<SupplierApprovalDecision, "">; by: string; byUserId: string; comment: string },
  ): Promise<CustomerRecord | null> {
    const now = new Date();
    const [row] = await db
      .update(customerTable)
      .set({
        approvalStatus: answer.decision === "approved" ? "" : "declined",
        approvalDecision: answer.decision,
        approvalDecidedBy: answer.by,
        approvalDecidedByUserId: answer.byUserId,
        approvalDecidedAt: now,
        approvalComment: answer.comment,
        // A manager answering their own request has seen the answer.
        approvalAnswerSeenAt: sql`case when ${customerTable.approvalRequestedByUserId} = ${answer.byUserId} then ${now.toISOString()}::timestamptz else null end`,
        updatedAt: now,
      })
      .where(
        and(
          eq(customerTable.id, id),
          eq(customerTable.companyId, companyId),
          eq(customerTable.approvalStatus, "pending"),
          isNull(customerTable.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  }

  /** The answers to the user's own requests among `ids` are seen. */
  async markSeen(companyId: string, userId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    await db
      .update(customerTable)
      .set({ approvalAnswerSeenAt: new Date() })
      .where(
        and(
          eq(customerTable.companyId, companyId),
          inArray(customerTable.id, ids),
          eq(customerTable.approvalRequestedByUserId, userId),
          ne(customerTable.approvalDecision, ""),
          isNull(customerTable.approvalAnswerSeenAt),
        ),
      );
  }

  /** Where the companies of `ids` stand, deleted ones too: for the quotes service's send check. */
  async states(companyId: string, ids: string[]) {
    if (!ids.length) return [];
    return db
      .select({
        id: customerTable.id,
        companyName: customerTable.companyName,
        approvalStatus: customerTable.approvalStatus,
        approvalComment: customerTable.approvalComment,
        deletedAt: customerTable.deletedAt,
      })
      .from(customerTable)
      .where(and(eq(customerTable.companyId, companyId), inArray(customerTable.id, ids)));
  }
}

export const supplierApprovalRepository = new SupplierApprovalRepository();
