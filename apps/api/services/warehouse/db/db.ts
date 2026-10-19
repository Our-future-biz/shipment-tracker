import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import { servicePool } from "../../../lib/db/pool";
import * as warehouseTaskSchema from "../schemas/warehouseTask.schema";
import * as warehouseSectionSchema from "../schemas/warehouseSection.schema";

export const DB = new SQLDatabase("warehouse_basic", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = servicePool(DB.connectionString);

export const db = drizzle(pool, {
  schema: {
    ...warehouseTaskSchema,
    ...warehouseSectionSchema,
  },
});
