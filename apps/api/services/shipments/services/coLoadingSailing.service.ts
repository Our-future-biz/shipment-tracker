import { APIError } from "encore.dev/api";
import type { CoLoadingSailingItem } from "../interfaces/interfaces";
import { checkSailingInput, type SailingInput } from "../lib/coLoadingSailing";
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
