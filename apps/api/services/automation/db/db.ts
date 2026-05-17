import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as automationLogSchema from "../schemas/automationLog.schema";

const { Pool } = pg;

export const DB = new SQLDatabase("automation", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = new Pool({
  connectionString: DB.connectionString,
});

export const db = drizzle(pool, {
  schema: {
    ...automationLogSchema,
  },
});
