/** Address of a shipment's warehouse part: Warehouse → Remeasurement / Release, with it open. */
export const remeasurementHref = (shipmentId: string) => `/warehouse?tab=remeasurement&shipment=${encodeURIComponent(shipmentId)}`;
