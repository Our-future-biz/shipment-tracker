import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as customerSchema from "../schemas/customer.schema";
import * as contactSchema from "../schemas/contact.schema";
import * as customerNoteSchema from "../schemas/customerNote.schema";
import * as customerDocumentSchema from "../schemas/customerDocument.schema";
import * as customerInvoiceSchema from "../schemas/customerInvoice.schema";

const { Pool } = pg;

export const DB = new SQLDatabase("customers", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = new Pool({
  connectionString: DB.connectionString,
});

export const db = drizzle(pool, {
  schema: {
    ...customerSchema,
    ...contactSchema,
    ...customerNoteSchema,
    ...customerDocumentSchema,
    ...customerInvoiceSchema,
  },
});
