import log from "encore.dev/log";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { gateMovementService } from "./gateMovement.service";

// The customs follow on a clock (Council Outlay 5, gap G4): every few minutes the linked records of
// every company read their shipment's customs status, as the job's "Refresh" does for one record.
// Before this, a status cleared in Shipments stayed Pending at the gate until someone pressed
// Refresh, and the cockpit and the Positions chips counted the stale status. Each run reads at most
// FOLLOW_LIST_LIMIT records per company (the least recently read first, within a few seconds), as
// the service identity — there is no user behind a clock.

/** How often the follow runs (the cron's schedule and the local timer). */
export const CUSTOMS_FOLLOW_EVERY_MS = 5 * 60_000;

/** One run over every company with linked, open records; returns how many records changed. */
export async function followAllCompanies(): Promise<number> {
  let changed = 0;
  for (const companyId of await gateMovementRepository.companiesFollowingShipments()) {
    try {
      changed += await gateMovementService.followShipments(companyId, { asService: true });
    } catch (err) {
      // One company's failure never stops the others; the next run tries again.
      log.warn(err, "warehouse: customs follow failed for a company", { companyId });
    }
  }
  return changed;
}

let started = false;

// Encore cron jobs do not fire under `encore run`, so a timer does the same job locally (as the
// shipment outbox does). In the cloud both run; the follow only re-reads records not read lately.
export function startCustomsFollowTimer(): void {
  if (started || process.env.VITEST) return;
  started = true;
  setInterval(() => void followAllCompanies().catch((err) => log.warn(err, "warehouse: customs follow run failed")), CUSTOMS_FOLLOW_EVERY_MS).unref();
}
