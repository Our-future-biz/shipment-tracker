import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as cnbRateSchema from "../schemas/cnbRate.schema";
import * as cnbImportRunSchema from "../schemas/cnbImportRun.schema";
import * as roeSettingSchema from "../schemas/roeSetting.schema";
import * as fxAlertSchema from "../schemas/fxAlert.schema";

const { Pool } = pg;

export const DB = new SQLDatabase("fx", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = new Pool({
  connectionString: DB.connectionString,
});

export const db = drizzle(pool, {
  schema: {
    ...cnbRateSchema,
    ...cnbImportRunSchema,
    ...roeSettingSchema,
    ...fxAlertSchema,
  },
});
