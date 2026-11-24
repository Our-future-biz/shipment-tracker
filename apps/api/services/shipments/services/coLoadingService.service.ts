import { APIError } from "encore.dev/api";
import { isUuid } from "../../../lib/uuid";
import type { CoLoadingServiceItem, CoLoadingSettings, ServiceMoney } from "../interfaces/interfaces";
import { cleanServiceMoney, moneyOfRow, type ServiceMoneyInput } from "../lib/coLoadingServiceMoney";
import { checklistFor, cleanChecklist, isChecklistDirection } from "../lib/coLoadingLog";
import { DEFAULT_PLANNING_VOLUME_PCT, inlandWeightProblem, planningPctProblem } from "../lib/coLoadingSettings";
import { coLoadingSettingRepository } from "../repositories/coLoadingSetting.repository";
import { canManageServices, checkServiceInput, closedServiceError, servicesSeenBy, type CoLoadingServiceInput } from "../lib/coLoadingService";
import { userNameOf } from "../lib/userName";
import { coLoadingServiceRepository as repo } from "../repositories/coLoadingService.repository";
import type { CoLoadingServiceRecord } from "../schemas/coLoadingService.schema";

const toItem = (r: CoLoadingServiceRecord): CoLoadingServiceItem => ({
  id: r.id,
  name: r.name,
  serviceName: r.serviceName,
  frequency: r.frequency,
  direction: r.direction,
  mode: r.mode,
  origin: r.origin,
  destination: r.destination,
  note: r.note,
  createdByName: r.createdByName,
  createdAt: r.createdAt.toISOString(),
  closedAt: r.closedAt?.toISOString() ?? null,
  closedByName: r.closedByName,
  inlandWeightKg: r.inlandWeightKg,
});

// Co-Loading Concept's services: listed as the module's tiles, made with New Service, closed and
// reopened by managers (the controller lets only them do it). A closed service's tile is hidden from
// users; it stays in the app and is open again once reopened.
class CoLoadingServiceService {
  /** The company's services. Every one is made by a manager with New Service; none is made by the app. */
  async list(companyId: string, role: string): Promise<CoLoadingServiceItem[]> {
    return servicesSeenBy(await repo.list(companyId), role).map(toItem);
  }

  // A closed service still opens from a link anyone has, saying it is closed: it stays in the app.
  async get(id: string, companyId: string): Promise<CoLoadingServiceItem> {
    return toItem(await this.row(id, companyId));
  }

  private async row(id: string, companyId: string): Promise<CoLoadingServiceRecord> {
    const row = isUuid(id) ? await repo.get(id, companyId) : null;
    if (!row) throw APIError.notFound("Service not found");
    return row;
  }

  /** The share of a box's inside volume the company plans with, in whole percent. */
  async planningVolumePct(companyId: string): Promise<number> {
    return (await coLoadingSettingRepository.get(companyId))?.planningVolumePct ?? DEFAULT_PLANNING_VOLUME_PCT;
  }

  /** The company's settings: read by everyone, changed by managers. */
  async settings(companyId: string, role: string): Promise<CoLoadingSettings> {
    const row = await coLoadingSettingRepository.get(companyId);
    return {
      planningVolumePct: row?.planningVolumePct ?? DEFAULT_PLANNING_VOLUME_PCT,
      // A row made only to keep a checklist still plans with the starting figure.
      changed: row !== null && row.planningVolumePct !== DEFAULT_PLANNING_VOLUME_PCT,
      canEdit: canManageServices(role),
      checklistImport: checklistFor(row, "import"),
      checklistExport: checklistFor(row, "export"),
    };
  }

  /** A manager sets the steps of the sailings' checklist, for import or for export services (Council Outlay 14, C5, D12). */
  async saveChecklist(direction: string, steps: string[], actor: { userID: string; companyID: string; role: string }): Promise<CoLoadingSettings> {
    if (!isChecklistDirection(direction)) throw APIError.invalidArgument("Say whether the checklist is for import or for export.");
    const cleaned = cleanChecklist(steps);
    if ("error" in cleaned) throw APIError.invalidArgument(cleaned.error);
    await coLoadingSettingRepository.saveChecklist(actor.companyID, direction, cleaned.steps, actor.userID, await this.planningVolumePct(actor.companyID));
    return this.settings(actor.companyID, actor.role);
  }

