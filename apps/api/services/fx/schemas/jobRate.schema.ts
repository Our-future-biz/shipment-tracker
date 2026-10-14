import { pgTable, text, date, uuid, jsonb, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// ČNB rate of one currency as locked on a job: CZK per 1 unit and the fixing it came from.
export type LockedRates = Record<string, { rate: number; fixingDate: string }>;

// A job's exchange rates, locked at its tax date: ATA for imports, ATD for exports (owner
// decision, 14 Oct 2026). Until then the job is valued provisionally by ETA/ETD and has no
// row here. A changed ATA/ATD re-locks at the new date — until the job is invoiced, after
// which the date (and so the lock) is final.
export const jobRateTable = pgTable(
  "job_rate",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    basis: text("basis").notNull(), // ata | atd
    rateDate: date("rate_date", { mode: "string" }).notNull(),
    rates: jsonb("rates").$type<LockedRates>().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
    previousRateDate: date("previous_rate_date", { mode: "string" }), // set when re-locked
    relockCount: integer("relock_count").notNull().default(0),
  },
  (table) => [
    ...defaultTableIndexes("job_rate", table),
    tenantIndex("job_rate", table),
    uniqueIndex("job_rate_company_shipment_unique").on(table.companyId, table.shipmentId),
  ],
);

export type JobRateRecord = typeof jobRateTable.$inferSelect;
