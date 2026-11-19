import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { isUuid } from "../../../lib/uuid";
import type { ShipmentHistoryPage } from "../interfaces/interfaces";
import { absenceCoverSaves, historyEntry, historyLimit } from "../lib/shipmentHistory";
import { shipmentHistoryRepository } from "../repositories/shipmentHistory.repository";

// A job's history for managers (Council Outlay 11, step 6): its shipment_audit rows page by page,
// the newest first, with who made each change by name and e-mail (lib/shipmentHistory). One
// statement for the page and one look-up of the people on it; a user the look-up does not find has
// left (auth's look-ups leave out removed users, and none keeps them) and is "former user"; when the
// look-up fails the page still comes, with their ids only (namesKnown false).

/** Who the users on a page are, by id: the company's users, a removed one too, and superadmins who worked on the job. */
async function whoOf(ids: readonly string[]): Promise<Map<string, { name: string; email: string }> | null> {
  if (ids.length === 0) return new Map();
  try {
    const { users } = await auth.userLookup({ ids: [...ids], orSuperadmin: true });
    return new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));
  } catch (err) {
    log.warn(err, "the people of a job's history could not be read");
    return null;
  }
}

class ShipmentHistoryService {
  async page(companyId: string, shipmentId: string, opts: { before?: string; limit?: number } = {}): Promise<ShipmentHistoryPage> {
    if (!isUuid(shipmentId) || !(await shipmentHistoryRepository.isCompanyJob(shipmentId, companyId))) throw APIError.notFound("Shipment not found");
    const before = (opts.before ?? "").trim();
    if (before && !isUuid(before)) throw APIError.invalidArgument("before must be the id of an entry of the page before");
    const limit = historyLimit(opts.limit);
    // One more than shown, so whether an older page follows is known without asking for it.
    const rows = await shipmentHistoryRepository.page(shipmentId, companyId, limit + 1, before || null);
    const shown = rows.slice(0, limit);
    const who = await whoOf([...new Set(shown.map((r) => r.userId))]);
    // The Holiday Cover job's saves are named as that job, not as the service identity it writes as (m26).
    const coverSaves = absenceCoverSaves(shown);
    return {
      entries: shown.map((r) => historyEntry(r, who, coverSaves)),
      nextBefore: rows.length > limit ? shown.at(-1)!.id : null,
      namesKnown: who !== null,
    };
  }
}

export const shipmentHistoryService = new ShipmentHistoryService();
