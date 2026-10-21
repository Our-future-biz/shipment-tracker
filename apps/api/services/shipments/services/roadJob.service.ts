import { APIError } from "encore.dev/api";
import { isUuid } from "../../../lib/uuid";
import { shipmentRepository } from "../repositories/shipment.repository";
import { billingStatusFor } from "../lib/roadBilling";
import { shipmentService } from "./shipment.service";
import type { RoadJobBasics, RoadJobInput } from "../interfaces/interfaces";

// What Trucking needs of Shipments: a "Road / Domestic" job made for a domestic-only order, the
// basics of its jobs, and the Billing step once every consignment of a job has its POD. Writes go
// through the shipment service, so the field rules and the audit log apply as to any write.

const MAX_IDS = 500;

class RoadJobService {
  /** A new Road Freight job (Full Load, or Consolidation for LTL) for a domestic order; the job number is the next CZ one. */
  async create(companyId: string, input: RoadJobInput): Promise<{ shipmentId: string; jobNumber: string }> {
    if (!isUuid(input.customerId)) throw APIError.invalidArgument("Unknown customer");
    const { shipment } = await shipmentService.create(companyId, {
      customerId: input.customerId,
      customer: input.customerName,
      shipper: input.shipper,
      consignee: input.consignee,
      freightMode: "Road Freight",
      tradeDirection: "Domestic",
      status: "Booking Confirmation Pending [DOM]",
      loadType: input.loadType === "Consolidation" ? "Consolidation" : "Full Load",
      department: "Road Department",
      serviceName: "Domestic",
      pickupAddress: input.pickupAddress,
      pickupSiteId: input.pickupSiteId,
      pickupPostcode: input.pickupPostcode,
      pickupCountry: input.pickupCountry,
      deliveryAddress: input.deliveryAddress,
      deliverySiteId: input.deliverySiteId,
      deliveryPostcode: input.deliveryPostcode,
      deliveryCountry: input.deliveryCountry,
      pickupDate: input.pickupDate,
      pickupTime: input.pickupTime,
      plannedDeliveryDate: input.plannedDeliveryDate ?? "",
      cargoDescription: input.cargoDescription,
      customerReference: input.customerReference,
      // A quote named here is linked to the job (not marked Won, its costs not copied: Trucking pushes its own).
      salesNumber: input.quoteNumber ?? "",
      createdBy: input.createdBy,
    }, undefined, { allowUnfinishedQuote: true });
    return { shipmentId: shipment.id, jobNumber: shipment.jobNumber };
  }

  /** The company's live jobs among `ids`; deleted or unknown ones are left out. */
  async basics(companyId: string, ids: string[]): Promise<RoadJobBasics[]> {
    const wanted = [...new Set((ids ?? []).filter(isUuid))];
    if (wanted.length > MAX_IDS) throw APIError.invalidArgument(`At most ${MAX_IDS} jobs at once`);
    return shipmentRepository.basicsByIds(companyId, wanted);
  }

  /**
   * Moves the job to "Billing" (every consignment has its POD) unless it is already Billing or
   * Billed, or cancelled. Answers the status the job has now and whether this call changed it.
   */
  async markBilling(companyId: string, shipmentId: string, userId: string): Promise<{ status: string; changed: boolean }> {
    const existing = isUuid(shipmentId) ? await shipmentRepository.getByIdForCompany(shipmentId, companyId) : null;
    if (!existing) throw APIError.notFound("Shipment not found");
    const next = billingStatusFor(existing.status, existing.tradeDirection);
    if (!next) return { status: existing.status, changed: false };
    const shipment = await shipmentService.update(shipmentId, companyId, { status: next }, userId);
    return { status: shipment.status, changed: true };
  }
}

export const roadJobService = new RoadJobService();
