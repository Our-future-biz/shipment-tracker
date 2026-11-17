import { userEmailOf } from "../../../lib/companyUsers";
import type { CoverNotesNotice } from "../interfaces/interfaces";
import { coverNotices } from "../lib/coverBell";
import { BELL_KEEP_DAYS } from "../lib/trackingThresholds";
import { userEmails } from "../lib/userEmails";
import { coverBellRepository } from "../repositories/coverBell.repository";
import { shipmentService } from "./shipment.service";

const DAY_MS = 86_400_000;
// The changes read at most; a person is put on far fewer shipments within the bell's days.
const LIMIT = 200;

class CoverBellService {
  /** The shipments somebody else made this user cover lately, with their open to-dos (lib/coverBell). */
  async forMe(companyId: string, userId: string, now = Date.now()): Promise<CoverNotesNotice[]> {
    const email = (await userEmailOf(userId).catch(() => "")).trim().toLowerCase();
    if (!email) return [];
    const rows = await coverBellRepository.assignments(companyId, userId, email, new Date(now - BELL_KEEP_DAYS * DAY_MS), LIMIT);
    if (rows.length === 0) return [];
    const [openNotes, names] = await Promise.all([coverBellRepository.openNotes(companyId, [...new Set(rows.map((r) => r.shipmentId))]), userEmails()]);
    return coverNotices(rows, openNotes, { userId, email }, names);
  }

  /** The user opened the shipment's Notes To-Do tab: what they were made to cover so far is seen. */
  async markRead(shipmentId: string, companyId: string, userId: string): Promise<void> {
    await shipmentService.requireLive(shipmentId, companyId);
    await coverBellRepository.markRead(companyId, userId, shipmentId);
  }
}

export const coverBellService = new CoverBellService();
