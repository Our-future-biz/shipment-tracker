import { pgTable, text, uuid, jsonb, index, unique } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";
import { userTable } from "./user.schema";

export const columnTemplateTable = pgTable(
  "column_template",
  {
    ...defaultTableColumns,
    userId: uuid("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    // The screen the template belongs to ("shipments", "warehouse-in", …); each screen
    // lists and saves only its own.
    scope: text("scope").notNull().default("shipments"),
    name: text("name").notNull(),
    columns: jsonb("columns").$type<string[]>().notNull(),
  },
  (table) => [
    ...defaultTableIndexes("column_template", table),
    index("column_template_user_id_idx").on(table.userId),
    unique("column_template_user_scope_name_uq").on(table.userId, table.scope, table.name),
  ],
);
