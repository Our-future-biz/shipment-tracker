import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as truckingSettingsSchema from "../schemas/truckingSettings.schema";
import * as truckingHaulierSchema from "../schemas/truckingHaulier.schema";
import * as truckingEventSchema from "../schemas/truckingEvent.schema";
import * as truckingTariffSchema from "../schemas/truckingTariff.schema";
import * as truckingFuelIndexSchema from "../schemas/truckingFuelIndex.schema";

const { Pool } = pg;

export const DB = new SQLDatabase("trucking", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = new Pool({
  connectionString: DB.connectionString,
});

export const db = drizzle(pool, {
  schema: {
    ...truckingSettingsSchema,
    ...truckingHaulierSchema,
    ...truckingEventSchema,
    ...truckingTariffSchema,
    ...truckingFuelIndexSchema,
  },
});

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
