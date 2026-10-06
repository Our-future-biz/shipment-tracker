import { pgTable, text, uuid, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// Claims of a shipment. "cargo" is a claim on the shipment itself (the state the cargo
// arrived in); "cost" is a claim we raise against a supplier's invoice. A shipment can
// have several of each.
export const shipmentClaimTable = pgTable(
  "shipment_claim",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    kind: text("kind").notNull(), // cargo | cost

    // Claim on the shipment
    cargoState: text("cargo_state").notNull().default(""), // Damaged | Incomplete | Undamaged | Lost
    note: text("note").notNull().default(""),

    // Claim on costs
    supplier: text("supplier").notNull().default(""),
    invoiceNumber: text("invoice_number").notNull().default(""),
    reason: text("reason").notNull().default(""),
    amount: text("amount").notNull().default(""), // disputed amount, with currency
  },
  (table) => [
    ...defaultTableIndexes("shipment_claim", table),
    tenantIndex("shipment_claim", table),
    index("shipment_claim_shipment_id_idx").on(table.shipmentId),
  ],
);

export type ShipmentClaimRecord = typeof shipmentClaimTable.$inferSelect;
