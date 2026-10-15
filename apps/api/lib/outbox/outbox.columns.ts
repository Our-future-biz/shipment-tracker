import { sql } from "drizzle-orm";
import { check, integer, text, timestamp, type PgColumn } from "drizzle-orm/pg-core";

// The delivery bookkeeping every transactional outbox table carries. Each Encore service has its
// own database, so each service owns its own outbox table (with its own target and payload
// columns) and spreads these in; the delivery code in lib/outbox works on any such table.

export type OutboxStatus = "pending" | "sent" | "failed" | "cancelled";

export const outboxColumns = {
  // The user the update is sent as (and their role when it was written).
  actingUserId: text("acting_user_id").notNull(),
  actingRole: text("acting_role").notNull(),
  status: text("status").$type<OutboxStatus>().notNull().default("pending"),
  // Claims so far; also the token of the latest claim (see OutboxRepository.claimDueRows).
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastError: text("last_error").notNull().default(""),
  sentAt: timestamp("sent_at", { withTimezone: true }),
};

/** The CHECK constraint that keeps `status` to the four outbox states. */
export const outboxStatusCheck = (name: string, table: { status: PgColumn }) =>
  check(name, sql`${table.status} IN ('pending', 'sent', 'failed', 'cancelled')`);
