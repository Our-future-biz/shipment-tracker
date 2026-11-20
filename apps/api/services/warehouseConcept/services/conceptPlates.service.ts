import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { warehouseSectionRepository } from "../repositories/warehouseSection.repository";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { conceptPlate } from "./conceptPlates";

/** A job whose live pick-up is the Concept's, with its plate ("" when the Concept has none). */
export interface ConceptJobPlate {
  shipmentId: string;
  licensePlate: string;
}

class ConceptPlatesService {
  /**
   * The shipments of `shipmentIds` that have a live Concept position (not a truck reference), the
   * same rule as the job's Warehouse tab (pickupHome), each with its plate (conceptPlate): the
   * normal Warehouse's pick-up of those jobs no longer feeds the License Plate (mock council C2).
   * Shipments with no Concept position are left out.
   */
  async forShipments(shipmentIds: string[], companyId: string): Promise<ConceptJobPlate[]> {
    const positions = await warehouseTaskRepository.listPositionsForShipments(shipmentIds, companyId);
    const ids = [...new Set(positions.map((p) => p.shipmentId).filter((id): id is string => !!id))];
    if (!ids.length) return [];
    const [sections, records] = await Promise.all([
      warehouseSectionRepository.findPickupForShipments(ids, companyId),
      gateMovementRepository.listForShipments(ids, companyId),
    ]);
    const pickupOf = new Map(sections.map((s) => [s.shipmentId, s.data]));
    return ids.map((shipmentId) => ({
      shipmentId,
      licensePlate: conceptPlate(
        pickupOf.get(shipmentId),
        records.filter((m) => m.shipmentId === shipmentId),
      ),
    }));
  }
}

export const conceptPlatesService = new ConceptPlatesService();
