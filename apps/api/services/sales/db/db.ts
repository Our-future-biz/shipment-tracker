import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as termsConditionSchema from "../schemas/termsCondition.schema";
import * as salesPreferenceSchema from "../schemas/salesPreference.schema";

const { Pool } = pg;

export const DB = new SQLDatabase("sales", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = new Pool({
  connectionString: DB.connectionString,
});

export const db = drizzle(pool, {
  schema: {
    ...termsConditionSchema,
    ...salesPreferenceSchema,
  },
});
