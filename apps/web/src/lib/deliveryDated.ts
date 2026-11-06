// The server's rule (apps/api/lib/deliveryDated.ts), mirrored for the screens: a Domestic job or one
// of the Road Department is dated by its delivery, and is a Trucking job, whose stamps are set in
// Trucking rather than recorded on the Tracking tab.

export const ROAD_DEPARTMENT = "Road Department";

export function isDeliveryDated(shipment: { tradeDirection?: string | null; department?: string | null }): boolean {
  const direction = (shipment.tradeDirection ?? "").trim().toLowerCase();
  const department = (shipment.department ?? "").trim().toLowerCase();
  return direction === "domestic" || department === ROAD_DEPARTMENT.toLowerCase();
}