  async saveSettings(planningVolumePct: number, actor: { userID: string; companyID: string; role: string }): Promise<CoLoadingSettings> {
    const problem = planningPctProblem(planningVolumePct);
    if (problem) throw APIError.invalidArgument(problem);
    await coLoadingSettingRepository.savePlanningPct(actor.companyID, planningVolumePct, actor.userID);
    return this.settings(actor.companyID, actor.role);
  }

  /** The service's money settings, for managers (the controller lets only them ask). */
  async money(id: string, companyId: string): Promise<ServiceMoney> {
    return moneyOfRow(await this.row(id, companyId));
  }

  /** A manager sets the box costs a new sailing starts with and the minimum earning per W/M. Sailings that exist keep their own box costs. */
  async saveMoney(id: string, input: ServiceMoneyInput, companyId: string): Promise<ServiceMoney> {
    const cleaned = cleanServiceMoney(input);
    if ("error" in cleaned) throw APIError.invalidArgument(cleaned.error);
    await this.row(id, companyId);
    const row = await repo.setMoney(id, companyId, cleaned.money);
    if (!row) throw APIError.notFound("Service not found");
    return moneyOfRow(row);
  }

  /** Sets a lower cargo weight for the service's inland leg, or takes it off (null). Not while the service is closed. */
  async setInlandWeight(id: string, inlandWeightKg: number | null, companyId: string): Promise<CoLoadingServiceItem> {
    const problem = inlandWeightProblem(inlandWeightKg);
    if (problem) throw APIError.invalidArgument(problem);
    await this.requireOpen(id, companyId);
    const row = await repo.setInlandWeight(id, companyId, inlandWeightKg);
    if (!row) throw APIError.notFound("Service not found");
    return toItem(row);
  }

  /** Closes the service: its tile is hidden from users, nothing new goes in until it is reopened. */
  async close(id: string, actor: { userID: string; companyID: string }): Promise<CoLoadingServiceItem> {
    const row = await this.row(id, actor.companyID);
    // Closing a closed one again keeps who closed it first and when.
    if (row.closedAt) return toItem(row);
    const closed = await repo.setClosed(id, actor.companyID, { id: actor.userID, name: await userNameOf(actor.userID) });
    if (!closed) throw APIError.notFound("Service not found");
    return toItem(closed);
  }

  /** Reopens the service: its tile is back for everyone and it takes new data again. */
  async reopen(id: string, companyId: string): Promise<CoLoadingServiceItem> {
    const row = await this.row(id, companyId);
    if (!row.closedAt) return toItem(row);
    const open = await repo.setClosed(id, companyId, null);
    if (!open) throw APIError.notFound("Service not found");
    return toItem(open);
  }

  /**
   * The service, open: what every write of a service's data (its shipments, once they come in from the
   * Shipments module) calls first. A closed one is refused until a manager reopens it.
   */
  async requireOpen(id: string, companyId: string): Promise<CoLoadingServiceRecord> {
    const row = await this.row(id, companyId);
    const closed = closedServiceError(row);
    if (closed) throw APIError.failedPrecondition(closed);
    return row;
  }

  async create(input: CoLoadingServiceInput, actor: { userID: string; companyID: string }): Promise<CoLoadingServiceItem> {
    const checked = checkServiceInput(input);
    if ("error" in checked) throw APIError.invalidArgument(checked.error);
    const row = await repo.create({
      companyId: actor.companyID,
      ...checked.values,
      createdById: actor.userID,
      createdByName: await userNameOf(actor.userID),
    });
    if (!row) {
      // The name is taken: by a closed service, which a manager can reopen instead, or an open one.
      const taken = await repo.byName(checked.values.name, actor.companyID);
      throw APIError.alreadyExists(
        taken?.closedAt
          ? `There is a closed service called "${taken.name}" already. Reopen it instead.`
          : `There is a service called "${checked.values.name}" already.`,
      );
    }
    return toItem(row);
  }
}

export const coLoadingServiceService = new CoLoadingServiceService();
