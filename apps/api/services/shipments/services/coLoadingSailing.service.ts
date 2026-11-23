import { APIError } from "encore.dev/api";
import { isUuid } from "../../../lib/uuid";
import type { CoLoadingSailingItem } from "../interfaces/interfaces";
import { checkSailingInput, linkRefusal, type SailingInput } from "../lib/coLoadingSailing";
import { userNameOf } from "../lib/userName";
import { coLoadingSailingRepository as repo } from "../repositories/coLoadingSailing.repository";
import type { CoLoadingSailingRecord } from "../schemas/coLoadingSailing.schema";
import { coLoadingServiceService } from "./coLoadingService.service";

const toItem = (r: CoLoadingSailingRecord): CoLoadingSailingItem => ({
  id: r.id,
  serviceId: r.serviceId,
  vessel: r.vessel,
  voyage: r.voyage,
  pol: r.pol,
  pod: r.pod,
  hub: r.hub,
  containerType: r.containerType,
  createdByName: r.createdByName,
  createdAt: r.createdAt.toISOString(),
});

// A Co-Loading Concept service's sailings: listed on its page, made with "Create new sailing" by anyone
// in the company - not while the service is closed (requireOpen).
class CoLoadingSailingService {
  /** The service's sailings, the newest first; a closed service's too (it stays in the app). */
  async list(serviceId: string, companyId: string): Promise<CoLoadingSailingItem[]> {
    await coLoadingServiceService.get(serviceId, companyId);
    return (await repo.listByService(serviceId, companyId)).map(toItem);
  }

  /** One sailing, for its own page (Box utilization, Linked shipments, Earnings). */
  async get(id: string, companyId: string): Promise<CoLoadingSailingItem> {
    const row = isUuid(id) ? await repo.get(id, companyId) : null;
    if (!row) throw APIError.notFound("Sailing not found");
    return toItem(row);
  }

  /**
   * Links the shipments to the sailing (its box), all or none: each must be the service's own (its
   * Service Name) and on no sailing yet. Not while the service is closed.
   */
  async linkShipments(sailingId: string, shipmentIds: string[], actor: { userID: string; companyID: string }): Promise<{ linked: number }> {
    const ids = [...new Set(shipmentIds)];
    if (ids.length === 0) throw APIError.invalidArgument("Pick the shipments to link.");
    const sailing = await this.get(sailingId, actor.companyID);
    const service = await coLoadingServiceService.requireOpen(sailing.serviceId, actor.companyID);
    const found = await repo.shipmentsToLink(ids.filter(isUuid), actor.companyID);
    if (found.length !== ids.length) throw APIError.notFound("A shipment to link was not found.");
    const onSailing = new Map((await repo.sailingsOf(ids, actor.companyID)).map((l) => [l.shipmentId, { id: l.sailingId, name: [l.vessel, l.voyage].filter(Boolean).join(" ") }]));
    const refusals = found.flatMap((s) => linkRefusal({ ...s, onSailing: onSailing.get(s.id) ?? null }, service.serviceName, sailingId) ?? []);
    if (refusals.length > 0) throw APIError.failedPrecondition(refusals.join(" "));
    const linked = await repo.link(sailingId, ids, actor.companyID, { id: actor.userID, name: await userNameOf(actor.userID) });
    // Linked meanwhile by someone else: nothing is linked, and the list read again shows where.
    if (!linked) throw APIError.alreadyExists("A shipment was linked to a sailing meanwhile: nothing was linked. Try again.");
    return { linked: ids.length };
  }

  /** Takes a shipment off the sailing. Not while the service is closed. */
  async unlinkShipment(sailingId: string, shipmentId: string, companyId: string): Promise<void> {
    const sailing = await this.get(sailingId, companyId);
    await coLoadingServiceService.requireOpen(sailing.serviceId, companyId);
    if (!isUuid(shipmentId) || !(await repo.unlink(sailingId, shipmentId, companyId))) throw APIError.notFound("The shipment is not on this sailing.");
  }

  async create(serviceId: string, input: SailingInput, actor: { userID: string; companyID: string }): Promise<CoLoadingSailingItem> {
    const checked = checkSailingInput(input);
    if ("error" in checked) throw APIError.invalidArgument(checked.error);
    // A closed service takes nothing new until it is reopened.
    const service = await coLoadingServiceService.requireOpen(serviceId, actor.companyID);
    const row = await repo.create({
      companyId: actor.companyID,
      serviceId: service.id,
      ...checked.values,
      createdById: actor.userID,
      createdByName: await userNameOf(actor.userID),
    });
    return toItem(row);
  }
}

export const coLoadingSailingService = new CoLoadingSailingService();
