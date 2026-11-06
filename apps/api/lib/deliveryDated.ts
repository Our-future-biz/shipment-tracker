export const ROAD_DEPARTMENT = "Road Department";

/**
 * Whether a job is dated by its delivery rather than by arrival or departure: a Domestic job or
 * one of the Road Department (owner decision: a trucking job's DUZP is its delivery date).
 */
export function isDeliveryDated(shipment: { tradeDirection: string; department?: string | null }): boolean {
  const direction = (shipment.tradeDirection ?? "").trim().toLowerCase();
  const department = (shipment.department ?? "").trim().toLowerCase();
  return direction === "domestic" || department === ROAD_DEPARTMENT.toLowerCase();
}
