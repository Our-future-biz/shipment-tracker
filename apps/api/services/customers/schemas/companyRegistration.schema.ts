import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { CustomerRole, ContactRole } from "../interfaces/interfaces";

// A company registers itself through a link a colleague created: one use, 14 days. What it filled in is
// kept here with the terms it accepted, and a manager answers it on Sales → Managers → Company approval.

export const companyRegistrationSettingsTable = pgTable("company_registration_settings", {
  companyId: uuid("company_id").primaryKey(),
  termsName: text("terms_name").notNull().default(""),
  termsUrl: text("terms_url").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyRegistrationLinkTable = pgTable(
  "company_registration_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull(),
    // Only the hash of the token in the URL: the URL can't be read back from here.
    tokenHash: text("token_hash").notNull(),
    roles: text("roles").array().$type<CustomerRole[]>().notNull(),
    // Who it is for, as the one who created it noted it.
    label: text("label").notNull().default(""),
    createdBy: text("created_by").notNull().default(""),
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("company_registration_link_token_idx").on(table.tokenHash), index("company_registration_link_company_idx").on(table.companyId, table.createdAt)],
);

export const companyRegistrationTable = pgTable(
  "company_registration",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull(),
    linkId: uuid("link_id").notNull(),
    // The new company waiting in the Customer Database, or the one already there.
    customerId: uuid("customer_id"),
    alreadyInDatabase: boolean("already_in_database").notNull().default(false),
    companyName: text("company_name").notNull(),
    ico: text("ico").notNull().default(""),
    dic: text("dic").notNull().default(""),
    registeredAddress: text("registered_address").notNull().default(""),
    city: text("city").notNull().default(""),
    country: text("country").notNull().default(""),
    dataSource: text("data_source").notNull().default(""),
    roles: text("roles").array().$type<CustomerRole[]>().notNull(),
    contactFirstName: text("contact_first_name").notNull(),
    contactLastName: text("contact_last_name").notNull(),
    contactEmail: text("contact_email").notNull().default(""),
    contactPhone: text("contact_phone").notNull().default(""),
    contactRole: text("contact_role").$type<ContactRole>(),
    // What was accepted, as it stood then.
    termsName: text("terms_name").notNull(),
    termsUrl: text("terms_url").notNull(),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }).notNull(),
    requestedBy: text("requested_by").notNull().default(""),
    requestedByUserId: uuid("requested_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").$type<"pending" | "approved" | "declined">().notNull().default("pending"),
    decidedBy: text("decided_by").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    comment: text("comment").notNull().default(""),
    answerSeenAt: timestamp("answer_seen_at", { withTimezone: true }),
  },
  (table) => [
    check("company_registration_status_check", sql`${table.status} IN ('pending', 'approved', 'declined')`),
    index("company_registration_company_idx").on(table.companyId, table.createdAt),
    index("company_registration_customer_idx").on(table.customerId),
  ],
);

// The chat on a company waiting in Company approval. A thread is the company (or, for a registration of a
// company already in the database, the registration).
export const companyApprovalMessageTable = pgTable(
  "company_approval_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull(),
    threadId: uuid("thread_id").notNull(),
    // Null for what the system says itself.
    authorUserId: uuid("author_user_id"),
    author: text("author").notNull().default(""),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("company_approval_message_thread_idx").on(table.threadId, table.createdAt), index("company_approval_message_company_idx").on(table.companyId, table.createdAt)],
);

export const companyApprovalParticipantTable = pgTable(
  "company_approval_participant",
  {
    companyId: uuid("company_id").notNull(),
    threadId: uuid("thread_id").notNull(),
    userId: uuid("user_id").notNull(),
    // In the chat: the one who asked, and whoever a manager added. A manager who only read it is not a member.
    member: boolean("member").notNull().default(false),
    addedByUserId: uuid("added_by_user_id"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.threadId, table.userId] }), index("company_approval_participant_user_idx").on(table.companyId, table.userId)],
);

export type CompanyRegistrationLinkRecord = typeof companyRegistrationLinkTable.$inferSelect;
export type CompanyRegistrationRecord = typeof companyRegistrationTable.$inferSelect;
export type NewCompanyRegistrationRecord = typeof companyRegistrationTable.$inferInsert;
export type CompanyApprovalMessageRecord = typeof companyApprovalMessageTable.$inferSelect;
