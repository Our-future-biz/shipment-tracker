import { APIError } from "encore.dev/api";
import type { SailingLog } from "../interfaces/interfaces";
import { checklistFor, checklistOf, SAILING_NOTE_MAX, sailingHistory, tickRefusal } from "../lib/coLoadingLog";
import { userNameOf } from "../lib/userName";
import { coLoadingLogRepository as repo } from "../repositories/coLoadingLog.repository";
import { coLoadingSailingRepository as sailingRepo } from "../repositories/coLoadingSailing.repository";
import { coLoadingSettingRepository } from "../repositories/coLoadingSetting.repository";
import { coLoadingServiceService } from "./coLoadingService.service";

// A sailing's checklist, hand-over note and history (Council Outlay 14, C5). Read by everyone; a
// tick and the note are anyone's to set, not while the service is closed. No money: a container's
// box costs stay on Earnings.
class CoLoadingLogService {
  private async sailing(id: string, companyId: string) {
    const row = await sailingRepo.get(id, companyId);
    if (!row) throw APIError.notFound("Sailing not found");
    return row;
  }

  async log(id: string, companyId: string): Promise<SailingLog> {
    const sailing = await this.sailing(id, companyId);
    const [service, setting, ticks, changes, links] = await Promise.all([
      coLoadingServiceService.get(sailing.serviceId, companyId),
      coLoadingSettingRepository.get(companyId),
      repo.ticks(sailing.id, companyId),
      repo.sailingChanges(sailing.id, companyId),
      repo.historyLinks(sailing.id, companyId),
    ]);
    return {
      checklist: checklistOf(checklistFor(setting, service.direction), ticks),
      note: sailing.note,
      noteByName: sailing.noteByName,
      noteAt: sailing.noteAt ? sailing.noteAt.toISOString() : null,
      history: sailingHistory(
        sailing,
        changes,
        links.map((l) => ({ ...l, movedTo: [l.movedToVessel, l.movedToVoyage].filter(Boolean).join(" ") })),
      ),
    };
  }

  /** Ticks or unticks a step of the sailing's checklist; the tick keeps who and when. */
  async setTick(id: string, step: string, done: boolean, actor: { userID: string; companyID: string }): Promise<SailingLog> {
    const sailing = await this.sailing(id, actor.companyID);
    await coLoadingServiceService.requireOpen(sailing.serviceId, actor.companyID);
    const now = await this.log(sailing.id, actor.companyID);
    const refusal = tickRefusal(step, done, now.checklist);
    if (refusal) throw APIError.invalidArgument(refusal);
    // By the list's own words, so "b/l received" ticks "B/L received".
    const named = now.checklist.find((i) => i.step.toLowerCase() === step.trim().toLowerCase())!.step;
    await repo.setTick(sailing.id, actor.companyID, named, done, { id: actor.userID, name: await userNameOf(actor.userID) });
    return this.log(sailing.id, actor.companyID);
  }

  /** Writes the hand-over note; "" clears it. */
  async setNote(id: string, note: string, actor: { userID: string; companyID: string }): Promise<SailingLog> {
    const text = (note ?? "").trim();
    if (text.length > SAILING_NOTE_MAX) throw APIError.invalidArgument(`Keep the note to ${SAILING_NOTE_MAX.toLocaleString("en-US")} characters.`);
    const sailing = await this.sailing(id, actor.companyID);
    await coLoadingServiceService.requireOpen(sailing.serviceId, actor.companyID);
    if (!(await repo.setNote(sailing.id, actor.companyID, text, { id: actor.userID, name: await userNameOf(actor.userID) }))) throw APIError.notFound("Sailing not found");
    return this.log(sailing.id, actor.companyID);
  }
}

export const coLoadingLogService = new CoLoadingLogService();
