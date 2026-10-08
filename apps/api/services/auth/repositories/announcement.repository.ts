import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { announcementTable, announcementReadTable } from "../schemas/announcement.schema";
import { userTable } from "../schemas/user.schema";
import { departmentTable, branchTable } from "../schemas/orgUnit.schema";

// Whose boards to read. `all` lifts the audience filter (company admins moderate every board).
export interface AnnouncementAudience {
  all: boolean;
  userId: string;
  departmentId: string | null;
  branchId: string | null;
  country: string | null;
}

class AnnouncementRepository extends TenantRepository<typeof announcementTable> {
  constructor() {
    super(db as never, announcementTable, "announcement");
  }

  // Newest first, with the author and target names resolved for display, and when the
  // reader (audience.userId) opened each post — null if they have not.
  async listForAudience(companyId: string, audience: AnnouncementAudience, limit = 400) {
    const conditions: SQL[] = [eq(announcementTable.companyId, companyId), isNull(announcementTable.deletedAt)];
    if (!audience.all) {
      // Everyone reads the company board and the boards they belong to; authors keep
      // seeing what they posted elsewhere so they can still edit or remove it.
      const visible: SQL[] = [eq(announcementTable.scope, "company"), eq(announcementTable.authorId, audience.userId)];
      if (audience.departmentId) {
        visible.push(and(eq(announcementTable.scope, "department"), eq(announcementTable.departmentId, audience.departmentId))!);
      }
      if (audience.branchId) {
        visible.push(and(eq(announcementTable.scope, "branch"), eq(announcementTable.branchId, audience.branchId))!);
      }
      if (audience.country) {
        visible.push(
          and(eq(announcementTable.scope, "country"), sql`lower(${announcementTable.country}) = ${audience.country.toLowerCase()}`)!,
        );
      }
      conditions.push(or(...visible)!);
    }

    return this.db
      .select({
        id: announcementTable.id,
        scope: announcementTable.scope,
        country: announcementTable.country,
        severity: announcementTable.severity,
        title: announcementTable.title,
        body: announcementTable.body,
        authorId: announcementTable.authorId,
        createdAt: announcementTable.createdAt,
        updatedAt: announcementTable.updatedAt,
        authorName: userTable.displayName,
        authorEmail: userTable.email,
        departmentName: departmentTable.name,
        branchName: branchTable.name,
        readAt: announcementReadTable.readAt,
      })
      .from(announcementTable)
      .innerJoin(userTable, eq(userTable.id, announcementTable.authorId))
      .leftJoin(departmentTable, eq(departmentTable.id, announcementTable.departmentId))
      .leftJoin(branchTable, eq(branchTable.id, announcementTable.branchId))
      .leftJoin(
        announcementReadTable,
        and(eq(announcementReadTable.announcementId, announcementTable.id), eq(announcementReadTable.userId, audience.userId)),
      )
      .where(and(...conditions))
      .orderBy(desc(announcementTable.createdAt))
      .limit(limit);
  }

  async markRead(announcementId: string, userId: string) {
    await this.db.insert(announcementReadTable).values({ announcementId, userId }).onConflictDoNothing();
  }
}

export const announcementRepository = new AnnouncementRepository();
