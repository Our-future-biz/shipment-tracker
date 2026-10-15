import { type Tx } from "../db/db";
import { consignmentRepository } from "../repositories/consignment.repository";
import { tripRepository } from "../repositories/trip.repository";
import { legRepository } from "../repositories/leg.repository";
import { haulierRepository } from "../repositories/haulier.repository";
import { truckingOutboxRepository, type TruckingOutboxInput } from "../repositories/truckingOutbox.repository";
import type { TruckingConsignmentRecord, TruckingLegRecord, TruckingTripRecord, TripJobRef } from "../schemas/truckingConsignment.schema";
import type { TruckingOutboxKind } from "../schemas/truckingOutbox.schema";
import type { CostSplitBasis, LtlTripKind, TripCapacity, TruckingSettings } from "../interfaces/interfaces";
import type { Actor } from "../../../lib/rbac";
import { splitTripCost } from "../lib/costSplit";
import { capacityOf, ltlStatus, nextStopOrder, tripFill, tripWarnings } from "../lib/ltlRules";
import { inStopOrder, ltlFactsOf, tripLeg } from "../lib/ltlView";
import { avizaceWarnings } from "../lib/avizaceRules";
import { noCosts, tripJobCosts, tripJobSourceRef } from "../lib/truckingLinks";
import type { TripLoadView } from "../lib/consignmentView";
import type { CancelExpectedInput, ExpectArrivalInput, ExpectDepartureInput } from "../lib/warehouseLink";
import { toProfile } from "./haulier.service";
import { settingsService } from "./settings.service";

// What every change of an LTL trip's legs (or its price, plates or transport order) settles in
// the same transaction, with the trip row locked: the stop order, each leg's share of the price
// (largest remainder, by the haulier's cost-split basis), one buying line per job in Costs
// Breakdown (lines of jobs no longer on the trip removed; a job billed internally gets none - its
// legs keep their shares in Trucking's own ledger, see lib/internalRules.ts), the trip announced to our warehouse
// once its transport order is out (and withdrawn for jobs that left it), and the statuses of the
// consignments. Also what the trip page and the planning board show of a trip.

type LtlActor = Pick<Actor, "userID" | "role" | "companyID">;

/** An outbox row owed by a change, sent as `actor`. */
const owe = (actor: LtlActor, job: TripJobRef, kind: TruckingOutboxKind, payload: object): TruckingOutboxInput => ({
  consignmentId: job.consignmentId,
  shipmentId: job.shipmentId,
  kind,
  payload: payload as Record<string, unknown>,
  actingUserId: actor.userID,
  actingRole: actor.role,
});

/** A Prague wall-clock time on a day as an instant. */
export function pragueInstant(date: string, time: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const wall = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(guess);
  const offset = new Date(`${wall.replace(" ", "T")}Z`).getTime() - guess.getTime();
  return new Date(guess.getTime() - offset);
}

/** When the warehouse should expect a trip: a pick-up run arrives in the afternoon, line hauls and delivery runs leave in the morning. */
const EXPECTED_TIME: Record<LtlTripKind, string> = { PICKUP_RUN: "14:00", LINEHAUL: "07:00", DELIVERY_RUN: "07:00" };

/** One job on a trip: its consignments and their legs. */
interface TripJob extends TripJobRef {
  consignments: TruckingConsignmentRecord[];
  legIds: string[];
}

function jobsOf(legs: TruckingLegRecord[], byId: Map<string, TruckingConsignmentRecord>): TripJob[] {
  const jobs = new Map<string, TripJob>();
  for (const l of legs) {
    const c = byId.get(l.consignmentId);
    if (!c) continue;
    const job = jobs.get(c.shipmentId) ?? { shipmentId: c.shipmentId, consignmentId: c.id, consignments: [], legIds: [] };
    if (!job.consignments.some((x) => x.id === c.id)) job.consignments.push(c);
    job.legIds.push(l.id);
    jobs.set(c.shipmentId, job);
  }
  return [...jobs.values()];
}

