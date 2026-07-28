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
    estimatedDeparture: date("estimated_departure", { mode: "string" }),
    estimatedArrival: date("estimated_arrival", { mode: "string" }),
    actualDeparture: date("actual_departure", { mode: "string" }),
    actualArrival: date("actual_arrival", { mode: "string" }),
    tradeDirection: text("trade_direction").notNull().default(""),
    agent: text("agent").notNull().default(""),
    incotermOrigin: text("incoterm_origin").notNull().default(""),
    incotermDestination: text("incoterm_destination").notNull().default(""),
    commercialInvoiceValue: numeric("commercial_invoice_value", { precision: 14, scale: 2 }),
    status: text("status").notNull().default("active"),
    customsStatus: text("customs_status").notNull().default(""),
    masterJobId: uuid("master_job_id"),

    // — Meta —
    shipmentsDate: text("shipments_date").notNull().default(""),
    department: text("department").notNull().default(""),
    personInCharge: text("person_in_charge").notNull().default(""),
    holidayCover: text("holiday_cover").notNull().default(""),

    // — Customer —
    // Links the party fields to CRM customers (crm/customers service). Cross-database,
    // so these are plain uuids (no FK reference).
    customerId: uuid("customer_id"),
    shipperId: uuid("shipper_id"),
    consigneeId: uuid("consignee_id"),
    customer: text("customer").notNull().default(""),
    customerPic: text("customer_pic").notNull().default(""),
    customerReference: text("customer_reference").notNull().default(""),

    // — Commercial Parties —
    pickupAddress: text("pickup_address").notNull().default(""),
    deliveryAddress: text("delivery_address").notNull().default(""),
    shipperContact: text("shipper_contact").notNull().default(""),
    consigneeContact: text("consignee_contact").notNull().default(""),
    shipperOpeningFrom: text("shipper_opening_from").notNull().default(""),
    shipperOpeningTo: text("shipper_opening_to").notNull().default(""),
    consigneeOpeningFrom: text("consignee_opening_from").notNull().default(""),
    consigneeOpeningTo: text("consignee_opening_to").notNull().default(""),

    // — Status / mode —
    freeComments: text("free_comments").notNull().default(""),
    freightMode: text("freight_mode").notNull().default(""),

    // — Agent —
    agentPic: text("agent_pic").notNull().default(""),
    serviceType: text("service_type").notNull().default(""),

    // — Insurance —
    insurance: text("insurance").notNull().default(""),

    // — Dates (ISO YYYY-MM-DD) —
    cargoReadinessDate: date("cargo_readiness_date", { mode: "string" }),
    pickupDate: date("pickup_date", { mode: "string" }),
    pickupTime: text("pickup_time").notNull().default(""),
    closingDate: date("closing_date", { mode: "string" }),
    etaWarehouse: date("eta_warehouse", { mode: "string" }),
    plannedDeliveryDate: date("planned_delivery_date", { mode: "string" }),
    plannedDeliveryTime: text("planned_delivery_time").notNull().default(""),

    // — Commercial —
    commercialInvoice: text("commercial_invoice").notNull().default(""),
    creditCheck: text("credit_check").notNull().default(""),
    approvedBy: text("approved_by").notNull().default(""),
    bookingConfirmation: text("booking_confirmation").notNull().default(""),
    customsProcedure: text("customs_procedure").notNull().default(""),
    equipmentDelivery: text("equipment_delivery").notNull().default(""),
    supplierPic: text("supplier_pic").notNull().default(""),

    // — Compliance —
    vgm: text("vgm").notNull().default(""),
    shippingInstructions: text("shipping_instructions").notNull().default(""),
    ams: text("ams").notNull().default(""),
    isf: text("isf").notNull().default(""),
    bolDraft: text("bol_draft").notNull().default(""),

    // — Switch BoL —
    switchBol: text("switch_bol").notNull().default(""),
    switchBolApprovedBy: text("switch_bol_approved_by").notNull().default(""),
    switchBolNumber: text("switch_bol_number").notNull().default(""),

    // — Containers (4 sets) —
    containerCount1: text("container_count_1").notNull().default(""),
    containerLength1: text("container_length_1").notNull().default(""),
    containerType1: text("container_type_1").notNull().default(""),
    containerCount2: text("container_count_2").notNull().default(""),
    containerLength2: text("container_length_2").notNull().default(""),
    containerType2: text("container_type_2").notNull().default(""),
    containerCount3: text("container_count_3").notNull().default(""),
    containerLength3: text("container_length_3").notNull().default(""),
    containerType3: text("container_type_3").notNull().default(""),
    containerCount4: text("container_count_4").notNull().default(""),
    containerLength4: text("container_length_4").notNull().default(""),
    containerType4: text("container_type_4").notNull().default(""),

    // — Dimensions (variable-length array, stays JSONB) —
    dimensions: jsonb("dimensions"),

    // — Quote —
    salesNumber: text("sales_number").notNull().default(""),
    selling: text("selling").notNull().default(""),
    buying: text("buying").notNull().default(""),
    quoteValidity: text("quote_validity").notNull().default(""),
    validityStatus: text("validity_status").notNull().default(""),
    salesPerson: text("sales_person").notNull().default(""),

    // — Other —
    claim: text("claim").notNull().default(""),
    createdBy: text("created_by").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("shipment", table),
    index("shipment_job_number_idx").on(table.jobNumber),
    index("shipment_customer_id_idx").on(table.customerId),
  ],
);

export type ShipmentRecord = typeof shipmentTable.$inferSelect;
export type NewShipmentRecord = typeof shipmentTable.$inferInsert;
