import { businessDay } from "../../../lib/businessDate";
import type { OpsCockpitDirection, OpsCockpitMode, ShipmentsManagersCockpit } from "../interfaces/interfaces";
import { COCKPIT_JOB_LIMIT } from "../lib/cockpitThresholds";
import { buildOpsCockpit } from "../lib/managersCockpit";
import { userEmails } from "../lib/userEmails";
import { shipmentRepository } from "../repositories/shipment.repository";
import { attentionFactsOf } from "./trackingAttention.service";

export interface OpsCockpitFilters {
  mode: OpsCockpitMode;
  direction: OpsCockpitDirection;
  /** An e-mail, "nobody", or null for everyone. */
  handledBy: string | null;
}

// Shipments → Managers: the company's active jobs, what Needs Attention knows about them and the
// company's users, judged by the pure rules of lib/managersCockpit on one `now`. It only reads,
// and asks no other service than auth for the users.
class ManagersCockpitService {
  async cockpit(companyId: string, filters: OpsCockpitFilters, now = new Date()): Promise<ShipmentsManagersCockpit> {
    const today = businessDay(now);
    const [rows, users] = await Promise.all([
      // One more than counted, so "capped" means some were left out.
      shipmentRepository.managersCockpitRows(companyId, COCKPIT_JOB_LIMIT + 1),
      userEmails(),
    ]);
    const jobs = rows.slice(0, COCKPIT_JOB_LIMIT);
    const [facts, moved] = await Promise.all([
      attentionFactsOf(jobs, companyId, today),
      shipmentRepository.dateMovedLately(companyId, jobs.map((j) => j.id)),
    ]);
    return buildOpsCockpit({
      jobs,
      facts,
      movedIds: new Set(moved),
      // userEmails gives an empty map when the users could not be read, and a company always has
      // the user asking: empty is "not known", never "nobody is a user".
      userEmails: users.size > 0 ? new Set([...users.values()].map((email) => email.trim().toLowerCase())) : null,
      capped: rows.length > COCKPIT_JOB_LIMIT,
      ...filters,
      now,
    });
  }
}

export const managersCockpitService = new ManagersCockpitService();
