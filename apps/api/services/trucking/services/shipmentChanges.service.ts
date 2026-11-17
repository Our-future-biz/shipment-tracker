import { APIError, ErrCode } from "encore.dev/api";
import log from "encore.dev/log";
import type { Actor } from "../../../lib/rbac";
import { consignmentPickupDecision, tripPlateDecision, type PushDecision, type ShipmentChanges } from "../../../lib/shipmentPush";
import { consignmentRepository } from "../repositories/consignment.repository";
import { tripRepository } from "../repositories/trip.repository";
import { consignmentService } from "./consignment.service";
import { tripService } from "./trip.service";

// What a person changed on a job in Shipments, taken by its consignments (lib/shipmentPush): the
// pick-up date, and the tractor plate of an FTL trip. Each change goes through Trucking's own edit
// (with its rules); a consignment that holds its own value, or may not change any more, keeps it
// and says why - the job's save in Shipments never fails because of it. Idempotent: a change
// taken already is "same" the second time.

/** A refusal of Trucking's own rules (kept, with its sentence); anything else is passed on to be retried. */
const isRefusal = (err: unknown) =>
  err instanceof APIError && [ErrCode.FailedPrecondition, ErrCode.InvalidArgument, ErrCode.AlreadyExists, ErrCode.NotFound].includes(err.code);

class ShipmentChangesService {
  async follow(actor: Actor, shipmentId: string, changes: ShipmentChanges): Promise<{ kept: string[] }> {
    const kept: string[] = [];
    const consignments = (await consignmentRepository.list(actor.companyID, { shipmentId })).filter((c) => !c.cancelledAt);
    for (const c of consignments) {
      const take = async (what: string, decision: PushDecision, apply: (to: string) => Promise<void>) => {
        if (decision.kind === "same") return;
        if (decision.kind === "skip") return void kept.push(`${c.ref} ${what}: ${decision.reason}`);
        try {
          await apply(decision.to);
        } catch (err) {
          if (!isRefusal(err)) throw err;
          kept.push(`${c.ref} ${what}: ${(err as APIError).message}`);
        }
      };
      if (changes.pickupDate) {
        await take("pick-up date", consignmentPickupDecision(c, changes.pickupDate), (to) => consignmentService.followJobPickupDate(actor, c, to));
      }
      // The plate of the truck that picks up an FTL consignment; a groupage one travels on its legs' trucks.
      if (changes.plateNumber && c.scope === "FTL" && c.tripId) {
        const trip = await tripRepository.find(actor.companyID, c.tripId);
        if (trip) await take("tractor plate", tripPlateDecision(trip, c, changes.plateNumber), (to) => tripService.followJobPlate(actor, trip, to));
      }
    }
    if (kept.length) log.info("trucking: a job's change in Shipments was not taken", { shipmentId, kept });
    return { kept };
  }
}

export const shipmentChangesService = new ShipmentChangesService();
