import { pgTable, text, numeric, date, uuid, jsonb, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const shipmentTable = pgTable(
  "shipment",
  {
    ...defaultTableColumns,
    jobNumber: text("job_number").notNull().unique(),
    shipper: text("shipper").notNull().default(""),
    consignee: text("consignee").notNull().default(""),
    personalReference: text("personal_reference").notNull().default(""),
    containerNumber: text("container_number").notNull().default(""),
    bookingNumber: text("booking_number").notNull().default(""),
    loadType: text("load_type").notNull().default(""),
    shippingLine: text("shipping_line").notNull().default(""),
    pol: text("pol").notNull().default(""),
    pod: text("pod").notNull().default(""),
    destination: text("destination").notNull().default(""),
    hsCode: text("hs_code").notNull().default(""),
    cargoDescription: text("cargo_description").notNull().default(""),
    houseBolNumber: text("house_bol_number").notNull().default(""),
    masterBolNumber: text("master_bol_number").notNull().default(""),
    houseBolType: text("house_bol_type").notNull().default(""),
    masterBolType: text("master_bol_type").notNull().default(""),
    vessel: text("vessel").notNull().default(""),
    voyage: text("voyage").notNull().default(""),
    pcs: text("pcs").notNull().default(""),
    totalWeightTons: numeric("total_weight_tons", { precision: 14, scale: 4 }),
    totalVolumeCbm: numeric("total_volume_cbm", { precision: 14, scale: 4 }),
    cargoOrigin: text("cargo_origin").notNull().default(""),
    countryCode: text("country_code").notNull().default(""),
    origin: text("origin").notNull().default(""),
    estimatedDeparture: date("estimated_departure"),
    estimatedArrival: date("estimated_arrival"),
    tradeDirection: text("trade_direction").notNull().default(""),
    agent: text("agent").notNull().default(""),
    incotermOrigin: text("incoterm_origin").notNull().default(""),
    incotermDestination: text("incoterm_destination").notNull().default(""),
    commercialInvoiceValue: numeric("commercial_invoice_value", { precision: 14, scale: 2 }),
    status: text("status").notNull().default("active"),
    customsStatus: text("customs_status").notNull().default(""),
    masterJobId: uuid("master_job_id"),
    containers: jsonb("containers"),
  },
  (table) => [
    ...defaultTableIndexes("shipment", table),
    index("shipment_job_number_idx").on(table.jobNumber),
  ],
);

export type ShipmentRecord = typeof shipmentTable.$inferSelect;
export type NewShipmentRecord = typeof shipmentTable.$inferInsert;
