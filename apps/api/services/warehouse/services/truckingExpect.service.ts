import log from "encore.dev/log";
import { APIError, ErrCode } from "encore.dev/api";
import { sql } from "drizzle-orm";
import { shipments } from "~encore/clients";
import { db } from "../db/db";
import { gateMovementRepository, hasStamp, type GateMovementRow } from "../repositories/gateMovement.repository";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { warehouseSectionRepository, type Tx } from "../repositories/warehouseSection.repository";
import { dockSlotRepository } from "../repositories/warehouseRecords.repository";
import type { GateEvent, GateTransportLeg, NewGateMovementRecord } from "../schemas/gateMovement.schema";
import type { WarehouseTaskRecord } from "../schemas/warehouseTask.schema";
import { normalizeLegs } from "./gateMovement.service";
import { gateAdminService } from "./gateAdmin.service";
import { warehouseImportService } from "./warehouseImport.service";
import { settingsService } from "./settings.service";
import { userName } from "./users";
import { pragueHhmm } from "./offline";
import { pragueDate } from "./storage";
import { readPickup } from "./pickupPin";
import { slotWindow } from "./dockSlots";
import type { DockSettings } from "./settingsRules";
import { clearTripLeg, clearTripPickupRows, fillTripLeg, fromTrip, MAX_TRIP_REF, sameLeg, setTripPickupRow, tripSlotWindow } from "./tripSource";
import { isExclusionViolation } from "../../../lib/db/errors";
import { isUuid } from "../../../lib/uuid";

// Trucking's trips through our warehouse (the hub). Trucking calls these internal endpoints as the
// user who planned the trip; Warehouse keeps owning the gate: nothing here ever stamps, and a
// stamped position is never cleared or removed.
//
//   expect-arrival    the shipment's WCZ position and gate record exist (the import-from-Shipments
//                     path), the IN transport leg carries the trip's haulier / plate / driver /
//                     phone and planned gate time, and a dock slot is booked for the expected time
//                     when a dock is free then (else none, logged) — so it shows in Expected today.
//   expect-departure  the OUT leg and the shipment's pick-up row get the trip's truck, and a dock
//                     slot is booked.
//   cancel-expected   what the two set for that trip is cleared: its legs (unless their gate stamp
//                     is there), its pick-up row (unless the cargo left), its booked slots; a
//                     position made for the trip and never stamped is removed again.
// All three are idempotent per (company, shipment, trip): a per-trip lock serialises them, and a
// repeat finds the trip's position, leg, row and slot already there.

export interface ExpectArrivalInput {
  shipmentId: string;
  tripRef: string;
  tripKind: string;
  haulierName: string;
  plate: string;
  driver: string;
  driverPhone: string;
  /** ISO */
  expectedAt: string;
  pieces: number;
  weightKg: number;
  cbm: number;
}

export type ExpectDepartureInput = Omit<ExpectArrivalInput, "pieces" | "weightKg" | "cbm">;

export interface ExpectArrivalResult {
  positionId: string;
  wczRef: string;
  gateMovementId: string;
  dockSlotId: string | null;
}

/** Event on a gate record whose position was made for a trip (detail = the trip ref). */
export const CREATED_FOR_TRIP = "createdForTrip";
const MAX_FIELD = 200;

function checkTrip(shipmentId: string, tripRef: string): string {
  if (!isUuid((shipmentId ?? "").trim())) throw APIError.invalidArgument("Not a shipment id");
  const ref = (tripRef ?? "").trim();
  if (!ref) throw APIError.invalidArgument("A trip reference is required");
  if (ref.length > MAX_TRIP_REF) throw APIError.invalidArgument(`The trip reference is too long (at most ${MAX_TRIP_REF} characters)`);
  return ref;
}

function checkExpected(input: ExpectDepartureInput): { tripRef: string; at: Date } {
  const tripRef = checkTrip(input.shipmentId, input.tripRef);
  const at = new Date(input.expectedAt ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(input.expectedAt ?? "") || Number.isNaN(at.getTime())) {
    throw APIError.invalidArgument("expectedAt must be an ISO date-time");
  }
  for (const [k, v] of Object.entries({ haulierName: input.haulierName, plate: input.plate, driver: input.driver, driverPhone: input.driverPhone, tripKind: input.tripKind })) {
    if (v !== undefined && v !== null && (typeof v !== "string" || v.length > MAX_FIELD)) throw APIError.invalidArgument(`${k} must be text of at most ${MAX_FIELD} characters`);
  }
  return { tripRef, at };
}

const positive = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

