import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import { servicePool } from "../../../lib/db/pool";
import * as loadingPlanSchema from "../schemas/loadingPlan.schema";
import * as plannerSettingSchema from "../schemas/plannerSetting.schema";

export const DB = new SQLDatabase("loadingPlanner", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = servicePool(DB.connectionString);

export const db = drizzle(pool, {
  schema: {
    ...loadingPlanSchema,
    ...plannerSettingSchema,
  },
});
