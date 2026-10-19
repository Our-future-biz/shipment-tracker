import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import { servicePool } from "../../../lib/db/pool";
import * as publicHolidaySchema from "../schemas/publicHoliday.schema";

export const DB = new SQLDatabase("holidays", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = servicePool(DB.connectionString);

export const db = drizzle(pool, {
  schema: {
    ...publicHolidaySchema,
  },
});
