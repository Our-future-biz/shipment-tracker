import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as warehouseTaskSchema from "../schemas/warehouseTask.schema";
import * as warehouseSectionSchema from "../schemas/warehouseSection.schema";
import * as gateMovementSchema from "../schemas/gateMovement.schema";
import * as gateFileSchema from "../schemas/gateFile.schema";
import * as warehouseRecordsSchema from "../schemas/warehouseRecords.schema";
import * as warehouseStockSchema from "../schemas/warehouseStock.schema";
import * as warehouseRefCounterSchema from "../schemas/warehouseRefCounter.schema";
import * as shipmentOutboxSchema from "../schemas/shipmentOutbox.schema";
import * as warehouseExceptionSchema from "../schemas/warehouseException.schema";
import * as warehouseReweighSchema from "../schemas/warehouseReweigh.schema";
import * as warehouseSettingsSchema from "../schemas/warehouseSettings.schema";

const { Pool } = pg;

export const DB = new SQLDatabase("warehouse", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = new Pool({
  connectionString: DB.connectionString,
});

export const db = drizzle(pool, {
  schema: {
    ...warehouseTaskSchema,
    ...warehouseSectionSchema,
    ...gateMovementSchema,
    ...gateFileSchema,
    ...warehouseRecordsSchema,
    ...warehouseStockSchema,
    ...warehouseRefCounterSchema,
    ...shipmentOutboxSchema,
    ...warehouseExceptionSchema,
    ...warehouseReweighSchema,
    ...warehouseSettingsSchema,
  },
});
