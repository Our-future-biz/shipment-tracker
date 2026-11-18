import log from "encore.dev/log";
import { addDays, businessDay } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import { czHolidays } from "../lib/czHolidays";
import { truckingShipmentFacts, type OperationsFactsInput } from "../lib/operationsFacts";
import { legRepository } from "../repositories/leg.repository";
import { operationsFactsRepository } from "../repositories/operationsFacts.repository";
import { tripRepository } from "../repositories/trip.repository";
import { STALE_PENDING_MINUTES } from "./truckingOutbox.service";
import type { TruckingOperationsFacts } from "../interfaces/interfaces";

// Shipments → Managers (Council Outlay 11, step 5, D29 / D30): Trucking's facts of up to two thousand
// jobs for the operations cockpit - each job's consignments still in play with Trucking's own
// judgement of what is wrong (lib/operationsFacts.ts) and its updates waiting too long or failed.
//
// READ ONLY: nothing is sent, stamped, refreshed or marked (the Consignments list refreshes the
// departments from Shipments; this read does not). The company is the caller's; any user of the
// company may ask (the cockpit is any manager's), whatever Trucking's menu shows to whom.
//
// Each family is read on its own: one that fails is named in `notKnown` and its issues / figures are
// left out (null counts), never a 0 that isn't (D29), while the others still answer. Statements per
// call: consignments and the update counts together, then the LTL legs, the open exceptions and the
// company's holidays (one call to holidays, only when a consignment waits for its POD or for its haulier -
// "tomorrow" is the next working day), then the trips - five statements and at most one call, whatever
// the number of jobs. `issuesRead` / `updatesRead` say whether the issues and the update counts are whole.

/** The families, as the cockpit names one that could not be read. */
export const TRUCKING_FACT_PARTS = {
  consignments: "Trucking's consignments",
  trips: "Trucking's trips (haulier and pick-up issues)",
  exceptions: "Trucking's delivery exceptions",
  updates: "Trucking's updates to the jobs",
  holidays: "the company's holidays (counting only the statutory ones)",
} as const;

/** Days of company holidays read back from today, as the Consignments list reads them for "POD missing". */
const HOLIDAY_WINDOW_DAYS = 45;
/** …and ahead of today, for the next working day (a long holiday stretch included). */
const HOLIDAY_AHEAD_DAYS = 14;
/** The statuses whose haulier rules look at the next working day. */
const BEFORE_HAULIER: readonly string[] = ["BOOKED", "PLANNED", "ORDERED"];

/** Runs a read; on failure logs it, names it in `notKnown` and gives undefined. */
async function part<T>(name: string, notKnown: string[], read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch (err) {
    log.warn("trucking: operations facts part not read", { part: name, error: err instanceof Error ? err.message : String(err) });
    notKnown.push(name);
    return undefined;
  }
}

class OperationsFactsService {
  async forJobs(companyId: string, userId: string, shipmentIds: string[], now = new Date()): Promise<TruckingOperationsFacts> {
    const ids = [...new Set(shipmentIds.map((id) => id.trim().toLowerCase()))].filter(isUuid);
    if (!ids.length) return { shipments: [], notKnown: [], issuesRead: true, updatesRead: true };
    const today = businessDay(now);
    const notKnown: string[] = [];

    const [consignments, updates] = await Promise.all([
      part(TRUCKING_FACT_PARTS.consignments, notKnown, () => operationsFactsRepository.consignmentsOf(companyId, ids)),
      part(TRUCKING_FACT_PARTS.updates, notKnown, () => operationsFactsRepository.unsentCounts(companyId, ids, STALE_PENDING_MINUTES)),
    ]);

    const rows = consignments ?? [];
    const ltlIds = rows.filter((c) => c.scope === "LTL").map((c) => c.id);
    const needsHolidays = rows.some((c) => (c.deliveredAt && !c.podReceivedAt) || BEFORE_HAULIER.includes(c.status));
    const [legs, exceptions, holidays] = await Promise.all([
      ltlIds.length ? part(TRUCKING_FACT_PARTS.trips, notKnown, () => legRepository.forConsignments(companyId, ltlIds)) : Promise.resolve([]),
      consignments
        ? rows.length
          ? part(TRUCKING_FACT_PARTS.exceptions, notKnown, () => operationsFactsRepository.openExceptions(companyId, rows.map((c) => c.id)))
          : Promise.resolve([])
        : Promise.resolve(undefined),
      needsHolidays
        ? part(TRUCKING_FACT_PARTS.holidays, notKnown, () => czHolidays(companyId, addDays(today, -HOLIDAY_WINDOW_DAYS), addDays(today, HOLIDAY_AHEAD_DAYS), userId))
        : Promise.resolve([]),
    ]);

    let trips: OperationsFactsInput["trips"];
    if (legs) {
      const ltlLegs = legs.filter((l) => l.kind !== "DIRECT");
      const tripIds = [...new Set([...rows.map((c) => (c.scope === "LTL" ? null : c.tripId)), ...ltlLegs.map((l) => l.tripId)].filter((x): x is string => !!x))];
      const found = tripIds.length ? await part(TRUCKING_FACT_PARTS.trips, notKnown, () => tripRepository.findMany(companyId, tripIds)) : [];
      if (found) trips = { legs: ltlLegs, tripOf: new Map(found.map((t) => [t.id, t])) };
    }

    const shipments = truckingShipmentFacts({
      shipmentIds: ids,
      consignments,
      trips,
      exceptions,
      updates,
      clock: { today, now, holidays: holidays ?? [] },
    });
    return { shipments, notKnown, issuesRead: !!consignments && !!trips && !!exceptions, updatesRead: !!updates };
  }
}

export const operationsFactsService = new OperationsFactsService();
