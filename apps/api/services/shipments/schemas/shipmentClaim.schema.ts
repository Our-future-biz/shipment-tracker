import { sql } from "drizzle-orm";
import { date, numeric, pgTable, text, timestamp, uuid, index, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";
import type { AnyClaimStatus, ClaimKind } from "../interfaces/interfaces";

// Claims of a shipment. "cargo" is a claim on the shipment itself (the state the cargo
// arrived in); "cost" is a claim we raise against a supplier's invoice. A shipment can
// have several of each.
export const shipmentClaimTable = pgTable(
  "shipment_claim",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull().references(() => shipmentTable.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ClaimKind>().notNull(),

    // Claim on the shipment
    cargoState: text("cargo_state").notNull().default(""), // Damaged | Incomplete | Undamaged | Lost
    note: text("note").notNull().default(""),
    // The day the carrier or supplier was given notice. Of a cargo claim: the day the carrier was
    // notified (its "carrier notified on", step 6, D20) - the time limits count from delivery to it.
    noticeDate: date("notice_date", { mode: "string" }),

    // Claim on costs
    supplier: text("supplier").notNull().default(""),
    invoiceNumber: text("invoice_number").notNull().default(""),
    reason: text("reason").notNull().default(""),
    amount: text("amount").notNull().default(""), // disputed amount, with currency (as typed, before claimAmount)
    // The supplier invoice the claim is raised against: a supplier_invoice of the invoicing service
    // (another database, so no foreign key). An open claim holds that invoice's payment there.
    supplierInvoiceId: uuid("supplier_invoice_id"),
    // The amount claimed, of either kind (a cargo claim's "claimed amount" too, step 6).
    claimAmount: numeric("claim_amount", { precision: 14, scale: 2 }),
    claimCurrency: text("claim_currency").notNull().default(""),
    // A claim on costs: open = disputed with the supplier · accepted = the supplier agreed (a credit
    // note is expected) · rejected = the supplier refused it · withdrawn = we dropped it.
    // A cargo claim (step 6, D20): open · notified (the carrier) · with_insurer · settled · rejected
    // · withdrawn. Each kind has its own (the check below).
    status: text("status").$type<AnyClaimStatus>().notNull().default("open"),
    // When and by whom (e-mail) it was closed (cost: accepted, rejected, withdrawn; cargo: settled,
    // rejected, withdrawn); empty while open.
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: text("closed_by").notNull().default(""),

    // Claim on the shipment, step 6 (Council Outlay 11, D20): who looks after it (a user of the
    // company; their e-mail kept as they were then, as a note keeps its author), the day the insurer
    // was told, and what was settled.
    ownerUserId: uuid("owner_user_id"),
    ownerName: text("owner_name").notNull().default(""),
    insurerNotifiedOn: date("insurer_notified_on", { mode: "string" }),
    settledAmount: numeric("settled_amount", { precision: 14, scale: 2 }),
    settledCurrency: text("settled_currency").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("shipment_claim", table),
    tenantIndex("shipment_claim", table),
    index("shipment_claim_shipment_id_idx").on(table.shipmentId),
    check("shipment_claim_kind_check", sql`${table.kind} IN ('cargo', 'cost')`),
    // Each kind its own statuses (widened in step 6 for the cargo claims' life).
    check(
      "shipment_claim_status_check",
      sql`(${table.kind} = 'cost' AND ${table.status} IN ('open', 'accepted', 'rejected', 'withdrawn')) OR (${table.kind} = 'cargo' AND ${table.status} IN ('open', 'notified', 'with_insurer', 'settled', 'rejected', 'withdrawn'))`,
    ),
    // The claims of a supplier invoice, read by Accounts Payable.
    index("shipment_claim_supplier_invoice_idx")
      .on(table.companyId, table.supplierInvoiceId)
      .where(sql`supplier_invoice_id IS NOT NULL AND deleted_at IS NULL`),
  ],
);

export type ShipmentClaimRecord = typeof shipmentClaimTable.$inferSelect;
export type NewShipmentClaimRecord = typeof shipmentClaimTable.$inferInsert;
