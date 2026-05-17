import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as quoteSchema from "../schemas/quote.schema";
import * as quoteRefSequenceSchema from "../schemas/quoteRefSequence.schema";

const { Pool } = pg;

export const DB = new SQLDatabase("quotes", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = new Pool({
  connectionString: DB.connectionString,
});

export const db = drizzle(pool, {
  schema: {
    ...quoteSchema,
    ...quoteRefSequenceSchema,
  },
});
