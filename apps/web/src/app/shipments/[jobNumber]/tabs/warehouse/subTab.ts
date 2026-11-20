// Which sub-tab the job's Warehouse tab opens on. A link can open it on the Pick-up with
// `?tab=warehouse&sub=pickup` (the gate's "Open the job", mock council S10-5); anything else opens
// Shipment Details, as before. Pure, so it is tested without React.

/** The URL parameter of the Warehouse tab's sub-tab. */
export const WAREHOUSE_SUB_PARAM = "sub";

export type WarehouseSubTab = "details" | "pickup";

export const warehouseSubTabOf = (v: string | null | undefined): WarehouseSubTab => (v === "pickup" ? "pickup" : "details");
