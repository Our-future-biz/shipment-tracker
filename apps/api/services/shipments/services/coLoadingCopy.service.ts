import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { isUuid } from "../../../lib/uuid";
import type { SailingCopyResult, SailingShipmentFacts } from "../interfaces/interfaces";
import { LINK_AT_ONCE_MAX, shipmentFactsDiff, type CopiedField } from "../lib/coLoadingSailing";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { coLoadingSailingRepository as repo } from "../repositories/coLoadingSailing.repository";
import { coLoadingServiceService } from "./coLoadingService.service";
import { shipmentService } from "./shipment.service";

// A sailing's facts on its shipments (Council Outlay 14, A3): what differs between a sailing and the
// shipments in its box, and "Copy to linked shipments" - the vessel, the voyage, the departure as
// ETD and the cut-off as Closing Date written to the shipments picked, by hand, after a preview.
// Each shipment is written through its own update, so its rules hold (who may change its details,
// its locks, its history): one that refuses is named, and the others are still written.
class CoLoadingCopyService {
  private async sailingOf(id: string, companyId: string) {
    const sailing = isUuid(id) ? await repo.get(id, companyId) : null;
    if (!sailing) throw APIError.notFound("Sailing not found");
    return sailing;
  }

  /** Every linked shipment beside the sailing's facts. Read by everyone. */
  async facts(sailingId: string, companyId: string): Promise<SailingShipmentFacts[]> {
    const sailing = await this.sailingOf(sailingId, companyId);
    return (await repo.shipmentFacts(sailing.id, companyId)).map((s) => ({ shipmentId: s.id, jobNumber: s.jobNumber, ...shipmentFactsDiff(sailing, s, CANCELLED_STATUS) }));
  }

  /**
   * Writes the sailing's facts to the shipments picked. Judged again on each shipment as it is now:
   * one that is skipped, or already agrees, is left alone. Not while the service is closed.
   */
  async copy(sailingId: string, shipmentIds: string[], actor: { userID: string; companyID: string; role: string }): Promise<SailingCopyResult> {
    const ids = new Set(shipmentIds);
    if (ids.size === 0) throw APIError.invalidArgument("Pick the shipments to copy to.");
    if (ids.size > LINK_AT_ONCE_MAX) throw APIError.invalidArgument(`At most ${LINK_AT_ONCE_MAX} shipments at once.`);
    const sailing = await this.sailingOf(sailingId, actor.companyID);
    await coLoadingServiceService.requireOpen(sailing.serviceId, actor.companyID);
    const linked = (await repo.shipmentFacts(sailing.id, actor.companyID)).filter((s) => ids.has(s.id));
    const result: SailingCopyResult = { copied: 0, refused: [] };
    for (const s of linked) {
      const diff = shipmentFactsDiff(sailing, s, CANCELLED_STATUS);
      if (diff.skipped || diff.changes.length === 0) continue;
      const data: Partial<Record<CopiedField, string>> = Object.fromEntries(diff.changes.map((c) => [c.field, c.next]));
      try {
        await shipmentService.update(s.id, actor.companyID, data, actor.userID, actor.role);
        result.copied += 1;
      } catch (err) {
        // Its own rules refused it (not its Person in Charge, a locked field): named, and the rest go on.
        const reason = err instanceof APIError ? err.message : "It could not be saved.";
        if (!(err instanceof APIError)) log.warn(err, "Co-Loading copy to shipment failed", { shipmentId: s.id });
        result.refused.push({ jobNumber: s.jobNumber, reason });
      }
    }
    return result;
  }
}

export const coLoadingCopyService = new CoLoadingCopyService();
