import { pgTable, text, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const userTable = pgTable(
  "app_user",
  {
    ...defaultTableColumns,
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull().default(""),
    role: text("role").notNull().default("user"),
  },
  (table) => [
    ...defaultTableIndexes("app_user", table),
    index("app_user_email_idx").on(table.email),
  ],
);

