import { APIError, ErrCode } from "encore.dev/api";
import { constraintOf, isUniqueViolation } from "../../../lib/db/errors";
import type { SailingMasterJob } from "../interfaces/interfaces";
import { factsForMasterJob, masterJobRows, putOnRefusal } from "../lib/coLoadingMasterJob";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { userNameOf } from "../lib/userName";
import { coLoadingSailingRepository as repo } from "../repositories/coLoadingSailing.repository";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { coLoadingServiceService } from "./coLoadingService.service";
import { masterJobService } from "./masterJob.service";
import { shipmentService } from "./shipment.service";

type Actor = { userID: string; companyID: string; role: string };

/** The database's one live sailing per Master Job (schemas/coLoadingSailing.schema). */
const ONE_SAILING_PER_MASTER_JOB = "co_loading_sailing_one_master_job";

const HAS_ONE = "This sailing has a Master Job already: unlink it first.";

// A Co-Loading sailing's Master Job (Council Outlay 14, C2): one per sailing, made from the sailing
// with its shipments or linked by its MCZ number. Everything a Master Job does to its shipments -
// the fields it copies, the tracking, its containers - is the Master Job's own code; this only
// joins the two. Whoever may change a shipment's details may put it on the Master Job, as on the
// Master Jobs page; not while the service is closed.
class CoLoadingMasterJobService {
  private async sailing(id: string, companyId: string) {
    const row = await repo.get(id, companyId);
    if (!row) throw APIError.notFound("Sailing not found");
    return row;
  }

  /** The sailing's shipments that count (cancelled ones left out), with the Master Job each is in. */
  private async shipmentsOf(sailingId: string, companyId: string) {
    return (await repo.boxShipments(sailingId, companyId))
      .filter((s) => s.status !== CANCELLED_STATUS)
      .map((s) => ({ shipmentId: s.id, jobNumber: s.jobNumber, customer: s.customer, masterJobId: s.masterJobId }));
  }

  async get(id: string, companyId: string): Promise<SailingMasterJob> {
    const sailing = await this.sailing(id, companyId);
    const shipments = await this.shipmentsOf(sailing.id, companyId);
    // A Master Job deleted since leaves the sailing with none; any other failure is the request's.
    const detail = sailing.masterJobId
      ? await masterJobService.get(sailing.masterJobId, companyId).catch((err: unknown) => {
          if (err instanceof APIError && err.code === ErrCode.NotFound) return null;
          throw err;
        })
      : null;
    return {
      masterJob: detail && {
        id: detail.masterJob.id,
        mczNumber: detail.masterJob.mczNumber,
        masterBolNumber: detail.masterJob.masterBolNumber,
        vessel: detail.masterJob.vessel,
        voyage: detail.masterJob.voyage,
        containers: detail.containers.map((c) => ({ containerNumber: c.containerNumber, sealNumber: c.sealNumber, type: c.type })),
        shipmentCount: detail.shipments.length,
      },
      shipments: masterJobRows(shipments, detail ? detail.masterJob.id : null),
    };
  }

  private async open(id: string, actor: Actor) {
    const sailing = await this.sailing(id, actor.companyID);
    await coLoadingServiceService.requireOpen(sailing.serviceId, actor.companyID);
    return sailing;
  }

  /** Refuses a sailing whose Master Job is still there; one deleted since leaves it with none. */
  private async hasNone(sailing: { masterJobId: string | null }, companyId: string): Promise<void> {
    if (sailing.masterJobId && (await masterJobRepository.getByIdForCompany(sailing.masterJobId, companyId))) throw APIError.failedPrecondition(HAS_ONE);
  }

  private async checkedIds(sailingId: string, shipmentIds: string[], masterJobId: string | null, actor: Actor): Promise<string[]> {
    const ids = [...new Set(shipmentIds)];
    const refusal = putOnRefusal(ids, masterJobRows(await this.shipmentsOf(sailingId, actor.companyID), masterJobId));
    if (refusal) throw APIError.failedPrecondition(refusal);
    // Checked for all of them first, so a refusal puts none on it.
    for (const shipmentId of ids) await shipmentService.requireDetailsEditor(shipmentId, actor);
    return ids;
  }

