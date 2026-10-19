import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import { servicePool } from "../../../lib/db/pool";
import * as quoteSchema from "../schemas/quote.schema";
import * as quoteRefSequenceSchema from "../schemas/quoteRefSequence.schema";
import * as quoteAttachmentSchema from "../schemas/quoteAttachment.schema";

export const DB = new SQLDatabase("quotes", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = servicePool(DB.connectionString);

export const db = drizzle(pool, {
  schema: {
    ...quoteSchema,
    ...quoteRefSequenceSchema,
    ...quoteAttachmentSchema,
  },
});
