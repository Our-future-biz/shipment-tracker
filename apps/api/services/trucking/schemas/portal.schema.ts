import { sql } from "drizzle-orm";
import { pgTable, text, integer, uuid, timestamp, index, uniqueIndex, check, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export type PortalUserStatus = "ACTIVE" | "DISABLED";
export type PortalTokenKind = "INVITE" | "RESET";

// The haulier portal's own identities: staff of one haulier (a Customer Database company with the
// role haulier) who log in with e-mail and password. They are not app users (not in the auth
// service, never an Encore auth token). The password is stored only as an argon2id hash and is
// null until the invitation link was used. failed_attempts / locked_until / lock_level throttle the
// login per account (progressive lock); trucking_portal_login_throttle throttles it per IP.
// `version` is bumped by every write.
export const truckingPortalUserTable = pgTable(
  "trucking_portal_user",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    haulierCustomerId: uuid("haulier_customer_id").notNull(),
    /** Lower-cased */
    email: text("email").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    passwordHash: text("password_hash"),
    status: text("status").$type<PortalUserStatus>().notNull().default("ACTIVE"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    /** The end of the last lock (kept after it ends: a new lock within 24 h of it is longer) */
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    /** How many locks in a row (progressive lock: 15 min, 30 min, 1 h); 0 after a login */
    lockLevel: integer("lock_level").notNull().default(0),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** The app user (manager) who created the portal user */
    createdBy: uuid("created_by").notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    ...defaultTableIndexes("trucking_portal_user", table),
    tenantIndex("trucking_portal_user", table),
    uniqueIndex("trucking_portal_user_email_unique").on(table.companyId, table.email).where(sql`deleted_at IS NULL`),
    index("trucking_portal_user_email_idx").on(table.email),
    index("trucking_portal_user_haulier_idx").on(table.companyId, table.haulierCustomerId),
    check("trucking_portal_user_status_check", sql`${table.status} IN ('ACTIVE', 'DISABLED')`),
    check("trucking_portal_user_email_check", sql`${table.email} = lower(${table.email}) AND length(${table.email}) BETWEEN 3 AND 254`),
    check("trucking_portal_user_failed_check", sql`${table.failedAttempts} >= 0`),
  ],
);

// A portal login. Only the SHA-256 of the 32-byte random session token is stored; the token goes
// to the browser once. expires_at slides (12 h after the last request) but never past
// absolute_expires_at (7 days after the login). Revoked on logout, password reset, a disabled
// user and a blocked haulier.
export const truckingPortalSessionTable = pgTable(
  "trucking_portal_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    userId: uuid("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: text("ip").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
  },
  (table) => [
    tenantIndex("trucking_portal_session", table),
    uniqueIndex("trucking_portal_session_token_unique").on(table.tokenHash),
    index("trucking_portal_session_user_idx").on(table.userId),
    foreignKey({ name: "trucking_portal_session_user_fk", columns: [table.userId], foreignColumns: [truckingPortalUserTable.id] }).onDelete("restrict"),
    check("trucking_portal_session_hash_check", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check("trucking_portal_session_expiry_check", sql`${table.expiresAt} <= ${table.absoluteExpiresAt}`),
  ],
);

// A one-time link to set the password: INVITE for a new portal user, RESET from a manager. Only
// the SHA-256 of the 32-byte token is stored; valid 72 h, used once (used_at). A newer link of the
// same user closes the older ones.
export const truckingPortalTokenTable = pgTable(
  "trucking_portal_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    userId: uuid("user_id").notNull(),
    kind: text("kind").$type<PortalTokenKind>().notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    tenantIndex("trucking_portal_token", table),
    uniqueIndex("trucking_portal_token_hash_unique").on(table.tokenHash),
    index("trucking_portal_token_user_idx").on(table.userId),
    foreignKey({ name: "trucking_portal_token_user_fk", columns: [table.userId], foreignColumns: [truckingPortalUserTable.id] }).onDelete("restrict"),
    check("trucking_portal_token_kind_check", sql`${table.kind} IN ('INVITE', 'RESET')`),
    check("trucking_portal_token_hash_check", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

// The portal login's throttle per client IP (key "ip:<address>"), across every e-mail and company:
// failures counted in a 15-minute window; at 20 the IP is locked, longer each time (15 min doubling
// to 24 h). Not a tenant table: a login knows no company. Rows quiet for 2 days are pruned.
export const truckingPortalLoginThrottleTable = pgTable(
  "trucking_portal_login_throttle",
  {
    key: text("key").primaryKey(),
    failures: integer("failures").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lockLevel: integer("lock_level").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("trucking_portal_login_throttle_updated_idx").on(table.updatedAt), check("trucking_portal_login_throttle_failures_check", sql`${table.failures} >= 0`)],
);

export type PortalUserRecord = typeof truckingPortalUserTable.$inferSelect;
export type PortalLoginThrottleRecord = typeof truckingPortalLoginThrottleTable.$inferSelect;
export type NewPortalUserRecord = typeof truckingPortalUserTable.$inferInsert;
export type PortalSessionRecord = typeof truckingPortalSessionTable.$inferSelect;
export type NewPortalSessionRecord = typeof truckingPortalSessionTable.$inferInsert;
export type PortalTokenRecord = typeof truckingPortalTokenTable.$inferSelect;
