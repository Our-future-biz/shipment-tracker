import { APIError } from "encore.dev/api";
import { sql } from "drizzle-orm";
import { db } from "../db/db";
import { containerPositionRepository, containerRepository } from "../repositories/warehouseRecords.repository";
import { gateMovementRepository, type GateMovementRow } from "../repositories/gateMovement.repository";
import { gateExceptionRepository } from "../repositories/gateException.repository";
import { reweighRepository } from "../repositories/reweigh.repository";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import type { Tx } from "../repositories/warehouseSection.repository";
import { gateMovementTable, type GateEvent } from "../schemas/gateMovement.schema";
import {
  warehouseContainerPositionTable,
  warehouseContainerTable,
  type ContainerPositionRecord,
  type WarehouseContainerRecord,
} from "../schemas/warehouseRecords.schema";
import type { NewShipmentOutboxRecord, ShipmentOutboxRecord } from "../schemas/shipmentOutbox.schema";
import type { WarehouseReweighRecord } from "../schemas/warehouseReweigh.schema";
import type { WarehouseExceptionRecord } from "../schemas/warehouseException.schema";
import type {
  ContainerStampKind,
  ContainerTallyInput,
  WarehouseContainerHouse,
  WarehouseContainerItem,
} from "../interfaces/records.interfaces";
import { isArmed } from "./gateMovement.service";
import { containerKind, containerStatus, containerTotals, directionFits, LEGACY_LINK, strippingCompletedAt, tallyLinks, TALLY_LABEL, TALLY_OUTCOMES, type TallyResult } from "./containerRules";
import { positionLifecycle } from "./lifecycle";
import { needsReweigh, needsReweighSql } from "./reweigh";
import { acceptRecordedAt, checkRequestId, offlineDetail, pgCode, pragueHhmm } from "./offline";
import { pragueDate } from "./storage";
import { deliverDue } from "./shipmentOutbox.service";
import { isManager, userName } from "./users";
import { syncStockForMovement } from "./warehouseStockSync";

// One container, many positions (houses): the stuffing plan of an export container and the
// stripping tally of an import container, with the container's own stamps. Every action runs in
// one transaction with the container row locked first, then its positions in id order (so it
// never deadlocks with a gate stamp), and is logged on the container and on each position.
//
//   import  gate-in → (start stripping) → each house ticked received (its receipt: the received
//           date and the WCZ reference go to its shipment, as the inbound receipt does), or short
//           / not arrived with a reason → gate-out once every house is accounted for.
//   export  plan from inbound positions in the warehouse → gate-in (empty at the dock) → houses
//           stuffed → close with the seal → gate-out: every stuffed position leaves the warehouse
//           (storage clock stops; the released date and the truck plate go to its shipment);
//           planned houses not stuffed stay in the warehouse and are taken out of the plan.
//
// Floor mode (phones) may send the gate-in, start of stripping, a tally tick and a stuffed mark
// later (offline queue: `recordedAt`, `clientRequestId`); the close and the gate-out need a
// connection (the gate-out releases many positions and writes to their shipments at once).

export type ContainerOutcome = "done" | "already_done" | "done_by_someone_else";

export interface ContainerActionOptions {
  recordedAt?: string;
  clientRequestId?: string;
}

/** A short or over count found at the tally, for the client to offer the OS&D exception. */
export interface TallySuggestion {
  type: "Short" | "Over";
  pieces: number;
}

const STAMP_LABEL: Record<ContainerStampKind, string> = {
  gateIn: "Container gate-in",
  strippingStart: "Stripping started",
  close: "Stuffing closed",
  gateOut: "Container gate-out",
};
const STAMP_COLUMN = { gateIn: "gateInAt", strippingStart: "strippingStartedAt", close: "closedAt", gateOut: "gateOutAt" } as const;
export const CONTAINER_STAMP_KINDS = Object.keys(STAMP_LABEL) as ContainerStampKind[];
/** Outbox stamp names of what a container writes to the shipments of its houses. */
export const TALLY_STAMP = "tally";
export const CONTAINER_GATE_OUT_STAMP = "containerGateOut";

const MAX_HOUSES = 300;
const MAX_REASON = 500;
const MAX_NOTE = 2_000;
const MAX_PIECES = 100_000;
const MANAGERS_ONLY = "Only a manager can do this";
const t = gateMovementTable;
const ct = warehouseContainerTable;
const cp = warehouseContainerPositionTable;

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const DAY = 86_400_000;
const dayIndex = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);
const todayIso = (now = new Date()) => now.toISOString().slice(0, 10);
const ref = (m: Pick<GateMovementRow, "positionRef" | "gateRef">) => m.positionRef || m.gateRef;

function needReason(reason: string | undefined, what: string, max = MAX_REASON): string {
  const r = (reason ?? "").trim();
  if (!r) throw APIError.invalidArgument(`A reason is required to ${what}`);
  if (r.length > max) throw APIError.invalidArgument(`The reason is too long (at most ${max} characters)`);
  return r;
}

const text = (v: string | undefined, max: number, label: string) => {
  const s = (v ?? "").trim();
  if (s.length > max) throw APIError.invalidArgument(`${label} is too long (at most ${max} characters)`);
  return s;
};

