import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, timestamp, primaryKey, check } from "drizzle-orm/pg-core";
import { companyTable } from "./company.schema";
import { userTable } from "./user.schema";

// How often each user picked a place, airport or terminal code in a location picker (Origin, POL,
// POD, Destination, HUB, CFS, …): the pickers list the ones a user picks most first. One row per
// user and code.
export const locationPickTable = pgTable(
  "location_pick",
  {
    companyId: uuid("company_id").notNull().references(() => companyTable.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    // UN/LOCODE ("DEHAM"), IATA airport ("PVG"), ocean terminal ("DEHAMCTB") or inland terminal ("DE-IT116").
    code: text("code").notNull(),
    picks: integer("picks").notNull().default(0),
    lastPickedAt: timestamp("last_picked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "location_pick_pkey", columns: [table.companyId, table.userId, table.code] }),
    check("location_pick_picks_check", sql`${table.picks} >= 0`),
  ],
);

export type LocationPickRecord = typeof locationPickTable.$inferSelect;