/** What the warehouse is told of one job on a trip. */
export function expectPayload(trip: TruckingTripRecord, job: { shipmentId: string; consignments: TruckingConsignmentRecord[] }): ExpectArrivalInput | ExpectDepartureInput {
  const kind = trip.kind as LtlTripKind;
  const base = {
    shipmentId: job.shipmentId,
    tripRef: trip.ref,
    tripKind: kind,
    haulierName: trip.haulierName,
    plate: trip.tractorPlate || trip.trailerPlate,
    driver: trip.driverName,
    driverPhone: trip.driverPhone,
    expectedAt: pragueInstant(trip.plannedPickupDate, EXPECTED_TIME[kind]).toISOString(),
  };
  if (kind !== "PICKUP_RUN") return base;
  const sum = (f: (c: TruckingConsignmentRecord) => number) => job.consignments.reduce((a, c) => a + f(c), 0);
  return { ...base, pieces: sum((c) => c.load.pieces), weightKg: sum((c) => c.load.weightKg), cbm: sum((c) => c.load.cbm) };
}

/** The haulier's cost-split basis (chargeable weight when it has no profile). */
async function splitBasisOf(companyId: string, haulierId: string): Promise<{ basis: CostSplitBasis; adrCapable: boolean }> {
  const [stored] = await haulierRepository.findMany(companyId, [haulierId]);
  const p = stored ? toProfile(stored) : null;
  return { basis: p?.costSplitBasis ?? "chargeable_weight", adrCapable: p?.adrCapable ?? false };
}

class LtlTrips {
  /**
   * Settles a locked LTL trip after a change (see the top of this file). `stopOrder` = the order
   * the user asked for (null = keep the order, new legs last). Returns the trip as written.
   */
  async settle(tx: Tx, actor: LtlActor, trip: TruckingTripRecord, stopOrder: string[] | null = null): Promise<TruckingTripRecord> {
    const companyId = actor.companyID;
    const [settings, { basis }] = await Promise.all([settingsService.get(companyId), splitBasisOf(companyId, trip.haulierCustomerId)]);
    const legs = await legRepository.forTrips(companyId, [trip.id], tx);
    const consignments = await consignmentRepository.findMany(companyId, [...new Set(legs.map((l) => l.consignmentId))], tx);
    const byId = new Map(consignments.map((c) => [c.id, c]));
    const live = trip.cancelledAt ? [] : legs.filter((l) => byId.get(l.consignmentId) && !byId.get(l.consignmentId)!.cancelledAt);

    const shares = trip.buy
      ? splitTripCost(
          trip.buy.totalCzk,
          live.map((l) => ({ id: l.id, chargeableKg: byId.get(l.consignmentId)!.chargeableKg, load: byId.get(l.consignmentId)!.load })),
          basis,
          settings.factors,
        )
      : new Map<string, number>();
    for (const l of live) {
      const share = shares.get(l.id) ?? null;
      if (l.costShareCzk !== share) await legRepository.update(tx, companyId, l.id, { costShareCzk: share }, { tripId: trip.id });
    }

    const jobs = jobsOf(live, byId);
    // Jobs of other departments are billed internally: their shares stay out of the job's Costs.
    const costJobs = jobs.filter((j) => !j.consignments.every((c) => c.internal));
    const tripConsignments = new Set(live.map((l) => l.consignmentId)).size;
    const owes: TruckingOutboxInput[] = [];
    const kind = trip.kind as LtlTripKind;
    const priced = !!trip.buy;
    for (const job of costJobs) {
      const shareCzk = Math.round(job.legIds.reduce((a, id) => a + (shares.get(id) ?? 0), 0) * 100) / 100;
      owes.push(
        owe(actor, job, "costs", tripJobCosts({ ...trip, kind, priced }, { shipmentId: job.shipmentId, consignments: job.consignments.length, shareCzk }, tripConsignments)),
      );
    }
    const current = (j: TripJobRef, list: TripJobRef[]) => list.some((x) => x.shipmentId === j.shipmentId);
    for (const gone of trip.costJobs.filter((j) => !current(j, costJobs))) owes.push(owe(actor, gone, "costs", noCosts(tripJobSourceRef(trip.id, gone.shipmentId))));

    // Our warehouse hears of the trip once its transport order is out.
    const announced = trip.orderSentAt && !trip.cancelledAt ? jobs : [];
    for (const job of announced) owes.push(owe(actor, job, kind === "PICKUP_RUN" ? "expect_arrival" : "expect_departure", expectPayload(trip, job)));
    for (const gone of trip.warehouseJobs.filter((j) => !current(j, announced))) {
      const payload: CancelExpectedInput = { shipmentId: gone.shipmentId, tripRef: trip.ref };
      owes.push(owe(actor, gone, "cancel_expected", payload));
    }
    await truckingOutboxRepository.enqueue(tx, companyId, owes);

    const ref = ({ shipmentId, consignmentId }: TripJobRef): TripJobRef => ({ shipmentId, consignmentId });
    const row = await tripRepository.update(
      tx,
      companyId,
      trip.id,
      {
        stopOrder: nextStopOrder(trip.stopOrder, live.map((l) => l.id), stopOrder),
        costJobs: costJobs.map(ref),
        warehouseJobs: announced.map(ref),
      },
      {},
    );
    await this.refreshStatuses(tx, companyId, [...new Set(legs.map((l) => l.consignmentId))]);
    return row ?? trip;
  }

