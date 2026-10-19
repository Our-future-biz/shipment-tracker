import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import { servicePool } from "../../../lib/db/pool";
import * as termsConditionSchema from "../schemas/termsCondition.schema";
import * as salesPreferenceSchema from "../schemas/salesPreference.schema";
import * as followupTaskSchema from "../schemas/followupTask.schema";

export const DB = new SQLDatabase("sales", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = servicePool(DB.connectionString);

export const db = drizzle(pool, {
  schema: {
    ...termsConditionSchema,
    ...salesPreferenceSchema,
    ...followupTaskSchema,
  },
});
