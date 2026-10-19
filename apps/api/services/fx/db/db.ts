import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import { servicePool } from "../../../lib/db/pool";
import * as cnbRateSchema from "../schemas/cnbRate.schema";
import * as cnbImportRunSchema from "../schemas/cnbImportRun.schema";
import * as roeSettingSchema from "../schemas/roeSetting.schema";
import * as fxAlertSchema from "../schemas/fxAlert.schema";
import * as jobRateSchema from "../schemas/jobRate.schema";

export const DB = new SQLDatabase("fx", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = servicePool(DB.connectionString);

export const db = drizzle(pool, {
  schema: {
    ...cnbRateSchema,
    ...cnbImportRunSchema,
    ...roeSettingSchema,
    ...fxAlertSchema,
    ...jobRateSchema,
  },
});
