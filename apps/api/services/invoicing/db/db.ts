import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as invoiceCostSchema from "../schemas/invoiceCost.schema";
import * as invoiceAdditionalChargeSchema from "../schemas/invoiceAdditionalCharge.schema";
import * as billingSettingsSchema from "../schemas/billingSettings.schema";
import * as billingOverrideSchema from "../schemas/billingOverride.schema";
import * as generatedInvoiceSchema from "../schemas/generatedInvoice.schema";
import * as invoiceSellingCostSchema from "../schemas/invoiceSellingCost.schema";
import * as exchangeRateSchema from "../schemas/exchangeRate.schema";

const { Pool } = pg;

export const DB = new SQLDatabase("invoicing", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = new Pool({
  connectionString: DB.connectionString,
});

export const db = drizzle(pool, {
  schema: {
    ...invoiceCostSchema,
    ...invoiceAdditionalChargeSchema,
    ...billingSettingsSchema,
    ...billingOverrideSchema,
    ...generatedInvoiceSchema,
    ...invoiceSellingCostSchema,
    ...exchangeRateSchema,
  },
});
