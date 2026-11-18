import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { businessDay } from "../../../lib/businessDate";
import { companyUsers, type CompanyUser } from "../../../lib/companyUsers";
import { iso } from "../../../lib/db/serialize";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import type { NudgeResult } from "../interfaces/interfaces";
import { NUDGE_FIELD, NUDGE_NOBODY, NUDGE_NOBODY_TO_TELL, nudgeNotice } from "../lib/nudge";
import { personEmail } from "../lib/shipmentEditRule";
import { shipmentNudgeRepository } from "../repositories/shipmentNudge.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { noteDueDate, noteText } from "./note.service";

// A manager's nudge (lib/nudge): a to-do on the job, and a chat line tagging its Handled By and
// Holiday Cover so it is under their bell. Managers only: the endpoint checks the role (requireRole)
// and hands the manager over as `actor`.
class NudgeService {
  /**
   * The to-do is one of the job's Notes To-Do (the same title and deadline rules), written by the
   * manager; the chat line and the history line go with it or not at all. Who is tagged is read
   * from the job as stored - when the company's users can't be read the nudge is refused, to be
   * sent again, rather than saved with nobody told. And when nobody on the job can be told at all
   * (its people are no users of the company any more, or the only one is the manager nudging) it
   * is refused too: a to-do nobody hears of is no nudge - the job is to be handed over first.
   */
  async nudge(actor: Actor, shipmentId: string, input: { text: string; dueDate: string }, now = new Date()): Promise<NudgeResult> {
    const text = noteText(input.text);
    const dueDate = noteDueDate(input.dueDate);
    if (!dueDate) throw APIError.invalidArgument("Say by when it has to be done");
    if (dueDate < businessDay(now)) throw APIError.invalidArgument("The due date has passed: choose today or a later day");
    const job = isUuid(shipmentId) ? await shipmentRepository.getByIdForCompany(shipmentId, actor.companyID) : null;
    if (!job) throw APIError.notFound("Shipment not found");
    if (!personEmail(job.personInCharge)) throw APIError.failedPrecondition(NUDGE_NOBODY);

    const users = await this.users();
    const me = users.find((u) => u.id === actor.userID);
    const notice = nudgeNotice(job, users, { text, dueDate, from: me?.displayName || me?.email || "" }, actor.userID);
    if (notice.tagged.length === 0) throw APIError.failedPrecondition(NUDGE_NOBODY_TO_TELL);
    const note = await shipmentNudgeRepository.create({
      companyId: actor.companyID,
      shipmentId,
      authorId: actor.userID,
      text,
      dueDate,
      message: notice.message,
      mentionedUserIds: notice.tagged.map((u) => u.id),
      history: { field: NUDGE_FIELD, newValue: notice.history },
    });
    if (!note) throw APIError.alreadyExists("This to-do is already open on the job");
    return {
      note: {
        id: note.id,
        shipmentId: note.shipmentId,
        text: note.text,
        details: note.details,
        dueDate: note.dueDate,
        authorName: me?.email ?? "",
        createdAt: iso(note.createdAt),
        done: false,
        doneAt: null,
        doneByName: "",
        pinned: note.pinned,
        pinnedAt: null,
      },
      told: notice.tagged.map((u) => u.email),
    };
  }

  private async users(): Promise<CompanyUser[]> {
    try {
      return await companyUsers();
    } catch (err) {
      log.warn(err, "nudge: the people to tell could not be read");
      throw APIError.unavailable("The people to tell could not be read just now - send the nudge again in a moment");
    }
  }
}

export const nudgeService = new NudgeService();