  /** Writes the status the legs and the gate give each live LTL consignment (where it changed). */
  async refreshStatuses(tx: Tx, companyId: string, consignmentIds: string[]): Promise<void> {
    if (!consignmentIds.length) return;
    const consignments = (await consignmentRepository.findMany(companyId, consignmentIds, tx)).filter((c) => c.scope === "LTL" && !c.cancelledAt);
    const legs = await legRepository.forConsignments(companyId, consignments.map((c) => c.id), tx);
    const trips = await tripRepository.findMany(companyId, [...new Set(legs.map((l) => l.tripId).filter((x): x is string => !!x))], tx);
    const tripOf = new Map(trips.map((t) => [t.id, t]));
    for (const c of consignments) {
      const status = ltlStatus(ltlFactsOf(c, legs, tripOf));
      if (status !== c.status) await consignmentRepository.update(tx, companyId, c.id, { status }, { live: true });
    }
  }

  /** What LTL trips carry, for the trip page, the trips list and the planning board. */
  async loads(companyId: string, trips: TruckingTripRecord[], settings?: TruckingSettings): Promise<Map<string, TripLoadView & { consignments: { id: string; ref: string }[] }>> {
    const out = new Map<string, TripLoadView & { consignments: { id: string; ref: string }[] }>();
    if (!trips.length) return out;
    const s = settings ?? (await settingsService.get(companyId));
    const legs = await legRepository.forTrips(companyId, trips.map((t) => t.id));
    const consignments = await consignmentRepository.findMany(companyId, [...new Set(legs.map((l) => l.consignmentId))]);
    const byId = new Map(consignments.map((c) => [c.id, c]));
    const profiles = await haulierRepository.findMany(companyId, [...new Set(trips.map((t) => t.haulierCustomerId))]);
    const adrOf = new Map(profiles.map((p) => [p.profile.customerId, toProfile(p).adrCapable]));
    for (const t of trips) {
      const mine = inStopOrder(
        legs.filter((l) => l.tripId === t.id && byId.has(l.consignmentId)),
        t.stopOrder,
      );
      const shown = mine.map((l) => tripLeg(l, byId.get(l.consignmentId)!));
      const capacity: TripCapacity | null = capacityOf(s.vehicleTypes.find((v) => v.code === t.vehicleTypeCode) ?? null);
      const fill = tripFill(shown, capacity);
      const warnings =
        t.kind === "FTL" || t.cancelledAt
          ? []
          : tripWarnings({
              kind: t.kind,
              date: t.plannedPickupDate,
              capacity,
              fill,
              haulierName: t.haulierName,
              haulierAdrCapable: adrOf.get(t.haulierCustomerId) ?? false,
              legs: shown,
            });
      // A delivery run warns (never blocks) while a delivery on it needs an avizace not recorded.
      if (t.kind === "DELIVERY_RUN" && !t.cancelledAt) warnings.push(...avizaceWarnings([...new Set(mine.map((l) => l.consignmentId))].map((id) => byId.get(id)!)));
      const seen = new Map<string, string>();
      for (const l of shown) seen.set(l.consignmentId, l.consignmentRef);
      out.set(t.id, { legs: shown, capacity, fill, warnings, consignments: [...seen].map(([id, ref]) => ({ id, ref })) });
    }
    return out;
  }
}

export const ltlTrips = new LtlTrips();
