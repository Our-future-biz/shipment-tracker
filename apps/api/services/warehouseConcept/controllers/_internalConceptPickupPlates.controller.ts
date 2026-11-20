import { api } from "encore.dev/api";
import { conceptPlatesService, type ConceptJobPlate } from "../services/conceptPlates.service";

interface ConceptPickupPlatesRequest {
  /** The company, as a shipment can also be read without a login (a subscription, a cron). */
  companyId: string;
  /** The shipments asked about; ids that are not uuids are left out. */
  shipmentIds: string[];
}

interface ConceptPickupPlatesResponse {
  /** Every asked shipment that has a live Concept position, with its plate ("" when the Concept has none). */
  jobs: ConceptJobPlate[];
}

/**
 * Internal API of the normal Warehouse's pick-up plates (warehouse service, pickupPlates): for the
 * jobs whose live pick-up is the Concept's (owner decision Q17), the plate the cargo left with at the
 * WH release, else the Concept pick-up's plates - not the stale normal pick-up (mock council C2).
 * READ ONLY.
 */
export const _internalConceptPickupPlates = api(
  { expose: false, auth: false, method: "POST", path: "/internal/warehouse-concept/pickup-plates" },
  async ({ companyId, shipmentIds }: ConceptPickupPlatesRequest): Promise<ConceptPickupPlatesResponse> => ({
    jobs: await conceptPlatesService.forShipments(shipmentIds, companyId),
  }),
);
