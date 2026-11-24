import { isUuid } from "../../../lib/uuid";
import { shipmentRepository } from "../repositories/shipment.repository";

/**
 * The Internal Reference (job number) of the company's live shipment, as it is now - asked by the
 * Loading Planner before it saves a plan linked to a shipment, and when it opens one. Null when the
 * company has no such live shipment; an id that is no id names none, and is answered so before
 * Postgres refuses it with an error of its own.
 */
export async function shipmentJobNumberOf(shipmentId: string, companyId: string): Promise<string | null> {
  if (!isUuid(shipmentId)) return null;
  const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
  return shipment ? shipment.jobNumber : null;
}
