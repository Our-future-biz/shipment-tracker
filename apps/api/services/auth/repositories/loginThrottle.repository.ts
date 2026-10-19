import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { nextFailure, type FailureRule } from "../../../lib/loginRules";
import { db } from "../db/db";
import { loginThrottleTable, type LoginThrottleRecord } from "../schemas/loginThrottle.schema";

const th = loginThrottleTable;
/** Throttle rows quiet this long are pruned. */
const THROTTLE_KEEP_MS = 2 * 24 * 60 * 60 * 1000;

// The app login's failed-login counters (see loginThrottle.schema.ts).
class LoginThrottleRepository {
  async byKeys(keys: string[]): Promise<LoginThrottleRecord[]> {
    if (!keys.length) return [];
    return db.select().from(th).where(inArray(th.key, keys));
  }

  /** One more failed login under `key`, counted under a row lock; rows quiet for 2 days are pruned. */
  async fail(key: string, now: Date, rule: FailureRule): Promise<LoginThrottleRecord> {
    return db.transaction(async (tx) => {
      await tx.insert(th).values({ key, failures: 0, windowStartedAt: now, updatedAt: now }).onConflictDoNothing();
      const [cur] = await tx.select().from(th).where(eq(th.key, key)).for("update");
      const next = nextFailure({ failures: cur!.failures, windowStartedAt: cur!.windowStartedAt, lockedUntil: cur!.lockedUntil, lockLevel: cur!.lockLevel }, now, rule);
      const [row] = await tx
        .update(th)
        .set({ failures: next.failures, windowStartedAt: next.windowStartedAt ?? now, lockedUntil: next.lockedUntil, lockLevel: next.lockLevel, updatedAt: now })
        .where(eq(th.key, key))
        .returning();
      await tx.delete(th).where(and(lt(th.updatedAt, new Date(now.getTime() - THROTTLE_KEEP_MS)), sql`(${th.lockedUntil} IS NULL OR ${th.lockedUntil} < ${now.toISOString()}::timestamptz)`));
      return row!;
    });
  }

  /** A signed-in account starts counting from zero again (its lock history stays until it ages out). */
  async clearFailures(key: string): Promise<void> {
    await db.update(th).set({ failures: 0, updatedAt: new Date() }).where(eq(th.key, key));
  }
}

export const loginThrottleRepository = new LoginThrottleRepository();