// The leg the cargo moves on at this gate; the grid's carrier / plate / driver follow it.
const cargoLeg = (m: Pick<GateMovementRow, "visit">): GateTransportLeg["leg"] => (m.visit === "výdej" ? "OUT" : "IN");

class TruckingExpectService {
  // One trip of one shipment at a time (two calls of the same trip, or its cancel, never interleave).
  private async lockTrip(tx: Tx, companyId: string, shipmentId: string, tripRef: string) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`warehouse_trip:${companyId}:${shipmentId}:${tripRef}`}))`);
  }

  // The shipment's live position and gate record, made through the import-from-Shipments path when
  // missing (read from Shipments with the planning user's access). A position whose gate record is
  // archived is not made again: it is restored in the Gate Log.
  private async ensurePosition(companyId: string, by: string, shipmentId: string, tripRef: string): Promise<{ task: WarehouseTaskRecord; movementId: string }> {
    const live = await warehouseTaskRepository.findLiveForShipment(companyId, shipmentId);
    if (live) {
      const movementId = await gateMovementRepository.liveIdForTask(live.id, companyId);
      if (movementId) return { task: live, movementId };
    }
    const { shipment } = await shipments.shipmentGet({ shipmentId });
    const r = await warehouseImportService.importOne(companyId, by, shipment);
    if (!r.movementId) {
      throw APIError.failedPrecondition(`Position ${r.task.taskId} has no live gate record — restore it in the Gate Log first`);
    }
    if (r.created) {
      await gateMovementRepository.appendEvents(r.movementId, companyId, [
        { kind: CREATED_FOR_TRIP, label: `Position made for Trucking trip ${tripRef}`, at: new Date().toISOString(), by, detail: tripRef },
      ]);
    }
    return { task: r.task, movementId: r.movementId };
  }

  private async lockMovement(tx: Tx, movementId: string, companyId: string): Promise<GateMovementRow> {
    const [m] = await gateMovementRepository.lockLive(tx, [movementId], companyId);
    if (!m) throw APIError.aborted("The position's gate record changed meanwhile — try again");
    return m;
  }

  // Fills `leg` for the trip unless its gate stamp is already there (what arrived or left stays).
  // Returns the gate row changes, or null when nothing changes.
  private legPatch(m: GateMovementRow, leg: "IN" | "OUT", tripRef: string, input: ExpectDepartureInput, at: Date): Partial<NewGateMovementRecord> | null {
    if (leg === "IN" ? m.gateIn : m.gateOut || m.impRelease) return null;
    const legs = normalizeLegs(m.transportLegs);
    const next = fillTripLeg(legs, leg, tripRef, { company: input.haulierName ?? "", plate: input.plate ?? "", driver: input.driver ?? "", phone: input.driverPhone ?? "", gateTime: at.toISOString() });
    const filled = next.find((l) => l.leg === leg)!;
    if (sameLeg(legs.find((l) => l.leg === leg), filled)) return null;
    return { transportLegs: next, ...(cargoLeg(m) === leg ? { carrier: filled.company, plate: filled.plate, driver: filled.driver } : {}) };
  }

  // Books (or keeps) the trip's dock slot for the expected time: the first dock free then, within
  // the dock hours and working days (Warehouse settings). A slot of the trip already at that time
  // is kept; one at another time is moved (cancelled and booked again), unless the truck is
  // already at the dock (In progress). Null when no dock can take it — logged, never an error.
  private async bookSlot(tx: Tx, companyId: string, m: GateMovementRow, tripRef: string, direction: "IN" | "OUT", at: Date, docks: DockSettings, vehicle: string): Promise<string | null> {
    const want = tripSlotWindow(at, docks);
    const [existing] = await dockSlotRepository.liveTripSlots(tx, companyId, m.id, tripRef, direction);
    if (existing) {
      if (existing.status !== "Booked" && existing.status !== "Overdue") return existing.id;
      if ("date" in want && existing.date === want.date && existing.time === want.time) return existing.id;
      await dockSlotRepository.cancelTripSlots(tx, companyId, m.id, tripRef, `trip ${tripRef} expected at another time`, [existing.id]);
    }
    if ("reason" in want) {
      log.info("warehouse: no dock slot booked for a trip — outside the dock hours", { tripRef, movementId: m.id, direction, reason: want.reason });
      return null;
    }
    const { startsAt, endsAt } = slotWindow(want.date, want.time, want.durationMin);
    for (const dock of docks.docks) {
      if (await dockSlotRepository.findOverlap(companyId, dock, startsAt, endsAt, undefined, tx)) continue;
      try {
        // A savepoint: a booking made meanwhile on this door (the EXCLUDE constraint) only skips the door.
        const row = await tx.transaction((sp) =>
          dockSlotRepository.insertTx(sp, {
            companyId,
            movementId: m.id,
            date: want.date,
            time: want.time,
            durationMin: want.durationMin,
            startsAt,
            endsAt,
            dock,
            direction,
            reference: m.positionRef || m.gateRef,
            party: m.customer,
            vehicle: vehicle.trim().slice(0, MAX_FIELD),
            status: "Booked",
            note: `From trip ${tripRef}`,
            tripRef,
          }),
        );
        return row.id;
      } catch (err) {
        if (!isExclusionViolation(err)) throw err;
      }
    }
    log.warn("warehouse: no dock slot free for a trip — every dock is booked then", { tripRef, movementId: m.id, direction, date: want.date, time: want.time });
    return null;
  }

  async expectArrival(companyId: string, userId: string, input: ExpectArrivalInput): Promise<ExpectArrivalResult> {
    const { tripRef, at } = checkExpected(input);
    const shipmentId = input.shipmentId.trim();
    const by = await userName(userId);
    const { task, movementId } = await this.ensurePosition(companyId, by, shipmentId, tripRef);
    const { docks } = await settingsService.effective(companyId);
    const dockSlotId = await db.transaction(async (tx) => {
      await this.lockTrip(tx, companyId, shipmentId, tripRef);
      const m = await this.lockMovement(tx, movementId, companyId);
      const patch: Partial<NewGateMovementRecord> = this.legPatch(m, "IN", tripRef, input, at) ?? {};
      // The trip's cargo figures fill the gate figures only while they are blank and nothing is stamped.
      const figures: string[] = [];
      if (!hasStamp(m)) {
        if (!m.colli && positive(input.pieces)) figures.push(`pieces ${(patch.colli = Math.round(positive(input.pieces)))}`);
        if (!m.weightKg && positive(input.weightKg)) figures.push(`kg ${(patch.weightKg = Math.round(positive(input.weightKg) * 1000) / 1000)}`);
        if (!m.measureCbm && positive(input.cbm)) figures.push(`cbm ${(patch.measureCbm = Math.round(positive(input.cbm) * 1000) / 1000)}`);
      }
      if (Object.keys(patch).length) {
        const event: GateEvent = {
          kind: "expectedFromTrip",
          label: `Arrival expected from Trucking trip ${tripRef}`,
          at: new Date().toISOString(),
          by,
          detail: [input.tripKind, input.haulierName, input.plate, `${pragueDate(at)} ${pragueHhmm(at)}`, ...figures].filter((x) => x && String(x).trim()).join(" · "),
        };
        await gateMovementRepository.conditionalUpdate(m.id, companyId, { ...patch, updatedBy: by }, [event], undefined, tx);
      }
      // No slot once the truck has arrived.
      return m.gateIn ? null : this.bookSlot(tx, companyId, m, tripRef, "IN", at, docks, input.plate ?? "");
    });
    return { positionId: task.id, wczRef: task.taskId, gateMovementId: movementId, dockSlotId };
  }

  async expectDeparture(companyId: string, userId: string, input: ExpectDepartureInput): Promise<{ ok: true }> {
    const { tripRef, at } = checkExpected(input);
    const shipmentId = input.shipmentId.trim();
    const by = await userName(userId);
    const { movementId } = await this.ensurePosition(companyId, by, shipmentId, tripRef);
    const { docks } = await settingsService.effective(companyId);
    await db.transaction(async (tx) => {
      await this.lockTrip(tx, companyId, shipmentId, tripRef);
      // The pick-up lock before the gate row's, as the PIN check takes them.
      await warehouseSectionRepository.lockPickup(tx, shipmentId, companyId);
      const m = await this.lockMovement(tx, movementId, companyId);
      const gone = !!(m.gateOut || m.impRelease);
      const patch = this.legPatch(m, "OUT", tripRef, input, at);
      if (patch) {
        await gateMovementRepository.conditionalUpdate(
          m.id,
          companyId,
          { ...patch, updatedBy: by },
          [
            {
              kind: "departureFromTrip",
              label: `Departure expected on Trucking trip ${tripRef}`,
              at: new Date().toISOString(),
              by,
              detail: [input.tripKind, input.haulierName, input.plate, `${pragueDate(at)} ${pragueHhmm(at)}`].filter((x) => x && String(x).trim()).join(" · "),
            },
          ],
          undefined,
          tx,
        );
      }
      // The haulier rows the gate compares with the truck at the PIN check (Shipments → Pick-up).
      if (!gone) {
        const stored = await warehouseSectionRepository.findPickup(shipmentId, companyId, tx);
        const rows = readPickup(stored?.data).rows;
        const next = setTripPickupRow(rows, tripRef, { haulier: input.haulierName ?? "", licensePlate: input.plate ?? "", driver: input.driver ?? "" });
        if (JSON.stringify(next) !== JSON.stringify(rows)) await warehouseSectionRepository.writePickupRows(tx, shipmentId, companyId, () => next);
      }
      if (!gone) await this.bookSlot(tx, companyId, m, tripRef, "OUT", at, docks, input.plate ?? "");
    });
    return { ok: true };
  }

  async cancelExpected(companyId: string, userId: string, input: { shipmentId: string; tripRef: string }): Promise<{ ok: true }> {
    const tripRef = checkTrip(input.shipmentId, input.tripRef);
    const shipmentId = input.shipmentId.trim();
    const task = await warehouseTaskRepository.findLiveForShipment(companyId, shipmentId);
    const movementId = task ? await gateMovementRepository.liveIdForTask(task.id, companyId) : null;
    const by = await userName(userId);
    const removable = await db.transaction(async (tx) => {
      await this.lockTrip(tx, companyId, shipmentId, tripRef);
      await warehouseSectionRepository.lockPickup(tx, shipmentId, companyId);
      // The pick-up row (the cargo has not left yet).
      const m = movementId ? await this.lockMovement(tx, movementId, companyId) : null;
      const gone = !!(m && (m.gateOut || m.impRelease));
      const stored = await warehouseSectionRepository.findPickup(shipmentId, companyId, tx);
      const rows = readPickup(stored?.data).rows;
      const rowsLeft = gone ? rows : clearTripPickupRows(rows, tripRef);
      if (stored && rowsLeft.length !== rows.length) await warehouseSectionRepository.writePickupRows(tx, shipmentId, companyId, () => rowsLeft);
      if (!m) return false;

      // The legs the trip filled, unless their stamp is there; the grid's carrier / plate / driver
      // with them when they still show that leg.
      const legs = normalizeLegs(m.transportLegs);
      let next = legs;
      if (!m.gateIn) next = clearTripLeg(next, "IN", tripRef);
      if (!gone) next = clearTripLeg(next, "OUT", tripRef);
      const patch: Partial<NewGateMovementRecord> = {};
      const cleared = legs.filter((l) => !sameLeg(l, next.find((n) => n.leg === l.leg)));
      if (cleared.length) {
        patch.transportLegs = next;
        const own = cleared.find((l) => l.leg === cargoLeg(m));
        if (own && m.carrier === own.company && m.plate === own.plate && m.driver === own.driver) Object.assign(patch, { carrier: "", plate: "", driver: "" });
      }
      const slots = await dockSlotRepository.cancelTripSlots(tx, companyId, m.id, tripRef, `trip ${tripRef} cancelled`);
      if (cleared.length || slots.length || rowsLeft.length !== rows.length) {
        const what = [
          ...cleared.map((l) => `${l.leg} leg`),
          ...(rowsLeft.length !== rows.length ? ["pick-up row"] : []),
          ...(slots.length ? [`${slots.length} dock slot${slots.length === 1 ? "" : "s"}`] : []),
        ];
        await gateMovementRepository.conditionalUpdate(
          m.id,
          companyId,
          { ...patch, updatedBy: by },
          [{ kind: "tripCancelled", label: `Trucking trip ${tripRef} cancelled`, at: new Date().toISOString(), by, detail: `cleared: ${what.join(", ")}` }],
          undefined,
          tx,
        );
      }
      // A position made for this trip goes again only when nothing else holds it: no stamp, no
      // other trip's leg, pick-up row or slot.
      const madeForTrip = m.events.some((e) => e.kind === CREATED_FOR_TRIP && e.detail === tripRef);
      const otherLegs = next.some((l) => fromTrip(l));
      const otherRows = rowsLeft.some((r) => fromTrip(r));
      const otherSlots = (await dockSlotRepository.liveSlotsOtherThanTrip(tx, companyId, m.id, tripRef)).length > 0;
      return madeForTrip && !hasStamp(m) && !otherLegs && !otherRows && !otherSlots;
    });
    if (removable && task) {
      try {
        // As a plain user: removePosition refuses a position stamped meanwhile (it checks under its
        // own locks), so a stamped position is never removed here.
        await gateAdminService.removePosition(task.id, companyId, userId, "user", `Trucking trip ${tripRef} cancelled`);
      } catch (err) {
        if (!(err instanceof APIError && (err.code === ErrCode.PermissionDenied || err.code === ErrCode.NotFound))) throw err;
        log.info("warehouse: position kept after a trip cancel", { tripRef, taskId: task.id, reason: err.message });
      }
    }
    return { ok: true };
  }
}

export const truckingExpectService = new TruckingExpectService();
