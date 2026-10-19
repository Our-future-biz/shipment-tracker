import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, index, check } from "drizzle-orm/pg-core";

// The app login's failed-login counters (the haulier portal keeps its own). One row per bucket:
// "ip:<address>" (any e-mail), "ipmail:<address>|<e-mail>" / "mail:<e-mail>" when the IP can't be
// trusted or is unknown, and "acct:<e-mail>" (any IP). Not a tenant table: a login knows no
// company. Rows quiet for 2 days are pruned.
export const loginThrottleTable = pgTable(
  "login_throttle",
  {
    key: text("key").primaryKey(),
    failures: integer("failures").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lockLevel: integer("lock_level").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("login_throttle_updated_idx").on(table.updatedAt), check("login_throttle_failures_check", sql`${table.failures} >= 0`)],
);

export type LoginThrottleRecord = typeof loginThrottleTable.$inferSelect;
