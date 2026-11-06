import { userEmailOf } from "../../../lib/companyUsers";
import type { TrackingBellNotice } from "../interfaces/interfaces";
import { BELL_DATE_FIELDS, datesMovedNotices, notToldNotices, proposedNotices } from "../lib/trackingBell";
import { BELL_KEEP_DAYS, BELL_READ_KEEP_DAYS } from "../lib/trackingThresholds";
import { userEmails } from "../lib/userEmails";
import { trackingBellRepository } from "../repositories/trackingBell.repository";
import { shipmentService } from "./shipment.service";

const DAY_MS = 86_400_000;
const LIMIT = 200;
const SHOWN = 100;

class TrackingBellService {
  /** What the bell tells this user about the dates of their shipments, the newest first. */
  async notices(companyId: string, userId: string, now = Date.now()): Promise<TrackingBellNotice[]> {
    const email = (await userEmailOf(userId)).trim().toLowerCase();
    if (!email) return [];
    const [moved, proposed, told, names] = await Promise.all([
      trackingBellRepository.datesMoved(companyId, userId, email, BELL_DATE_FIELDS, new Date(now - BELL_KEEP_DAYS * DAY_MS), new Date(now - BELL_READ_KEEP_DAYS * DAY_MS), LIMIT),
      trackingBellRepository.proposed(companyId, userId, email, LIMIT),
      trackingBellRepository.latestToldOnOwnShipments(companyId, userId, email, LIMIT),
      userEmails(),
    ]);
    const [toldShipments, lastChange] = await Promise.all([
      trackingBellRepository.toldShipments(companyId, [...new Set(moved.map((m) => m.shipmentId))]),
      trackingBellRepository.lastChanges(companyId, told.map((t) => t.shipmentId), BELL_DATE_FIELDS),
    ]);
    return [...datesMovedNotices(moved, names, toldShipments), ...proposedNotices(proposed), ...notToldNotices(told, lastChange)]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, SHOWN);
  }

  /** The user opened the shipment's Tracking tab: what came so far is no longer new. */
  async markRead(shipmentId: string, companyId: string, userId: string): Promise<void> {
    await shipmentService.requireLive(shipmentId, companyId);
    await trackingBellRepository.markRead(companyId, userId, shipmentId);
  }
}

export const trackingBellService = new TrackingBellService();
