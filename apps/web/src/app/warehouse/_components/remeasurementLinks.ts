/** Address of a shipment's warehouse part: Warehouse → Remeasurement / Release, with it open. */
export const remeasurementHref = (shipmentId: string) => `/warehouse?tab=remeasurement&shipment=${encodeURIComponent(shipmentId)}`;

/** Address of a warehouse position's Remeasurement / Release (linked to a shipment or stand-alone). */
export const positionRemeasurementHref = (taskId: string) => `/warehouse?tab=remeasurement&position=${encodeURIComponent(taskId)}`;
