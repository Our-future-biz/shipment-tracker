import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import { servicePool } from "../../../lib/db/pool";
import * as tariffSchema from "../schemas/tariff.schema";

export const DB = new SQLDatabase("tariffs", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = servicePool(DB.connectionString);

export const db = drizzle(pool, {
  schema: {
    ...tariffSchema,
  },
});
