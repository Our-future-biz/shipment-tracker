import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/db";
import { claimTimeLimitsTable as t, type ClaimTimeLimitsRecord, type NewClaimTimeLimitsRecord } from "../schemas/claimTimeLimits.schema";

/** What a save writes: everything of the row but its keys and stamps of creation. */
export type ClaimTimeLimitsValues = Omit<NewClaimTimeLimitsRecord, "id" | "companyId" | "createdAt" | "updatedAt" | "deletedAt">;

// The company's claim time limits: one row per company (lib/claimTimeLimits says what they mean).
class ClaimTimeLimitsRepository {
  /** The company's row; null when it never saved its limits (they are then off, with the general practice shown). */
  async of(companyId: string): Promise<ClaimTimeLimitsRecord | null> {
    const [row] = await db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), isNull(t.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /** Writes the company's limits (its one row, written or replaced) and answers the row as saved. */
  async save(companyId: string, values: ClaimTimeLimitsValues): Promise<ClaimTimeLimitsRecord> {
    const now = new Date();
    const [row] = await db
      .insert(t)
      .values({ companyId, ...values, updatedAt: now })
      .onConflictDoUpdate({ target: t.companyId, set: { ...values, updatedAt: now, deletedAt: null } })
      .returning();
    return row!;
  }
}

export const claimTimeLimitsRepository = new ClaimTimeLimitsRepository();