  /**
   * "Create master job" from the sailing: a new Master Job that starts with what the ticked
   * shipments agree on (as the Master Jobs page makes one) and with the sailing's vessel, voyage,
   * departure and cut-off where it has none; the shipments are then linked to it by the Master
   * Job's own rules. It is made and becomes the sailing's Master Job under the sailing's lock
   * (repository setMasterJobJudged): of two creates at one moment the second finds the first one's
   * and makes none, so no Master Job is left orphaned - nor by a refused link, which comes after.
   */
  async create(id: string, shipmentIds: string[], actor: Actor): Promise<SailingMasterJob> {
    const sailing = await this.open(id, actor);
    await this.hasNone(sailing, actor.companyID);
    const ids = await this.checkedIds(sailing.id, shipmentIds, null, actor);
    const by = { id: actor.userID, name: await userNameOf(actor.userID) };
    const made = await repo.setMasterJobJudged(sailing.id, actor.companyID, by, (now) => this.hasNone(now, actor.companyID), () => masterJobService.create(actor.companyID, actor.userID, ids));
    if (!made) throw APIError.notFound("Sailing not found");
    const facts = factsForMasterJob(sailing, made);
    if (Object.keys(facts).length > 0) await masterJobService.update(made.id, actor.companyID, facts, actor.userID);
    await masterJobService.linkShipments(made.id, actor.companyID, ids, actor.userID);
    return this.get(sailing.id, actor.companyID);
  }

  /**
   * Links an existing Master Job to the sailing by its MCZ number. Its shipments are not touched: the
   * sailing's are put on it by hand. Under the sailing's lock; a Master Job another sailing took at
   * the same moment is refused by the database's one sailing per Master Job.
   */
  async link(id: string, mczNumber: string, actor: Actor): Promise<SailingMasterJob> {
    const sailing = await this.open(id, actor);
    await this.hasNone(sailing, actor.companyID);
    const found = await masterJobRepository.findByMczNumber(mczNumber.trim().toUpperCase(), actor.companyID);
    if (!found) throw APIError.notFound(`No Master Job with the number "${mczNumber.trim()}" was found.`);
    const taken = await repo.sailingOfMasterJob(found.id, actor.companyID);
    if (taken && taken.id !== sailing.id) throw APIError.failedPrecondition(`${found.mczNumber} is the Master Job of sailing ${[taken.vessel, taken.voyage].filter(Boolean).join(" ")} already.`);
    const by = { id: actor.userID, name: await userNameOf(actor.userID) };
    try {
      const set = await repo.setMasterJobJudged(sailing.id, actor.companyID, by, (now) => this.hasNone(now, actor.companyID), async () => found);
      if (!set) throw APIError.notFound("Sailing not found");
    } catch (err) {
      if (isUniqueViolation(err) && constraintOf(err) === ONE_SAILING_PER_MASTER_JOB) throw APIError.failedPrecondition(`${found.mczNumber} was made the Master Job of another sailing meanwhile: nothing was linked.`);
      throw err;
    }
    return this.get(sailing.id, actor.companyID);
  }

  /** Takes the Master Job off the sailing. The Master Job and its shipments stay as they are. */
  async unlink(id: string, actor: Actor): Promise<SailingMasterJob> {
    const sailing = await this.open(id, actor);
    if (!sailing.masterJobId) return this.get(sailing.id, actor.companyID);
    const was = (await masterJobRepository.mczNumbersByIds([sailing.masterJobId], actor.companyID)).get(sailing.masterJobId) ?? "";
    await repo.clearMasterJob(sailing.id, actor.companyID, was, { id: actor.userID, name: await userNameOf(actor.userID) });
    return this.get(sailing.id, actor.companyID);
  }

  /** Puts more of the sailing's shipments on its Master Job, by the Master Job's own rules, all or none checked first. */
  async putOn(id: string, shipmentIds: string[], actor: Actor): Promise<SailingMasterJob> {
    const sailing = await this.open(id, actor);
    const masterJob = sailing.masterJobId ? await masterJobRepository.getByIdForCompany(sailing.masterJobId, actor.companyID) : null;
    if (!masterJob) throw APIError.failedPrecondition("This sailing has no Master Job yet.");
    const ids = await this.checkedIds(sailing.id, shipmentIds, masterJob.id, actor);
    await masterJobService.linkShipments(masterJob.id, actor.companyID, ids, actor.userID);
    return this.get(sailing.id, actor.companyID);
  }
}

export const coLoadingMasterJobService = new CoLoadingMasterJobService();
