import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import { servicePool } from "../../../lib/db/pool";
import * as truckingSettingsSchema from "../schemas/truckingSettings.schema";
import * as truckingHaulierSchema from "../schemas/truckingHaulier.schema";
import * as truckingEventSchema from "../schemas/truckingEvent.schema";
import * as truckingTariffSchema from "../schemas/truckingTariff.schema";
import * as truckingFuelIndexSchema from "../schemas/truckingFuelIndex.schema";
import * as truckingConsignmentSchema from "../schemas/truckingConsignment.schema";
import * as truckingOutboxSchema from "../schemas/truckingOutbox.schema";
import * as haulierInvoiceSchema from "../schemas/haulierInvoice.schema";
import * as avizaceSchema from "../schemas/avizace.schema";
import * as internalSchema from "../schemas/internal.schema";
import * as rateGapSchema from "../schemas/rateGap.schema";
import * as portalSchema from "../schemas/portal.schema";

export const DB = new SQLDatabase("trucking", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = servicePool(DB.connectionString);

export const db = drizzle(pool, {
  schema: {
    ...truckingSettingsSchema,
    ...truckingHaulierSchema,
    ...truckingEventSchema,
    ...truckingTariffSchema,
    ...truckingFuelIndexSchema,
    ...truckingConsignmentSchema,
    ...truckingOutboxSchema,
    ...haulierInvoiceSchema,
    ...avizaceSchema,
    ...internalSchema,
    ...rateGapSchema,
    ...portalSchema,
  },
});

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Runs `work` in one transaction (services that write several tables and their event together). */
export const inTx = <T>(work: (tx: Tx) => Promise<T>): Promise<T> => db.transaction(work);
