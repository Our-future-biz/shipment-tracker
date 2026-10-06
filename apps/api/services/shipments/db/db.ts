import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as shipmentSchema from "../schemas/shipment.schema";
import * as masterJobSchema from "../schemas/masterJob.schema";
import * as shipmentAuditSchema from "../schemas/shipmentAudit.schema";
import * as shipmentCommentSchema from "../schemas/shipmentComment.schema";
import * as shipmentTaskSchema from "../schemas/shipmentTask.schema";
import * as shipmentAttachmentSchema from "../schemas/shipmentAttachment.schema";
import * as userPreferenceSchema from "../schemas/userPreference.schema";

const { Pool } = pg;

export const DB = new SQLDatabase("shipments", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = new Pool({
  connectionString: DB.connectionString,
});

export const db = drizzle(pool, {
  schema: {
    ...shipmentSchema,
    ...masterJobSchema,
    ...shipmentAuditSchema,
    ...shipmentCommentSchema,
    ...shipmentTaskSchema,
    ...shipmentAttachmentSchema,
    ...userPreferenceSchema,
  },
});
