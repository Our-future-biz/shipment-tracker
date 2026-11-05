import { sql } from "drizzle-orm";
import { pgTable, text, uuid, doublePrecision, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// The margin floor of one freight mode, as a company's sales managers set it (Sales Settings →
// Guardrails, Council Outlay 6 D1-D3). A mode with no row has the default floor
// (lib/guardrails DEFAULT_GUARDRAILS); Road is not stored here - it is Trucking's floor.
export const quoteGuardrailTable = pgTable(
  "quote_guardrail",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    /** The quote's freight mode as it stores it: "Sea FCL", "Air", ... */
    serviceType: text("service_type").notNull(),
    percent: doublePrecision("percent").notNull(),
    /** CZK; per container for the modes priced by the box (Sea FCL, Rail). */
    minAmountCzk: doublePrecision("min_amount_czk").notNull(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [
    ...defaultTableIndexes("quote_guardrail", table),
    tenantIndex("quote_guardrail", table),
    uniqueIndex("quote_guardrail_company_mode_unique").on(table.companyId, table.serviceType).where(sql`deleted_at IS NULL`),
  ],
);

export type QuoteGuardrailRecord = typeof quoteGuardrailTable.$inferSelect;
