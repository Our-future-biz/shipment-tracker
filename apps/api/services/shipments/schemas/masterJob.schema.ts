import { sql } from "drizzle-orm";
import { date, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// A master job is one master bill of lading (MBL) with the house shipments
// consolidated under it. The MBL details live here once; the transport fields
// listed in masterJobSync.ts are copied onto every linked shipment.
export const masterJobTable = pgTable(
  "master_job",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    mczNumber: text("mcz_number").notNull(),

    // Master job only — houses keep their own values.
    freightMode: text("freight_mode").notNull().default(""),
    tradeDirection: text("trade_direction").notNull().default(""),
    incotermOrigin: text("incoterm_origin").notNull().default(""),
    incotermDestination: text("incoterm_destination").notNull().default(""),
    destination: text("destination").notNull().default(""),
    shipper: text("shipper").notNull().default(""),
    // CRM customer ids (customers database), so no FK — same as on shipment.
    shipperId: uuid("shipper_id"),
    consignee: text("consignee").notNull().default(""),
    consigneeId: uuid("consignee_id"),
    // Cargo totals of the whole MBL, as read from the master BL.
    pcs: text("pcs").notNull().default(""),
    typeOfPackages: text("type_of_packages").notNull().default(""),
    totalWeightTons: text("total_weight_tons").notNull().default(""),
    totalVolumeCbm: text("total_volume_cbm").notNull().default(""),

    // Copied onto the linked shipments.
    loadType: text("load_type").notNull().default(""),
    serviceName: text("service_name").notNull().default(""),
    shippingLine: text("shipping_line").notNull().default(""),
    pol: text("pol").notNull().default(""),
    pod: text("pod").notNull().default(""),
    estimatedDeparture: date("estimated_departure", { mode: "string" }),
    estimatedArrival: date("estimated_arrival", { mode: "string" }),
    actualDeparture: date("actual_departure", { mode: "string" }),
    actualArrival: date("actual_arrival", { mode: "string" }),
    etaWarehouse: date("eta_warehouse", { mode: "string" }),
    warehouseReceivedDate: date("warehouse_received_date", { mode: "string" }),
    // Booked equipment as read from the booking confirmation, e.g. "2 x 40' HC, 1 x 20' GP".
    // The container list itself needs numbers, which come later with the MBL.
    equipment: text("equipment").notNull().default(""),
    // From the booking confirmation (copied onto the linked shipments).
    bookingNumber: text("booking_number").notNull().default(""),
    closingDate: date("closing_date", { mode: "string" }),
    vgmClosing: date("vgm_closing", { mode: "string" }),
    siClosing: date("si_closing", { mode: "string" }),
    releaseReference: text("release_reference").notNull().default(""),
    releaseDepot: text("release_depot").notNull().default(""),
    redeliveryReference: text("redelivery_reference").notNull().default(""),
    redeliveryDepot: text("redelivery_depot").notNull().default(""),
    supplierPic: text("supplier_pic").notNull().default(""),
    masterBolNumber: text("master_bol_number").notNull().default(""),
    masterBolType: text("master_bol_type").notNull().default(""),
    vessel: text("vessel").notNull().default(""),
    voyage: text("voyage").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("master_job", table),
    tenantIndex("master_job", table),
    // MCZ numbers are unique per company among live rows.
    uniqueIndex("master_job_company_mcz_unique")
      .on(table.companyId, table.mczNumber)
      .where(sql`deleted_at IS NULL`),
    // A customer renamed in the Customer Database is found here by its id.
    index("master_job_shipper_id_idx").on(table.companyId, table.shipperId),
    index("master_job_consignee_id_idx").on(table.companyId, table.consigneeId),
  ],
);

export type MasterJobRecord = typeof masterJobTable.$inferSelect;
export type NewMasterJobRecord = typeof masterJobTable.$inferInsert;
