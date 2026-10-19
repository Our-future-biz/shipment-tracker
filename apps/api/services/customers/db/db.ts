import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import { servicePool } from "../../../lib/db/pool";
import * as customerSchema from "../schemas/customer.schema";
import * as contactSchema from "../schemas/contact.schema";
import * as customerNoteSchema from "../schemas/customerNote.schema";
import * as customerDocumentSchema from "../schemas/customerDocument.schema";
import * as customerInvoiceSchema from "../schemas/customerInvoice.schema";
import * as customerSiteSchema from "../schemas/customerSite.schema";

export const DB = new SQLDatabase("customers", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = servicePool(DB.connectionString);

export const db = drizzle(pool, {
  schema: {
    ...customerSchema,
    ...contactSchema,
    ...customerNoteSchema,
    ...customerDocumentSchema,
    ...customerInvoiceSchema,
    ...customerSiteSchema,
  },
});