/** The plain fields and derived state of a container, with its houses. */
export function containerItem(
  c: WarehouseContainerRecord,
  ctx: {
    links: ContainerPositionRecord[];
    movements: Map<string, GateMovementRow>;
    reweighs: WarehouseReweighRecord[];
    exceptions: WarehouseExceptionRecord[];
    waiting: ShipmentOutboxRecord[];
  },
  now = new Date(),
): WarehouseContainerItem {
  const { companyId: _c, deletedAt: _d, createdAt: _ca, updatedAt: _ua, gateInAt, strippingStartedAt, closedAt, gateOutAt, events, ...fields } = c;
  const daysOnYard = c.gatedIn ? Math.max(0, dayIndex(c.gatedOut || todayIso(now)) - dayIndex(c.gatedIn)) : null;
  const legacy = c.movementId ? ctx.movements.get(c.movementId) : undefined;
  const kind = containerKind(c.direction);
  const houses: WarehouseContainerHouse[] = [];
  for (const l of ctx.links) {
    const m = ctx.movements.get(l.movementId);
    if (!m) continue;
    const rw = ctx.reweighs.find((r) => r.movementId === m.id) ?? null;
    const tallied = kind === "export" || l.addedBy !== LEGACY_LINK;
    const lc = positionLifecycle(
      m,
      isArmed(m),
      tallied ? { stuffedAt: l.stuffedAt, tickedAt: l.tickedAt, tallyOutcome: l.tallyOutcome, containerGateInAt: c.gateInAt } : null,
    );
    houses.push({
      id: l.id,
      movementId: m.id,
      taskId: m.warehouseTaskId,
      positionRef: m.positionRef ?? "",
      gateRef: m.gateRef,
      customer: m.customer,
      visit: m.visit,
      operationType: m.operationType,
      pod: m.pod,
      etd: m.etd,
      pieces: m.colli,
      weightKg: m.weightKg,
      cbm: m.measureCbm,
      sequence: l.sequence,
      addedBy: l.addedBy,
      stage: lc.stage,
      stageLabel: lc.label,
      stuffedAt: iso(l.stuffedAt),
      stuffedBy: l.stuffedBy,
      tallyOutcome: l.tallyOutcome,
      tallyPieces: l.tallyPieces,
      tallyCondition: l.tallyCondition,
      tallyLocation: l.tallyLocation,
      tallyNote: l.tallyNote,
      tallyReason: l.tallyReason,
      tickedAt: iso(l.tickedAt),
      tickedBy: l.tickedBy,
      needsReweigh: needsReweigh(m),
      reweighKg: rw ? rw.weighedKg : null,
      reweighFlagged: rw ? rw.flagged : false,
      openExceptions: ctx.exceptions.filter((e) => e.movementId === m.id && e.status === "open").length,
      overridden: !!m.overridden,
      archived: !!m.deletedAt,
    });
  }
  const linkedIds = new Set(ctx.links.map((l) => l.movementId));
  return {
    ...fields,
    warehouseTaskId: legacy?.warehouseTaskId ?? null,
    positionRef: legacy?.positionRef ?? "",
    customer: legacy?.customer ?? "",
    handling: legacy?.handling ?? "",
    vgmKg: c.tareKg != null && c.cargoKg != null ? c.tareKg + c.cargoKg : null,
    daysOnYard,
    kind,
    status: containerStatus(c, ctx.links),
    gateInAt: iso(gateInAt),
    strippingStartedAt: iso(strippingStartedAt),
    strippingCompletedAt: kind === "import" ? iso(strippingCompletedAt(ctx.links)) : null,
    closedAt: iso(closedAt),
    gateOutAt: iso(gateOutAt),
    positions: houses,
    totals: containerTotals(
      c.equipment,
      houses.map((h) => ({ colli: h.pieces, weightKg: h.weightKg, measureCbm: h.cbm })),
    ),
    shipmentUpdatesWaiting: ctx.waiting.filter((o) => linkedIds.has(o.movementId) && (o.stamp === TALLY_STAMP || o.stamp === CONTAINER_GATE_OUT_STAMP)).length,
    events: Array.isArray(events) ? events : [],
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// The owed shipment update of a house.
function outboxRow(m: GateMovementRow, kind: NewShipmentOutboxRecord["kind"], stamp: string, payload: Record<string, string>, userId: string, role: string): NewShipmentOutboxRecord {
  return { companyId: m.companyId, movementId: m.id, shipmentId: m.shipmentId!, kind, stamp, payload, actingUserId: userId, actingRole: role };
}

class ContainerService {
  // ---------- read ----------

  async items(rows: WarehouseContainerRecord[], companyId: string, now = new Date()): Promise<WarehouseContainerItem[]> {
    const links = await containerPositionRepository.listForContainers(
      rows.map((c) => c.id),
      companyId,
    );
    const ids = [...new Set([...links.map((l) => l.movementId), ...rows.map((c) => c.movementId).filter((x): x is string => !!x)])];
    const [movements, reweighs, exceptions, waiting] = await Promise.all([
      gateMovementRepository.findByIdsAny(ids, companyId),
      reweighRepository.listForMovements(links.map((l) => l.movementId), companyId),
      gateExceptionRepository.listForMovements(
        links.map((l) => l.movementId),
        companyId,
      ),
      shipmentOutboxRepository.openForMovements(
        links.map((l) => l.movementId),
        companyId,
      ),
    ]);
    const byId = new Map(movements.map((m) => [m.id, m]));
    // The legacy one-position link shows only a live position (as before).
    const live = new Map(movements.filter((m) => !m.deletedAt).map((m) => [m.id, m]));
    return rows.map((c) =>
      containerItem(
        c,
        {
          links: links.filter((l) => l.containerId === c.id),
          movements: new Map([...byId].filter(([id]) => live.has(id) || links.some((l) => l.containerId === c.id && l.movementId === id))),
          reweighs,
          exceptions,
          waiting,
        },
        now,
      ),
    );
  }

  async detail(id: string, companyId: string): Promise<WarehouseContainerItem> {
    const c = await containerRepository.findById(id, companyId);
    if (!c) throw APIError.notFound("Container not found");
    return (await this.items([c], companyId))[0]!;
  }

  private async lockContainer(tx: Tx, id: string, companyId: string) {
    const c = await containerRepository.lock(tx, id, companyId);
    if (!c) throw APIError.notFound("Container not found");
    return c;
  }

  // Logs on the container and on each position, in the action's transaction.
  private async log(tx: Tx, c: WarehouseContainerRecord, companyId: string, containerEvents: GateEvent[], movementEvents: Map<string, GateEvent[]> = new Map()) {
    if (containerEvents.length) await containerRepository.conditionalUpdate(tx, c.id, companyId, {}, containerEvents);
    for (const [movementId, events] of movementEvents) {
      if (events.length) await gateMovementRepository.appendEvents(movementId, companyId, events, tx);
    }
  }

  // ---------- the plan: which positions are in the container ----------

  // Adds positions as houses. Export: inbound (příjem) positions in the warehouse (received, not
  // left, not on hold); import: outbound (výdej) positions not received yet. A position is in at
  // most one container: one in another container is refused, naming it.
  async addPositions(id: string, companyId: string, userId: string, movementIds: string[], opts: { fromRegister?: boolean } = {}) {
    const ids = [...new Set((movementIds ?? []).filter(Boolean))];
    if (!ids.length) throw APIError.invalidArgument("Pick at least one position");
    if (ids.length > MAX_HOUSES) throw APIError.invalidArgument(`At most ${MAX_HOUSES} positions at once`);
    const by = await userName(userId);
    try {
      await db.transaction(async (tx) => {
        const c = await this.lockContainer(tx, id, companyId);
        const kind = containerKind(c.direction);
        if (c.gateOutAt) throw APIError.failedPrecondition(`Container ${c.number} has gone out — nothing can be added`);
        if (c.closedAt) throw APIError.failedPrecondition(`Container ${c.number} is closed — void the close first`);
        const movements = await gateMovementRepository.lockLive(tx, ids, companyId);
        if (movements.length !== ids.length) throw APIError.invalidArgument("Position not found — it may be archived");
        const current = await containerPositionRepository.listForContainers([id], companyId, tx);
        const others = await containerPositionRepository.liveForMovements(ids, companyId, tx);
        const otherContainers = await containerRepository.findByIds(
          [...new Set(others.filter((o) => o.containerId !== id).map((o) => o.containerId))],
          companyId,
          tx,
        );
        let seq = current.reduce((a, l) => Math.max(a, l.sequence), 0);
        const rows: (typeof cp.$inferInsert)[] = [];
        const at = new Date().toISOString();
        const movementEvents = new Map<string, GateEvent[]>();
        for (const m of movements.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))) {
          if (current.some((l) => l.movementId === m.id)) continue;
          const elsewhere = others.find((o) => o.movementId === m.id && o.containerId !== id);
          if (elsewhere) {
            const n = otherContainers.find((x) => x.id === elsewhere.containerId)?.number ?? "another container";
            throw APIError.failedPrecondition(`${ref(m)} is already in container ${n} — take it out there first`);
          }
          if (!directionFits(c.direction, m.visit)) {
            throw APIError.failedPrecondition(
              kind === "export"
                ? `${ref(m)} is outgoing cargo (výdej) — an export container is stuffed with inbound (příjem) cargo`
                : `${ref(m)} is inbound cargo (příjem) — an import container holds outgoing (výdej) cargo`,
            );
          }
          if (!opts.fromRegister) {
            if (kind === "export") {
              if (!m.expReceipt) throw APIError.failedPrecondition(`${ref(m)} is not received in the warehouse yet (no WH receipt)`);
              if (m.impRelease || m.leftAt) throw APIError.failedPrecondition(`${ref(m)} has already left the warehouse`);
              if (m.status === "Refused") throw APIError.failedPrecondition(`${ref(m)} is refused`);
              const open = await gateExceptionRepository.openForMovement(tx, m.id, companyId);
              if (open.length && !m.overridden) throw APIError.failedPrecondition(`${ref(m)} is on hold — an open damage / short / over exception must be resolved first`);
            } else if (m.receivedAt || m.impRelease) {
              throw APIError.failedPrecondition(`${ref(m)} is already received — it cannot be added to a stripping tally`);
            }
          }
          rows.push({ companyId, containerId: id, movementId: m.id, taskId: m.warehouseTaskId, sequence: ++seq, addedBy: by || "—" });
          movementEvents.set(m.id, [
            {
              kind: "addedToContainer",
              label: `Added to container ${c.number} (${kind === "export" ? "stuffing plan" : "stripping tally"})`,
              at,
              by,
            },
          ]);
        }
        if (!rows.length) return;
        await containerPositionRepository.add(tx, rows);
        const refs = movements.filter((m) => movementEvents.has(m.id)).map(ref);
        await this.log(tx, c, companyId, [{ kind: "positionsAdded", label: `Added: ${refs.join(", ")}`.slice(0, 500), at, by }], movementEvents);
      });
    } catch (err) {
      if (pgCode(err) !== "23505") throw err;
      throw APIError.failedPrecondition("A position was added to another container at the same moment — reload and try again");
    }
    return this.detail(id, companyId);
  }

  // Takes a house out (any user): refused once it is stuffed (un-stuff it first) or tallied (a
  // manager voids the tally). The link is kept as history (soft delete).
  async removePosition(id: string, companyId: string, userId: string, movementId: string) {
    const by = await userName(userId);
    await db.transaction(async (tx) => {
      const c = await this.lockContainer(tx, id, companyId);
      const link = await containerPositionRepository.findInContainer(tx, id, movementId, companyId);
      if (!link) throw APIError.notFound("This position is not in the container");
      if (link.stuffedAt) throw APIError.failedPrecondition("The house is stuffed — un-stuff it first");
      if (link.tallyOutcome) throw APIError.failedPrecondition("The house is tallied — a manager can void the tally first");
      await containerPositionRepository.softRemove(tx, [link.id], companyId);
      const [m] = await gateMovementRepository.findByIdsAny([movementId], companyId);
      const at = new Date().toISOString();
      await this.log(
        tx,
        c,
        companyId,
        [{ kind: "positionRemoved", label: `Taken out: ${m ? ref(m) : movementId}`, at, by }],
        new Map([[movementId, [{ kind: "removedFromContainer", label: `Taken out of container ${c.number}`, at, by }]]]),
      );
    });
    return this.detail(id, companyId);
  }

  // The order of the houses (the stuffing order / the tally list): every house, in the new order.
  async reorder(id: string, companyId: string, userId: string, movementIds: string[]) {
    const by = await userName(userId);
    await db.transaction(async (tx) => {
      const c = await this.lockContainer(tx, id, companyId);
      const links = await containerPositionRepository.listForContainers([id], companyId, tx);
      const ids = movementIds ?? [];
      if (ids.length !== links.length || new Set(ids).size !== ids.length || !links.every((l) => ids.includes(l.movementId))) {
        throw APIError.aborted("The houses changed meanwhile — reload and try again");
      }
      for (const l of links) await containerPositionRepository.update(tx, l.id, companyId, { sequence: ids.indexOf(l.movementId) + 1 });
      await this.log(tx, c, companyId, [{ kind: "reordered", label: "Order of the houses changed", at: new Date().toISOString(), by }]);
    });
    return this.detail(id, companyId);
  }

  // ---------- container stamps ----------

  private stampBlocked(c: WarehouseContainerRecord, links: ContainerPositionRecord[], kind: ContainerStampKind): string | null {
    const kindOf = containerKind(c.direction);
    switch (kind) {
      case "gateIn":
        return c.gateInAt ? "Container gate-in already stamped" : null;
      case "strippingStart":
        if (kindOf !== "import") return "Only an import container is stripped";
        if (!c.gateInAt) return "Stamp the container gate-in first";
        return c.strippingStartedAt ? "Stripping already started" : null;
      case "close":
        if (kindOf !== "export") return "Only an export container is closed after stuffing";
        if (!c.gateInAt) return "Stamp the container gate-in first";
        if (c.closedAt) return "Stuffing already closed";
        return links.some((l) => l.stuffedAt) ? null : "Nothing is stuffed yet — mark the stuffed houses first";
      case "gateOut":
        if (c.gateOutAt) return "Container gate-out already stamped";
        if (!c.gateInAt) return "Stamp the container gate-in first";
        if (kindOf === "export") return c.closedAt ? null : "Close the stuffing with the seal first";
        {
          // Old one-position containers (migration 0017) are not tallied: their house does not hold the gate-out.
          const open = tallyLinks(links).filter((l) => !l.tallyOutcome).length;
          if (open) return `Stripping is not complete — ${open} house${open === 1 ? "" : "s"} not accounted for (tick received, or mark short / not arrived)`;
          if (!c.strippingStartedAt && !links.some((l) => l.addedBy === LEGACY_LINK)) return "Start the stripping first (and add the houses the container brings)";
        }
        return null;
    }
  }

  // Stamps the container (gate-in, start of stripping, close with the seal, gate-out). Each is set
  // once by a conditional UPDATE (of two clerks one wins) and logged. The export gate-out releases
  // every stuffed house: its storage clock stops, it is Released, and its shipment gets the
  // released date and the container's truck plate through the outbox.
  async stamp(
    id: string,
    companyId: string,
    userId: string,
    role: string,
    kind: ContainerStampKind,
    opts: ContainerActionOptions & { seal?: string; plate?: string } = {},
  ): Promise<{ container: WarehouseContainerItem; outcome: ContainerOutcome; notice: string }> {
    if (!CONTAINER_STAMP_KINDS.includes(kind)) throw APIError.invalidArgument(`Unknown container stamp "${kind}"`);
    const requestId = checkRequestId(opts.clientRequestId);
    if (opts.recordedAt && (kind === "close" || kind === "gateOut")) {
      throw APIError.failedPrecondition(`${STAMP_LABEL[kind]} needs a connection — it is checked against the houses when it is stamped`);
    }
    const seal = text(opts.seal, 50, "The seal number");
    const plate = text(opts.plate, 30, "The plate");
    if (kind === "close" && !seal) throw APIError.invalidArgument("Record the seal number to close the container");
    const by = await userName(userId);
    const now = new Date();
    const col = STAMP_COLUMN[kind];
    let at = now;
    const shipmentIds = new Set<string>();
    const result = await db.transaction(async (tx) => {
      const c = await this.lockContainer(tx, id, companyId);
      const mine = requestId ? c.events.find((e) => e.requestId === requestId) : undefined;
      if (mine) return { outcome: "already_done" as const, notice: `${STAMP_LABEL[kind]} was already sent from this phone (${pragueHhmm(new Date(mine.at))})` };
      if (c[col]) {
        if (requestId) {
          const evt = [...c.events].reverse().find((e) => e.kind === kind);
          return { outcome: "done_by_someone_else" as const, notice: `${STAMP_LABEL[kind]} was already stamped ${pragueHhmm(c[col]!)}${evt?.by ? ` by ${evt.by}` : ""}` };
        }
      }
      const links = await containerPositionRepository.listForContainers([id], companyId, tx);
      const blocked = this.stampBlocked(c, links, kind);
      if (blocked) throw APIError.failedPrecondition(blocked);
      if (kind === "gateOut" && containerKind(c.direction) === "export") {
        // Cargo put on hold after it was stuffed does not leave: checked under the positions' locks
        // (after the container's), as the stuffed mark and the WH release check it.
        const stuffed = await gateMovementRepository.lockLive(
          tx,
          links.filter((l) => l.stuffedAt).map((l) => l.movementId),
          companyId,
        );
        for (const m of stuffed) {
          if (!m.overridden && (await gateExceptionRepository.openForMovement(tx, m.id, companyId)).length) {
            throw APIError.failedPrecondition(`${ref(m)} is on hold — an open damage / short / over exception; resolve it, or un-stuff the house (a manager voids the close first)`);
          }
        }
      }
      if (opts.recordedAt) at = acceptRecordedAt(opts.recordedAt, now, kind === "strippingStart" ? { notBefore: c.gateInAt, after: "the container gate-in" } : {});
      const evt: GateEvent = {
        kind,
        label: kind === "close" ? `${STAMP_LABEL.close} — seal ${seal}` : STAMP_LABEL[kind],
        at: at.toISOString(),
        by,
        ...(opts.recordedAt ? { detail: offlineDetail(at, now) } : {}),
        ...(requestId ? { requestId } : {}),
      };
      const day = pragueDate(at);
      const set: Record<string, unknown> = { [col]: at, updatedBy: by };
      if (kind === "gateIn") set.gatedIn = sql`CASE WHEN ${ct.gatedIn} = '' THEN ${day} ELSE ${ct.gatedIn} END`;
      if (kind === "gateOut") {
        set.gatedOut = sql`CASE WHEN ${ct.gatedOut} = '' THEN ${day} ELSE ${ct.gatedOut} END`;
        if (plate) set.plate = plate;
      }
      if (kind === "close") {
        set.seal = seal;
        set.closedBy = by;
      }
      const columnSql = { gateIn: ct.gateInAt, strippingStart: ct.strippingStartedAt, close: ct.closedAt, gateOut: ct.gateOutAt }[kind];
      const row = await containerRepository.conditionalUpdate(tx, id, companyId, set, [evt], sql`${columnSql} IS NULL`);
      if (!row) throw APIError.aborted("The container changed meanwhile — reload and try again");
      if (kind === "gateOut" && containerKind(c.direction) === "export") {
        await this.releaseStuffed(tx, row, links, companyId, userId, role, by, at, shipmentIds);
      }
      return { outcome: "done" as const, notice: opts.recordedAt ? `${STAMP_LABEL[kind]} stamped ${pragueHhmm(at)} (recorded offline, sent ${pragueHhmm(now)})` : "" };
    });
    if (shipmentIds.size) await deliverDue({ shipmentIds: [...shipmentIds] });
    return { container: await this.detail(id, companyId), ...result };
  }

  // The export gate-out, in its transaction: every stuffed house leaves the warehouse; planned
  // houses not stuffed stay and are taken out of the plan.
  private async releaseStuffed(
    tx: Tx,
    c: WarehouseContainerRecord,
    links: ContainerPositionRecord[],
    companyId: string,
    userId: string,
    role: string,
    by: string,
    at: Date,
    shipmentIds: Set<string>,
  ) {
    const stuffed = links.filter((l) => l.stuffedAt);
    const notLoaded = links.filter((l) => !l.stuffedAt);
    const movements = await gateMovementRepository.lockLive(
      tx,
      stuffed.map((l) => l.movementId),
      companyId,
    );
    const date = pragueDate(at);
    const owed: NewShipmentOutboxRecord[] = [];
    const left: string[] = [];
    for (const m of movements) {
      const row = await gateMovementRepository.conditionalUpdate(
        m.id,
        companyId,
        { leftAt: at, leftContainerId: c.id, status: "Released" },
        [{ kind: "leftInContainer", label: `Left in container ${c.number}${c.seal ? ` (seal ${c.seal})` : ""}`, at: at.toISOString(), by, ...(c.plate ? { detail: `truck ${c.plate}` } : {}) }],
        sql`${t.leftAt} IS NULL AND ${t.impRelease} IS NULL`,
        tx,
      );
      if (!row) continue;
      // The stock line closes (Load) and a bonded entry is discharged, in this transaction.
      await syncStockForMovement(tx, companyId, m.id, { by, at, why: `left in container ${c.number}` });
      left.push(ref(m));
      if (m.shipmentId) {
        owed.push(outboxRow(m, "released", CONTAINER_GATE_OUT_STAMP, { warehouseReleasedDate: date, ...(c.plate ? { plateNumber: c.plate } : {}) }, userId, role));
        shipmentIds.add(m.shipmentId);
      }
    }
    await shipmentOutboxRepository.enqueue(tx, owed);
    const events: GateEvent[] = [{ kind: "positionsLeft", label: `Left the warehouse: ${left.join(", ") || "—"}`.slice(0, 500), at: at.toISOString(), by }];
    if (notLoaded.length) {
      await containerPositionRepository.softRemove(
        tx,
        notLoaded.map((l) => l.id),
        companyId,
      );
      const rest = await gateMovementRepository.findByIdsAny(
        notLoaded.map((l) => l.movementId),
        companyId,
      );
      events.push({ kind: "notLoaded", label: `Not loaded — stay in the warehouse: ${rest.map(ref).join(", ")}`.slice(0, 500), at: at.toISOString(), by });
      for (const l of notLoaded) {
        await gateMovementRepository.appendEvents(l.movementId, companyId, [{ kind: "notLoaded", label: `Not loaded in container ${c.number} — stays in the warehouse`, at: at.toISOString(), by }], tx);
      }
    }
    await containerRepository.conditionalUpdate(tx, c.id, companyId, {}, events);
  }

  // ---------- export: stuffed ----------

  // Marks a house stuffed (or back to not stuffed until the close). Needs the container gated in
  // and the cargo still in the warehouse, not on hold.
  async setStuffed(
    id: string,
    companyId: string,
    userId: string,
    movementId: string,
    stuffed: boolean,
    opts: ContainerActionOptions = {},
  ): Promise<{ container: WarehouseContainerItem; outcome: ContainerOutcome; notice: string }> {
    const requestId = checkRequestId(opts.clientRequestId);
    const by = await userName(userId);
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const c = await this.lockContainer(tx, id, companyId);
      const link = await containerPositionRepository.findInContainer(tx, id, movementId, companyId);
      if (!link) throw APIError.notFound("This position is not in the container");
      if (requestId && link.clientRequestId === requestId) return { outcome: "already_done" as const, notice: "Already sent from this phone" };
      if (containerKind(c.direction) !== "export") throw APIError.failedPrecondition("Only an export container is stuffed");
      if (c.gateOutAt) throw APIError.failedPrecondition(`Container ${c.number} has gone out`);
      if (c.closedAt) throw APIError.failedPrecondition(`Container ${c.number} is closed — a manager can void the close first`);
      if (!c.gateInAt) throw APIError.failedPrecondition("Stamp the container gate-in first (the empty container at the dock)");
      if (!!link.stuffedAt === stuffed) {
        if (requestId) {
          return {
            outcome: "done_by_someone_else" as const,
            notice: stuffed ? `Already stuffed ${pragueHhmm(link.stuffedAt!)}${link.stuffedBy ? ` by ${link.stuffedBy}` : ""}` : "Already not stuffed",
          };
        }
        throw APIError.failedPrecondition(stuffed ? "The house is already stuffed" : "The house is not stuffed");
      }
      const [m] = await gateMovementRepository.lockLive(tx, [movementId], companyId);
      if (!m) throw APIError.failedPrecondition("The position is archived");
      const at = opts.recordedAt ? acceptRecordedAt(opts.recordedAt, now, { notBefore: c.gateInAt, after: "the container gate-in" }) : now;
      if (stuffed && !directionFits(c.direction, m.visit)) {
        throw APIError.failedPrecondition(`${ref(m)} is outgoing cargo (výdej) — an export container is stuffed with inbound (příjem) cargo; take it out of this container`);
      }
      if (stuffed) {
        if (!m.expReceipt) throw APIError.failedPrecondition(`${ref(m)} is not received in the warehouse (no WH receipt)`);
        if (m.impRelease || m.leftAt) throw APIError.failedPrecondition(`${ref(m)} has already left the warehouse`);
        if (m.status === "Refused") throw APIError.failedPrecondition(`${ref(m)} is refused`);
        if (!m.overridden && (await gateExceptionRepository.openForMovement(tx, m.id, companyId)).length) {
          throw APIError.failedPrecondition(`${ref(m)} is on hold — an open damage / short / over exception must be resolved first`);
        }
      }
      const row = await containerPositionRepository.update(
        tx,
        link.id,
        companyId,
        stuffed ? { stuffedAt: at, stuffedBy: by, clientRequestId: requestId ?? null } : { stuffedAt: null, stuffedBy: "", clientRequestId: requestId ?? null },
        stuffed ? sql`${cp.stuffedAt} IS NULL` : sql`${cp.stuffedAt} IS NOT NULL`,
      );
      if (!row) throw APIError.aborted("The house changed meanwhile — reload and try again");
      // Stuffed: the stock line is Allocated to the container; un-stuffed: Available again.
      await syncStockForMovement(tx, companyId, m.id, { by, at, why: stuffed ? `stuffed in container ${c.number}` : `un-stuffed from container ${c.number}` });
      const detail = opts.recordedAt ? { detail: offlineDetail(at, now) } : {};
      const label = stuffed ? `Stuffed in container ${c.number}` : `Un-stuffed — back out of container ${c.number}`;
      await this.log(
        tx,
        c,
        companyId,
        [{ kind: stuffed ? "stuffed" : "unstuffed", label: `${stuffed ? "Stuffed" : "Un-stuffed"}: ${ref(m)}`, at: at.toISOString(), by, ...detail, ...(requestId ? { requestId } : {}) }],
        new Map([[m.id, [{ kind: stuffed ? "stuffed" : "unstuffed", label, at: at.toISOString(), by, ...detail }]]]),
      );
      return { outcome: "done" as const, notice: opts.recordedAt ? `${stuffed ? "Stuffed" : "Un-stuffed"} — recorded offline at ${pragueHhmm(at)}` : "" };
    });
    return { container: await this.detail(id, companyId), ...result };
  }

  // ---------- import: stripping tally ----------

  // Tallies one house. "received" ticks it off: the house is received (its "Received in warehouse"
  // date, which starts its free time), and its shipment gets the received date and the WCZ
  // reference through the outbox — as the inbound receipt does. LCL cargo is re-weighed first.
  // Short / not arrived need a reason; the position is not received. A count that differs from
  // the expected pieces is answered with a suggestion for the OS&D exception.
  async tally(
    id: string,
    companyId: string,
    userId: string,
    role: string,
    movementId: string,
    input: ContainerTallyInput,
    opts: ContainerActionOptions = {},
  ): Promise<{ container: WarehouseContainerItem; outcome: ContainerOutcome; notice: string; suggestException: TallySuggestion | null }> {
    const outcome = (input?.outcome ?? "").trim() as TallyResult;
    if (!(TALLY_OUTCOMES as readonly string[]).includes(outcome)) throw APIError.invalidArgument(`Outcome must be one of: ${TALLY_OUTCOMES.join(", ")}`);
    const pieces = input.pieces ?? null;
    if (pieces !== null && (!Number.isInteger(pieces) || pieces < 0 || pieces > MAX_PIECES)) throw APIError.invalidArgument("Pieces counted must be a whole number from 0");
    const condition = text(input.condition, 200, "The condition");
    const location = text(input.location, 100, "The location");
    const note = text(input.note, MAX_NOTE, "The note");
    const reason = outcome === "received" ? text(input.reason, MAX_REASON, "The reason") : needReason(input.reason, `mark the house ${TALLY_LABEL[outcome].toLowerCase()}`);
    const requestId = checkRequestId(opts.clientRequestId);
    const by = await userName(userId);
    const now = new Date();
    let delivered = false;
    let suggestException: TallySuggestion | null = null;
    const result = await db.transaction(async (tx) => {
      const c = await this.lockContainer(tx, id, companyId);
      const link = await containerPositionRepository.findInContainer(tx, id, movementId, companyId);
      if (!link) throw APIError.notFound("This position is not in the container");
      if (requestId && link.clientRequestId === requestId) return { outcome: "already_done" as const, notice: "This tally was already sent from this phone" };
      if (containerKind(c.direction) !== "import") throw APIError.failedPrecondition("Only an import container is stripped and tallied");
      if (!c.gateInAt) throw APIError.failedPrecondition("Stamp the container gate-in first — the house is tallied when the container is stripped");
      if (link.tallyOutcome) {
        const what = `already tallied (${TALLY_LABEL[link.tallyOutcome as TallyResult] ?? link.tallyOutcome}) ${link.tickedAt ? pragueHhmm(link.tickedAt) : ""}${link.tickedBy ? ` by ${link.tickedBy}` : ""}`.trim();
        if (requestId) return { outcome: "done_by_someone_else" as const, notice: `The house was ${what}` };
        throw APIError.failedPrecondition(`The house was ${what} — a manager can void the tally`);
      }
      const at = opts.recordedAt ? acceptRecordedAt(opts.recordedAt, now, { notBefore: c.gateInAt, after: "the container gate-in" }) : now;
      const [m] = await gateMovementRepository.lockLive(tx, [movementId], companyId);
      if (!m) throw APIError.failedPrecondition("The position is archived");
      // Only outgoing (výdej) houses added for the tally are tallied: an old one-position container
      // (migration 0017) may hold inbound cargo, whose receipt is the WH receipt at the gate.
      if (!directionFits(c.direction, m.visit)) {
        throw APIError.failedPrecondition(`${ref(m)} is inbound cargo (příjem) — only outgoing (výdej) cargo is tallied at the stripping; take it out of this container`);
      }
      if (link.addedBy === LEGACY_LINK) {
        throw APIError.failedPrecondition(`${ref(m)} comes from the old container register and keeps its typed received date — to tally it, take it out of the container and add it again`);
      }
      const atIso = at.toISOString();
      const offline = opts.recordedAt ? offlineDetail(at, now) : "";
      const counted = [pieces !== null ? `${pieces} of ${m.colli} pcs counted` : "", condition, location ? `at ${location}` : ""].filter(Boolean).join(" · ");
      const movementEvents: GateEvent[] = [];
      if (outcome === "received") {
        if (m.receivedAt || m.impRelease) throw APIError.failedPrecondition(`${ref(m)} is already received`);
        // LCL cargo is re-weighed before it is ticked off (checked under the position's lock).
        const res = await tx.execute(sql`SELECT (NOT ${needsReweighSql} OR EXISTS (SELECT 1 FROM warehouse_reweigh rw WHERE rw.movement_id = ${t.id} AND rw.deleted_at IS NULL)) AS ok FROM ${t} WHERE ${t.id} = ${m.id}`);
        if (!(res.rows[0] as { ok?: boolean } | undefined)?.ok) throw APIError.failedPrecondition("LCL cargo is re-weighed before the tick-off — record the re-weigh first");
        const day = pragueDate(at);
        const row = await gateMovementRepository.conditionalUpdate(
          m.id,
          companyId,
          { receivedAt: at, loadInDate: day, status: sql`CASE WHEN ${t.status} = 'Expected' THEN 'In Warehouse' ELSE ${t.status} END`, updatedBy: by },
          [
            {
              kind: "tallyReceived",
              label: `Received — ticked off at the stripping tally of container ${c.number}`,
              at: atIso,
              by,
              detail: [counted, m.loadInDate && m.loadInDate !== day ? `Received in warehouse was ${m.loadInDate}` : "", offline].filter(Boolean).join(" · ") || undefined,
              // The typed received date the tick replaces, restored if the tally is voided.
              ...(m.loadInDate ? { previous: m.loadInDate } : {}),
            },
          ],
          sql`${t.receivedAt} IS NULL AND ${t.impRelease} IS NULL`,
          tx,
        );
        if (!row) throw APIError.aborted("The position changed meanwhile — reload and try again");
        if (m.shipmentId) {
          await shipmentOutboxRepository.enqueue(tx, [
            outboxRow(m, "received", TALLY_STAMP, { warehouseReceivedDate: day, ...(m.positionRef ? { warehouseReference: m.positionRef } : {}) }, userId, role),
          ]);
          delivered = true;
        }
      } else {
        movementEvents.push({
          kind: outcome === "short" ? "tallyShort" : "tallyNotArrived",
          label: `${TALLY_LABEL[outcome]} at the stripping tally of container ${c.number}`,
          at: atIso,
          by,
          detail: [reason, counted, offline].filter(Boolean).join(" · "),
        });
      }
      const updated = await containerPositionRepository.update(
        tx,
        link.id,
        companyId,
        {
          tallyOutcome: outcome,
          tallyPieces: pieces,
          tallyCondition: condition,
          tallyLocation: location,
          tallyNote: note,
          tallyReason: reason,
          tickedAt: at,
          tickedBy: by,
          clientRequestId: requestId ?? null,
        },
        sql`${cp.tallyOutcome} = ''`,
      );
      if (!updated) throw APIError.aborted("The house changed meanwhile — reload and try again");
      // Ticked received: the stock line opens with the counted pieces and the tally location.
      if (outcome === "received") await syncStockForMovement(tx, companyId, m.id, { by, at, why: `stripping tally of container ${c.number}` });
      const containerEvents: GateEvent[] = [];
      if (!c.strippingStartedAt) {
        await containerRepository.conditionalUpdate(tx, id, companyId, { strippingStartedAt: at }, [], sql`${ct.strippingStartedAt} IS NULL`);
        containerEvents.push({ kind: "strippingStart", label: "Stripping started (first house tallied)", at: atIso, by });
      }
      containerEvents.push({
        kind: "tally",
        label: `${TALLY_LABEL[outcome]}: ${ref(m)}${counted ? ` — ${counted}` : ""}`.slice(0, 500),
        at: atIso,
        by,
        ...(reason || offline ? { detail: [reason, offline].filter(Boolean).join(" · ") } : {}),
        ...(requestId ? { requestId } : {}),
      });
      await this.log(tx, c, companyId, containerEvents, new Map([[m.id, movementEvents]]));
      if (pieces !== null && m.colli > 0 && pieces !== m.colli) {
        suggestException = { type: pieces < m.colli ? "Short" : "Over", pieces: Math.abs(m.colli - pieces) };
      } else if (outcome !== "received" && m.colli > 0 && pieces === null && outcome === "not_arrived") {
        suggestException = { type: "Short", pieces: m.colli };
      }
      const notice = [
        opts.recordedAt ? `Tallied — recorded offline at ${pragueHhmm(at)}` : "",
        suggestException ? `${suggestException.type} ${suggestException.pieces} pc${suggestException.pieces === 1 ? "" : "s"} against the expected ${m.colli} — record an exception?` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return { outcome: "done" as const, notice };
    });
    if (delivered) await deliverDue(movementId);
    return { container: await this.detail(id, companyId), ...result, suggestException };
  }

  // ---------- manager voids ----------

  // Voids the tally of a house (manager, with reason). A tick-off is undone: the house is not
  // received any more (its received date set by the tally is cleared) and what the tick still owed
  // the shipment is cancelled; a shipment already updated is NOT changed back (logged).
  async voidTally(id: string, companyId: string, userId: string, role: string, movementId: string, reason: string) {
    if (!isManager(role)) throw APIError.permissionDenied(MANAGERS_ONLY);
    const why = needReason(reason, "void a tally");
    const by = await userName(userId);
    let notice = "";
    await db.transaction(async (tx) => {
      const c = await this.lockContainer(tx, id, companyId);
      const link = await containerPositionRepository.findInContainer(tx, id, movementId, companyId);
      if (!link) throw APIError.notFound("This position is not in the container");
      if (!link.tallyOutcome) throw APIError.failedPrecondition("The house is not tallied");
      if (c.gateOutAt) throw APIError.failedPrecondition(`Container ${c.number} has gone out — void its gate-out first`);
      const [m] = await gateMovementRepository.lockLive(tx, [movementId], companyId);
      if (!m) throw APIError.failedPrecondition("The position is archived");
      if (m.impRelease) throw APIError.failedPrecondition("The cargo is already released — void the WH release first");
      const at = new Date().toISOString();
      const was = `${TALLY_LABEL[link.tallyOutcome as TallyResult] ?? link.tallyOutcome}${link.tickedAt ? ` ${pragueHhmm(link.tickedAt)}` : ""}${link.tickedBy ? ` by ${link.tickedBy}` : ""}`;
      const events: GateEvent[] = [{ kind: "tallyVoided", label: `Tally voided (container ${c.number})`, at, by, detail: `${why} · was ${was}` }];
      if (link.tallyOutcome === "received") {
        const tallyDay = link.tickedAt ? pragueDate(link.tickedAt) : "";
        // The typed "Received in warehouse" date the tick replaced comes back (free time starts there again).
        const previous = [...m.events].reverse().find((e) => e.kind === "tallyReceived")?.previous ?? "";
        const owed = m.shipmentId ? await shipmentOutboxRepository.cancelForStamps(tx, m.id, [TALLY_STAMP]) : [];
        const inFlight = (r: (typeof owed)[number]) => r.status === "pending" && !!r.lockedUntil && r.lockedUntil.getTime() > Date.now();
        if (owed.some((r) => (r.status === "pending" && !inFlight(r)) || r.status === "failed")) {
          events.push({ kind: "shipmentUpdateCancelled", label: "Shipment update cancelled — the tally was voided", at, by, detail: "warehouse received date" });
        }
        if (owed.some((r) => r.status === "sent") || owed.some(inFlight)) {
          events.push({
            kind: "shipmentMayNeedCorrecting",
            label: "Shipment may need correcting",
            at,
            by,
            detail: "its warehouse received date was set from this tally and is not changed back — correct it in Shipments if needed",
          });
          notice = "The shipment is not changed back — its warehouse received date was (or is being) set from this tally. Check it in Shipments and correct it if needed.";
        }
        const row = await gateMovementRepository.conditionalUpdate(
          m.id,
          companyId,
          {
            receivedAt: null,
            loadInDate: sql`CASE WHEN ${t.loadInDate} = ${tallyDay} THEN ${previous} ELSE ${t.loadInDate} END`,
            status: sql`CASE WHEN ${t.status} = 'In Warehouse' AND ${t.gateIn} IS NULL AND ${t.expDraft} IS NULL AND ${t.expReceipt} IS NULL THEN 'Expected' ELSE ${t.status} END`,
            updatedBy: by,
          },
          events,
          sql`${t.impRelease} IS NULL`,
          tx,
        );
        if (!row) throw APIError.aborted("The position changed meanwhile — reload and try again");
      } else {
        await gateMovementRepository.appendEvents(m.id, companyId, events, tx);
      }
      await containerPositionRepository.update(tx, link.id, companyId, {
        tallyOutcome: "",
        tallyPieces: null,
        tallyCondition: "",
        tallyLocation: "",
        tallyNote: "",
        tallyReason: "",
        tickedAt: null,
        tickedBy: "",
        clientRequestId: null,
      });
      // A voided tick-off voids the stock line (and bonded entry); a new tick opens the same rows.
      await syncStockForMovement(tx, companyId, m.id, { by, why: `tally voided: ${why}` });
      await this.log(tx, c, companyId, [{ kind: "tallyVoided", label: `Tally voided: ${ref(m)}`, at, by, detail: `${why} · was ${was}` }]);
    });
    return { container: await this.detail(id, companyId), notice };
  }

  // Voids a container stamp (manager, with reason); later steps go first. Voiding the export
  // gate-out brings the positions that left with it back into the warehouse (In Warehouse, the
  // clock runs again) and cancels what it still owed their shipments; shipments already updated
  // are NOT changed back (logged). Houses taken out of the plan at the gate-out stay out.
  async voidStamp(id: string, companyId: string, userId: string, role: string, kind: ContainerStampKind, reason: string) {
    if (!isManager(role)) throw APIError.permissionDenied(MANAGERS_ONLY);
    if (!CONTAINER_STAMP_KINDS.includes(kind)) throw APIError.invalidArgument(`Unknown container stamp "${kind}"`);
    const why = needReason(reason, "void a stamp");
    const by = await userName(userId);
    let notice = "";
    await db.transaction(async (tx) => {
      const c = await this.lockContainer(tx, id, companyId);
      const col = STAMP_COLUMN[kind];
      const value = c[col];
      if (!value) throw APIError.failedPrecondition(`${STAMP_LABEL[kind]} is not stamped`);
      const links = await containerPositionRepository.listForContainers([id], companyId, tx);
      if (kind !== "gateOut" && c.gateOutAt) throw APIError.failedPrecondition("Void the container gate-out first");
      if (kind === "gateIn") {
        if (c.closedAt) throw APIError.failedPrecondition("Void the close first");
        if (c.strippingStartedAt) throw APIError.failedPrecondition("Void the start of stripping first");
        if (links.some((l) => l.stuffedAt)) throw APIError.failedPrecondition("Un-stuff the houses first");
      }
      if (kind === "strippingStart" && links.some((l) => l.tallyOutcome)) throw APIError.failedPrecondition("Void the tallies first");
      const at = new Date().toISOString();
      const stampedBy = [...c.events].reverse().find((e) => e.kind === kind)?.by || "—";
      const events: GateEvent[] = [{ kind: "stampVoided", label: `${STAMP_LABEL[kind]} voided`, at, by, detail: `${why} · was ${pragueDate(value)} ${pragueHhmm(value)} by ${stampedBy}` }];
      const set: Record<string, unknown> = { [col]: null, updatedBy: by };
      if (kind === "gateIn") set.gatedIn = sql`CASE WHEN ${ct.gatedIn} = ${pragueDate(value)} THEN '' ELSE ${ct.gatedIn} END`;
      if (kind === "gateOut") set.gatedOut = sql`CASE WHEN ${ct.gatedOut} = ${pragueDate(value)} THEN '' ELSE ${ct.gatedOut} END`;
      if (kind === "close") set.closedBy = "";
      if (kind === "gateOut" && containerKind(c.direction) === "export") {
        // The positions that left with this gate-out (same container, same time).
        const left = await this.leftWith(tx, c, companyId);
        let mayNeedCorrecting = false;
        for (const m of left) {
          const owed = m.shipmentId ? await shipmentOutboxRepository.cancelForStamps(tx, m.id, [CONTAINER_GATE_OUT_STAMP]) : [];
          const inFlight = (r: (typeof owed)[number]) => r.status === "pending" && !!r.lockedUntil && r.lockedUntil.getTime() > Date.now();
          const mEvents: GateEvent[] = [{ kind: "leftInContainerVoided", label: `Back in the warehouse — gate-out of container ${c.number} voided`, at, by, detail: why }];
          if (owed.some((r) => (r.status === "pending" && !inFlight(r)) || r.status === "failed")) {
            mEvents.push({ kind: "shipmentUpdateCancelled", label: "Shipment update cancelled — the container gate-out was voided", at, by, detail: "warehouse released date" });
          }
          if (owed.some((r) => r.status === "sent") || owed.some(inFlight)) {
            mayNeedCorrecting = true;
            mEvents.push({
              kind: "shipmentMayNeedCorrecting",
              label: "Shipment may need correcting",
              at,
              by,
              detail: "its warehouse released date was set from the container gate-out and is not changed back — correct it in Shipments if needed",
            });
          }
          const row = await gateMovementRepository.conditionalUpdate(
            m.id,
            companyId,
            { leftAt: null, leftContainerId: null, status: sql`CASE WHEN ${t.status} = 'Released' AND ${t.impRelease} IS NULL THEN 'In Warehouse' ELSE ${t.status} END` },
            mEvents,
            sql`${t.leftContainerId} = ${c.id}`,
            tx,
          );
          if (!row) throw APIError.aborted("A position changed meanwhile — reload and try again");
          // Back in the warehouse: the stock line (and bonded entry) open again.
          await syncStockForMovement(tx, companyId, m.id, { by, why: `gate-out of container ${c.number} voided: ${why}` });
        }
        if (mayNeedCorrecting) {
          notice = "Shipments already updated from this gate-out are not changed back — check their warehouse released date in Shipments.";
          events.push({ kind: "shipmentMayNeedCorrecting", label: "Shipments may need correcting", at, by, detail: "released dates already sent are not changed back" });
        }
      }
      const columnSql = { gateIn: ct.gateInAt, strippingStart: ct.strippingStartedAt, close: ct.closedAt, gateOut: ct.gateOutAt }[kind];
      const row = await containerRepository.conditionalUpdate(tx, id, companyId, set, events, sql`date_trunc('milliseconds', ${columnSql}) = ${value.toISOString()}::timestamptz`);
      if (!row) throw APIError.aborted("The container changed meanwhile — reload and try again");
    });
    return { container: await this.detail(id, companyId), notice };
  }

  // Live positions that left in this container at its gate-out, locked (after the container).
  private async leftWith(tx: Tx, c: WarehouseContainerRecord, companyId: string) {
    const rows = await tx
      .select({ id: t.id })
      .from(t)
      .where(sql`${t.companyId} = ${companyId} AND ${t.leftContainerId} = ${c.id} AND ${t.deletedAt} IS NULL`);
    return gateMovementRepository.lockLive(
      tx,
      rows.map((r) => r.id),
      companyId,
    );
  }

  // ---------- register form ----------

  // A plate entered after the export container went out goes to the shipments of the positions
  // that left in it (as a plate after a WH release does).
  async plateChanged(c: WarehouseContainerRecord, plate: string, companyId: string, userId: string, role: string) {
    const p = plate.trim();
    if (!p || p === c.plate || !c.gateOutAt || containerKind(c.direction) !== "export") return;
    const shipmentIds = new Set<string>();
    await db.transaction(async (tx) => {
      const locked = await this.lockContainer(tx, c.id, companyId);
      const movements = await this.leftWith(tx, locked, companyId);
      const owed: NewShipmentOutboxRecord[] = [];
      for (const m of movements) {
        if (!m.shipmentId) continue;
        owed.push(outboxRow(m, "plate", CONTAINER_GATE_OUT_STAMP, { plateNumber: p }, userId, role));
        shipmentIds.add(m.shipmentId);
      }
      await shipmentOutboxRepository.enqueue(tx, owed);
    });
    if (shipmentIds.size) await deliverDue({ shipmentIds: [...shipmentIds] });
  }

  // Whether the container's houses let it be deleted: nothing stuffed or tallied, no stamp.
  async deleteBlocked(id: string, companyId: string): Promise<string | null> {
    const c = await containerRepository.findById(id, companyId);
    if (!c) return null;
    if (c.gateInAt || c.gateOutAt || c.closedAt || c.strippingStartedAt) return "The container has stamps — a manager can void them first";
    const links = await containerPositionRepository.listForContainers([id], companyId);
    if (links.some((l) => l.stuffedAt || l.tallyOutcome)) return "Houses of this container are stuffed or tallied";
    return null;
  }
}

export const containerService = new ContainerService();
