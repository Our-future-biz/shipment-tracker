import { APIError } from "encore.dev/api";
import { assertShipmentExists } from "../../../lib/shipmentRefs";
import { assertNotBilled } from "../lib/billedLock";
import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import { estimateCopies } from "../utils/estimateCopy.utils";
import { withLiveSuppliers } from "./invoicing.service";

// "Copy estimated costs" of the New Shipment wizard: the estimates of the shipment it copies from,
// put onto the one it has just created. Its own module, so it is tested without the whole
// invoicing service.

export const ALREADY_HAS_COSTS = "This shipment has buying costs already: another shipment's estimates are copied only onto one with none";

/**
 * Copies the estimated buying costs of `fromShipmentId` onto `shipmentId` (utils/estimateCopy), all
 * of them or none: each estimate a row of its own, in its order. Both shipments are the caller's
 * company's. Only onto a shipment with no buying row yet - a copy made twice is refused the second
 * time instead of doubling every row - and not billed. A supplier link that names no live supplier
 * any more is dropped; its name stays, typed. Answers how many rows were copied.
 */
export async function copyEstimates(companyId: string, fromShipmentId: string, shipmentId: string): Promise<number> {
  if (fromShipmentId === shipmentId) throw APIError.invalidArgument("A shipment's estimates are copied onto another shipment");
  await assertShipmentExists(shipmentId);
  await assertShipmentExists(fromShipmentId);
  await assertNotBilled(shipmentId, companyId);
  const rows = await withLiveSuppliers(estimateCopies(await invoiceCostRepository.listByShipmentId(fromShipmentId, companyId)));
  if (!(await invoiceCostRepository.addCopiedEstimates(companyId, shipmentId, rows))) throw APIError.failedPrecondition(ALREADY_HAS_COSTS);
  return rows.length;
}
