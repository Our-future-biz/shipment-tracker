import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenantColumns } from "../../../lib/db/defaults";

// A ticked step of a Co-Loading Concept sailing's checklist (Council Outlay 14, C5): who ticked it and
// when. One row per sailing and step; unticking takes the row away, and the sailing's record of
// changes keeps both. The step is kept by its words, so a tick outlives a change of the company's list.
export const coLoadingSailingCheckTable = pgTable(
  "co_loading_sailing_check",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    sailingId: uuid("sailing_id").notNull(),
    step: text("step").notNull(),
    doneById: uuid("done_by_id"),
    doneByName: text("done_by_name").notNull().default(""),
    doneAt: timestamp("done_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("co_loading_sailing_check_company_id_idx").on(table.companyId),
    uniqueIndex("co_loading_sailing_check_one_per_step").on(table.companyId, table.sailingId, table.step),
  ],
);

export type CoLoadingSailingCheckRecord = typeof coLoadingSailingCheckTable.$inferSelect;
