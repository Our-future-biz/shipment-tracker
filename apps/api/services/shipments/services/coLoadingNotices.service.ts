import { APIError } from "encore.dev/api";
import type { SailingCustomerNotices } from "../interfaces/interfaces";
import { isNoticeChannel } from "../lib/customerNotice";
import { isSailingNoticeKind, NOTICE_NOTE_MAX, noticeSubject, recordRefusal, rolledRows, sailedRows, type ToldNotice } from "../lib/coLoadingNotices";
import { stageHasLeft } from "../lib/coLoadingSailing";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { userNameOf } from "../lib/userName";
import { coLoadingLogRepository as logRepo } from "../repositories/coLoadingLog.repository";
import { coLoadingSailingRepository as sailingRepo } from "../repositories/coLoadingSailing.repository";
import { shipmentCustomerNoticeRepository as noticeRepo } from "../repositories/shipmentCustomerNotice.repository";

// A Co-Loading sailing's customer notices (Council Outlay 14, C6): which customers were told that
// their cargo sailed, or that it was rolled to a later sailing, and the recording of that for
// several shipments together. Each is the shipment's own customer notice (the record
// customerNotice.service keeps), so it stands on the shipment's Tracking tab too. For everyone; the
// app sends nothing.
class CoLoadingNoticesService {
  private async sailing(id: string, companyId: string) {
    const row = await sailingRepo.get(id, companyId);
    if (!row) throw APIError.notFound("Sailing not found");
    return row;
  }

  /** Who told these shipments' customers, as the lists read it: the name behind each notice's writer. */
  private async told(shipmentIds: string[], kind: string, companyId: string): Promise<ToldNotice[]> {
    const notices = await noticeRepo.ofKind(shipmentIds, kind, companyId);
    const names = new Map<string, string>();
    for (const id of new Set(notices.flatMap((n) => n.toldById ?? []))) names.set(id, await userNameOf(id).catch(() => ""));
    return notices.map((n) => ({ shipmentId: n.shipmentId, toldAt: n.createdAt, toldByName: n.toldById ? (names.get(n.toldById) ?? "") : "", channel: n.channel }));
  }

  async list(id: string, companyId: string): Promise<SailingCustomerNotices> {
    const sailing = await this.sailing(id, companyId);
    const links = (await logRepo.noticeLinks(sailing.id, companyId)).map((l) => ({ ...l, movedTo: [l.movedToVessel, l.movedToVoyage].filter(Boolean).join(" ") }));
    const ids = [...new Set(links.map((l) => l.shipmentId))];
    const [sailed, rolled] = await Promise.all([this.told(ids, "sailed", companyId), this.told(ids, "rolled", companyId)]);
    return {
      // Nobody is told a sailing has sailed before it has: the list opens with the stage Departed.
      hasSailed: stageHasLeft(sailing.stage),
      sailed: sailedRows(links, sailed, CANCELLED_STATUS),
      rolled: rolledRows(links, rolled, CANCELLED_STATUS),
    };
  }

  /**
   * Records that the customers of these shipments were told, one notice on each shipment, all
   * together or none. All are checked first; a shipment already told is told again without harm - the
   * latest word stands. Sailed and rolled are no kinds the Communication log takes, nor a checklist
   * tick's (lib/customerNotice): the notices are all there is to write.
   */
  async record(id: string, input: { kind: string; shipmentIds: string[]; channel: string; note?: string }, actor: { userID: string; companyID: string }): Promise<SailingCustomerNotices> {
    if (!isSailingNoticeKind(input.kind)) throw APIError.invalidArgument("Say whether the customers were told the cargo sailed, or that it was rolled.");
    if (!isNoticeChannel(input.channel)) throw APIError.invalidArgument("Say how the customers were told.");
    const note = (input.note ?? "").trim();
    if (note.length > NOTICE_NOTE_MAX) throw APIError.invalidArgument(`Keep the note to ${NOTICE_NOTE_MAX} characters.`);
    const sailing = await this.sailing(id, actor.companyID);
    const now = await this.list(sailing.id, actor.companyID);
    if (input.kind === "sailed" && !now.hasSailed) throw APIError.failedPrecondition("This sailing is not set to Departed yet: set its stage first.");
    const rows = input.kind === "sailed" ? now.sailed : now.rolled;
    const ids = [...new Set(input.shipmentIds)];
    const refusal = recordRefusal(ids, rows, input.kind);
    if (refusal) throw APIError.invalidArgument(refusal);
    const name = [sailing.vessel, sailing.voyage].filter(Boolean).join(" ");
    const kind = input.kind;
    const channel = input.channel;
    const notices = ids.map((shipmentId) => {
      const row = rows.find((r) => r.shipmentId === shipmentId)!;
      return { shipmentId, kind, channel, toldTo: row.customer.trim(), subject: noticeSubject(kind, name, row).trim(), note, toldById: actor.userID };
    });
    if (!(await noticeRepo.createForShipments(actor.companyID, notices))) throw APIError.notFound("A ticked shipment was not found: nothing was recorded. Read the list again.");
    return this.list(sailing.id, actor.companyID);
  }
}

export const coLoadingNoticesService = new CoLoadingNoticesService();
