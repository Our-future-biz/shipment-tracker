import { APIError, ErrCode } from "encore.dev/api";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import { gateMovementRepository, hasStamp, type GateMovementRow } from "../repositories/gateMovement.repository";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { gateMovementTable, type GateEvent } from "../schemas/gateMovement.schema";
import { gateMovementService, type StampKind } from "./gateMovement.service";
import { deliverDue } from "./shipmentOutbox.service";
import { isManager, userName } from "./users";
import { houseContexts, isExportContainer, lockHouse, releaseHousesForArchive } from "./houses";
import type { Tx } from "../repositories/warehouseSection.repository";
import { syncStockForMovement } from "./warehouseStockSync";
import { dockSlotRepository } from "../repositories/warehouseRecords.repository";
import { gateExceptionRepository } from "../repositories/gateException.repository";
import { deliverGateEvents, enqueueGateEvents } from "./gateEvents.service";

// Manager actions on gate records — voiding a wrong stamp, archiving a stamped record and
// restoring an archived one — and removing a position with its gate records. Every one needs a
// reason and is logged on the record. The endpoints check the role too (requireRole).

export const STAMP_KINDS: StampKind[] = ["gateIn", "gateOut", "impRelease", "expDraft", "expReceipt"];
const STAMP_LABEL: Record<StampKind, string> = {
  gateIn: "Gate-in",
  gateOut: "Gate-out",
  impRelease: "WH release",
  expDraft: "WH draft receipt",
  expReceipt: "WH receipt",
};
const MANAGERS_ONLY = "Only a manager can do this";
// A shipment deleted in Shipments (retireForDeletedShipment): who and why, as logged.
export const SHIPMENT_DELETED_REASON = "Shipment deleted in Shipments";
export const SHIPMENT_DELETED_EVENT = "shipmentDeleted";
const SYSTEM_ACTOR = "System";
const SYSTEM_ROLE = "system";
const MAX_REASON = 500;
const t = gateMovementTable;

const stampText = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", dateStyle: "short", timeStyle: "short" }).format(d);

function needReason(reason: string | undefined, what: string): string {
  const r = (reason ?? "").trim();
  if (!r) throw APIError.invalidArgument(`A reason is required to ${what}`);
  if (r.length > MAX_REASON) throw APIError.invalidArgument(`The reason is too long (at most ${MAX_REASON} characters)`);
  return r;
}

function needManager(role: string) {
  if (!isManager(role)) throw APIError.permissionDenied(MANAGERS_ONLY);
}

const sameTime = (a: Date | null, b: Date | null) => !!a && !!b && a.getTime() === b.getTime();

// Why a stamp cannot be voided as the record is now; null when it can. Later steps go first:
// a receipt before its draft, everything after the gate-in before the gate-in, an outgoing
// gate-out before its WH release. A gate-out stamped together with the WH release is voided
// with the release, never on its own.
export function voidBlocked(m: Pick<GateMovementRow, StampKind> & { visit?: string; leftAt?: Date | null }, kind: StampKind): string | null {
  if (!m[kind]) return `${STAMP_LABEL[kind]} is not stamped`;
  // Cargo that left stuffed in a container: its arrival stays until the container's gate-out is voided.
  if (m.leftAt && (kind === "gateIn" || kind === "expDraft" || kind === "expReceipt")) {
    return "This cargo left in a container — void the container's gate-out first";
  }
  switch (kind) {
    case "gateOut":
      return sameTime(m.gateOut, m.impRelease) ? "The gate-out was stamped with the WH release — void the WH release instead" : null;
    case "impRelease":
      return m.visit === "výdej" && m.gateOut && !sameTime(m.gateOut, m.impRelease) ? "Void the gate-out first" : null;
    case "gateIn":
      if (m.expReceipt || m.expDraft) return "Void the WH receipt and the draft receipt first";
      if (m.impRelease) return "Void the WH release first";
      if (m.gateOut) return "Void the gate-out first";
      return null;
    case "expDraft":
      return m.expReceipt ? "Void the WH receipt first" : null;
    default:
      return null;
  }
}

// Status after the stamps in `after`: a refusal stays; otherwise it follows the stamps.
export function statusAfterVoid(status: string, after: Pick<GateMovementRow, StampKind> & { leftAt?: Date | null }): string {
  if (status === "Refused") return status;
  if (after.impRelease || after.leftAt) return "Released";
  if (after.gateIn || after.expDraft || after.expReceipt) return "In Warehouse";
  return "Expected";
}

// The column holds exactly `v` (as read), so nothing stamped or voided it meanwhile.
const sameStamp = (col: AnyPgColumn, v: Date | null) =>
  v ? sql`date_trunc('milliseconds', ${col}) = ${v.toISOString()}::timestamptz` : sql`${col} IS NULL`;

class GateAdminService {
  // Voids a wrong stamp (manager, with reason): the stamp column is cleared and the status
  // follows the stamps that remain. Voiding the WH release also clears the gate-out it stamped.
  // What the stamp still owed the shipment is cancelled; a shipment already updated from it is
  // NOT changed back — the record logs that the shipment may need correcting.
  async voidStamp(id: string, companyId: string, userId: string, role: string, kind: StampKind, reason: string) {
    needManager(role);
    if (!STAMP_KINDS.includes(kind)) throw APIError.invalidArgument(`Unknown stamp "${kind}"`);
    const why = needReason(reason, "void a stamp");
    const m = await gateMovementRepository.findById(id, companyId);
    if (!m) throw APIError.notFound("Gate movement not found");
    const blocked = voidBlocked(m, kind);
    if (blocked) throw APIError.failedPrecondition(blocked);
    // A stuffed house keeps its receipt: it is taken out of the container first.
    const stuffedHouse = async (tx?: Tx) => {
      const house = (await houseContexts([m.id], companyId, tx)).get(m.id);
      if (house && isExportContainer(house.container) && house.link.stuffedAt && (kind === "gateIn" || kind === "expDraft" || kind === "expReceipt")) {
        throw APIError.failedPrecondition(`Stuffed in container ${house.container.number} — remove it from the container first`);
      }
    };
    await stuffedHouse();

    const cleared: StampKind[] = [kind];
    if (kind === "impRelease" && sameTime(m.gateOut, m.impRelease)) cleared.push("gateOut");
    const after = { gateIn: m.gateIn, gateOut: m.gateOut, impRelease: m.impRelease, expDraft: m.expDraft, expReceipt: m.expReceipt, leftAt: m.leftAt };
    for (const c of cleared) after[c] = null;
    const status = statusAfterVoid(m.status, after);

    const now = new Date();
    const at = now.toISOString();
    const by = await userName(userId);
    const stampedBy = (k: StampKind) => [...m.events].reverse().find((e) => e.kind === k)?.by || "—";
    const events: GateEvent[] = cleared.map((k) => ({
      kind: "stampVoided",
      label: `${STAMP_LABEL[k]} voided`,
      at,
      by,
      detail: `${why} · was ${stampText(m[k]!)} by ${stampedBy(k)}${k !== kind ? ` · stamped with the ${STAMP_LABEL[kind]}` : ""}`,
    }));
    // Stamps that wrote (or would write) to the linked shipment.
    // (An outgoing gate-out stamped together with the WH release wrote nothing of its own.)
    const releasedTogether = sameTime(m.gateOut, m.impRelease);
    const writesBack = (k: StampKind) =>
      k === "gateIn" ? m.visit !== "výdej" : k === "impRelease" || (k === "gateOut" && m.visit === "výdej" && !releasedTogether);
    // Records stamped before the outbox existed wrote to the shipment directly and have no rows.
    const noOutboxYet = !!m.shipmentId && !(await shipmentOutboxRepository.forMovement(m.id, companyId)).length;
    const what = cleared.some((k) => k === "gateIn") ? "warehouse received date" : "warehouse released date";

    let mayNeedCorrecting = false;
    let published = 0;
    await db.transaction(async (tx) => {
      // Again under the locks (container, then position): a stuffed mark under way is seen.
      if (kind === "gateIn" || kind === "expDraft" || kind === "expReceipt") {
        await lockHouse(tx, m.id, companyId);
        await stuffedHouse(tx);
      }
      const owed = m.shipmentId ? await shipmentOutboxRepository.cancelForStamps(tx, m.id, companyId, cleared) : [];
      // A pending row still held by a delivery run is being sent right now: it may reach the
      // shipment although it is cancelled here (the delivery then logs it as well).
      const inFlight = (r: (typeof owed)[number]) => r.status === "pending" && !!r.lockedUntil && r.lockedUntil.getTime() > Date.now();
      const cancelled = owed.filter((r) => (r.status === "pending" && !inFlight(r)) || r.status === "failed");
      const sent = owed.some((r) => r.status === "sent");
      const sending = !sent && owed.some(inFlight);
      // Stamps from before the outbox wrote to the shipment directly: no row, but it was sent.
      const legacy = noOutboxYet && cleared.some(writesBack);
      if (cancelled.length) {
        events.push({ kind: "shipmentUpdateCancelled", label: "Shipment update cancelled — the stamp was voided", at, by, detail: what });
      }
      if (sent || legacy || sending) {
        mayNeedCorrecting = true;
        events.push({
          kind: "shipmentMayNeedCorrecting",
          label: "Shipment may need correcting",
          at,
          by,
          detail: sending
            ? `its ${what} was being sent from this stamp at the moment of the void and is not changed back — check it in Shipments`
            : `its ${what} was set from this stamp and is not changed back — correct it in Shipments if needed`,
        });
      }
      const set: Record<string, unknown> = { status, updatedBy: by };
      for (const c of cleared) set[c] = null;
      const row = await gateMovementRepository.conditionalUpdate(
        id,
        companyId,
        set,
        events,
        sql`${t.status} = ${m.status} AND ${sameStamp(t.gateIn, m.gateIn)} AND ${sameStamp(t.gateOut, m.gateOut)}
          AND ${sameStamp(t.impRelease, m.impRelease)} AND ${sameStamp(t.expDraft, m.expDraft)} AND ${sameStamp(t.expReceipt, m.expReceipt)}
          AND ${sameStamp(t.leftAt, m.leftAt)}`,
        tx,
      );
      if (!row) throw APIError.aborted("The record changed meanwhile — reload and try again");
      // A voided gate-in / gate-out is told on the warehouse-gate-stamped topic ("voided"), after
      // the commit through the event outbox, as the stamp itself was.
      published = await enqueueGateEvents(
        tx,
        {
          companyId,
          movementId: id,
          positionId: m.positionRef ? m.warehouseTaskId : null,
          wczRef: m.positionRef ?? "",
          shipmentId: m.shipmentId,
          userId,
          stampKind: kind,
          at: now,
          // Only what was told: an inbound arrival, and a departure (the WH release with its
          // gate-out, or an outbound gate-out).
          voided: {
            gateIn: cleared.includes("gateIn") && m.visit !== "výdej",
            gateOut: cleared.includes("gateOut") && (kind === "impRelease" || m.visit === "výdej"),
          },
        },
        role,
      );
      // Stock on Hand / Bonded Register follow the gate record (a voided receipt voids the line).
      await syncStockForMovement(tx, companyId, id, { by, why: `${STAMP_LABEL[kind]} voided: ${why}` });
    });
    if (published) await deliverGateEvents(id);
    return {
      movement: await gateMovementService.get(id, companyId),
      notice: mayNeedCorrecting ? `The shipment is not changed back — its ${what} was (or is being) set from this stamp. Check it in Shipments and correct it if needed.` : "",
    };
  }

  // Archives a gate record (manager, with reason): it leaves the Gate Log but is kept, with who
  // and why, and can be restored. Its position is not touched.
  async archive(id: string, companyId: string, userId: string, role: string, reason: string) {
    needManager(role);
    const why = needReason(reason, "archive a record");
    const by = await userName(userId);
    const row = await db.transaction(async (tx) => {
      await releaseHousesForArchive(tx, [id], companyId, by, `the position was archived: ${why}`);
      const archived = await gateMovementRepository.archive(id, companyId, by, why, { kind: "archived", label: "Archived", at: new Date().toISOString(), by, detail: why }, undefined, tx);
      if (archived) await syncStockForMovement(tx, companyId, id, { by, why: `position archived: ${why}` });
      return archived;
    });
    if (!row) throw APIError.notFound("Gate movement not found");
    return gateMovementService.get(id, companyId);
  }

  // Brings an archived record back (manager, with reason). A position removed with it comes
  // back too — unless its shipment is in the warehouse again, or its reference is in use — and
  // so do the position's other gate records archived when it was removed (not those a manager
  // archived on their own before).
  async restore(id: string, companyId: string, userId: string, role: string, reason: string) {
    needManager(role);
    const why = needReason(reason, "restore a record");
    const m = await gateMovementRepository.findByIdAny(id, companyId);
    if (!m) throw APIError.notFound("Gate movement not found");
    if (!m.deletedAt) throw APIError.failedPrecondition("This record is not archived");
    const by = await userName(userId);
    await db.transaction(async (tx) => {
      let withTask = "";
      const task = m.warehouseTaskId ? await warehouseTaskRepository.findAny(m.warehouseTaskId, companyId, tx) : null;
      if (task?.deletedAt) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`warehouse_ref:${companyId}`}))`);
        const again = task.shipmentId ? await warehouseTaskRepository.findLiveForShipment(companyId, task.shipmentId, tx) : null;
        if (again) throw APIError.failedPrecondition(`The shipment is in the warehouse again under ${again.taskId} — this record cannot be restored`);
        const sameRef = await warehouseTaskRepository.findLiveByRef(companyId, task.taskId, tx);
        if (sameRef) throw APIError.failedPrecondition(`Reference ${task.taskId} is in use again — this record cannot be restored`);
        await warehouseTaskRepository.undelete(tx, task.id, companyId);
        withTask = ` with its position ${task.taskId}`;
      }
      const at = new Date().toISOString();
      const row = await gateMovementRepository.restore(tx, id, companyId, { kind: "restored", label: `Restored${withTask}`, at, by, detail: why });
      if (!row) throw APIError.failedPrecondition("This record is not archived");
      if (task?.deletedAt) {
        await gateMovementRepository.restoreArchivedWithTask(tx, task.id, companyId, task.deletedAt, {
          kind: "restored",
          label: `Restored with its position ${task.taskId}`,
          at,
          by,
          detail: why,
        });
      }
      // Stock lines closed by the archive open again (each restored gate record).
      const restoredIds = task?.deletedAt ? (await gateMovementRepository.liveForTaskLocked(tx, task.id, companyId)).map((r) => r.id) : [];
      for (const rid of new Set([id, ...restoredIds])) await syncStockForMovement(tx, companyId, rid, { by, why: `restored: ${why}` });
    });
    return gateMovementService.get(id, companyId);
  }

  // Removes a position from the warehouse with its gate records (archived, not erased), in one
  // transaction. A position whose gate record has a stamp is removed only by a manager with a
  // reason; any user may remove one the gate never stamped.
  // (`actor`: the name logged instead of the user's — the system's own removals.)
  async removePosition(taskId: string, companyId: string, userId: string, role: string, reason?: string, actor?: string) {
    const task = await gateMovementRepository.findTask(taskId, companyId);
    if (!task) throw APIError.notFound("Warehouse position not found");
    const by = actor ?? (await userName(userId));
    const why = (reason ?? "").trim();
    await db.transaction(async (tx) => {
      // The containers' houses first (containers are locked before positions), then the records.
      const liveIds = (await gateMovementRepository.liveForTaskLocked(tx, taskId, companyId, false)).map((r) => r.id);
      await releaseHousesForArchive(tx, liveIds, companyId, by, `the position ${task.taskId} was removed`);
      const rows = await gateMovementRepository.liveForTaskLocked(tx, taskId, companyId);
      if (rows.some(hasStamp)) {
        if (!isManager(role)) {
          throw APIError.permissionDenied(`${task.taskId}: its gate record has stamps — only a manager can remove it, with a reason`);
        }
        needReason(why, `remove ${task.taskId} (its gate record has stamps)`);
      }
      if (why.length > MAX_REASON) throw APIError.invalidArgument(`The reason is too long (at most ${MAX_REASON} characters)`);
      const removed = await warehouseTaskRepository.softDelete(taskId, companyId, tx);
      if (!removed) throw APIError.notFound("Warehouse position not found");
      const archiveReason = why || "Removed with its position";
      await gateMovementRepository.archiveForTask(tx, taskId, companyId, by, archiveReason, {
        kind: "archived",
        label: `Archived with its position ${task.taskId}`,
        at: new Date().toISOString(),
        by,
        detail: archiveReason,
      });
      for (const r of rows) await syncStockForMovement(tx, companyId, r.id, { by, why: `position removed: ${archiveReason}` });
      // Its booked dock slots stop holding the door; its open exceptions are closed.
      const ids = rows.map((r) => r.id);
      await dockSlotRepository.cancelForMovements(tx, ids, companyId, `position ${task.taskId} removed`);
      await gateExceptionRepository.closeForMovements(tx, ids, companyId, by, `Closed: position ${task.taskId} removed — ${archiveReason}`);
    });
  }

  // A shipment deleted in Shipments (warehouseService.retireShipment; runs as the system, safe to
  // run again). Each of its live positions the gate never stamped is removed through
  // removePosition, its gate records archived with SHIPMENT_DELETED_REASON. A stamped one —
  // cargo that was physically handled — is kept: the system is no manager, so removePosition
  // refuses it, and its live gate records get one "Shipment deleted" event instead. The
  // updates the gate still owes the deleted shipment (pending or failed) are cancelled.
  // Both lists carry position ids (warehouse_task.id).
  async retireForDeletedShipment(shipmentId: string, companyId: string): Promise<{ removed: string[]; kept: string[] }> {
    const removed: string[] = [];
    const kept: string[] = [];
    for (const task of await warehouseTaskRepository.listByShipmentId(shipmentId, companyId)) {
      try {
        await this.removePosition(task.id, companyId, "", SYSTEM_ROLE, SHIPMENT_DELETED_REASON, SYSTEM_ACTOR);
        removed.push(task.id);
      } catch (err) {
        // Stamped: kept. Gone meanwhile (a second delivery of the event): nothing to do.
        if (err instanceof APIError && err.code === ErrCode.PermissionDenied) kept.push(task.id);
        else if (!(err instanceof APIError && err.code === ErrCode.NotFound)) throw err;
      }
    }
    await db.transaction(async (tx) => {
      await shipmentOutboxRepository.cancelForShipment(tx, shipmentId, companyId, "shipment deleted in Shipments");
      const at = new Date().toISOString();
      for (const taskId of kept) {
        for (const r of await gateMovementRepository.liveForTaskLocked(tx, taskId, companyId)) {
          if (r.events.some((e) => e.kind === SHIPMENT_DELETED_EVENT)) continue;
          await gateMovementRepository.appendEvents(
            r.id,
            companyId,
            [{ kind: SHIPMENT_DELETED_EVENT, label: "Shipment deleted in Shipments — position kept (its gate record has stamps)", at, by: SYSTEM_ACTOR }],
            tx,
          );
        }
      }
    });
    return { removed, kept };
  }

  // "Retry now" for a shipment update the gate still owes: it is sent straight away; a failed
  // one starts again. Any user; logged.
  async retryShipmentUpdate(id: string, companyId: string, userId: string) {
    const m = await gateMovementRepository.findByIdAny(id, companyId);
    if (!m) throw APIError.notFound("Gate movement not found");
    const rows = await shipmentOutboxRepository.retryNow(id, companyId);
    if (!rows.length) throw APIError.failedPrecondition("Nothing to send to the shipment — it is up to date");
    const by = await userName(userId);
    await gateMovementRepository.appendEvents(id, companyId, [{ kind: "shipmentUpdateRetry", label: "Shipment update: retry now", at: new Date().toISOString(), by }]);
    // Older updates of the same shipments go first, so they are sent now as well.
    await deliverDue({ shipmentIds: [...new Set(rows.map((r) => r.shipmentId))] });
    return gateMovementService.get(id, companyId);
  }

  // A failed shipment update that was set in Shipments by hand: no longer shown. Any user; logged.
  async dismissShipmentUpdate(id: string, companyId: string, userId: string) {
    const m = await gateMovementRepository.findByIdAny(id, companyId);
    if (!m) throw APIError.notFound("Gate movement not found");
    const rows = await shipmentOutboxRepository.dismissFailed(id, companyId);
    if (!rows.length) throw APIError.failedPrecondition("No failed shipment update to dismiss");
    const by = await userName(userId);
    await gateMovementRepository.appendEvents(id, companyId, [
      { kind: "shipmentUpdateDismissed", label: "Failed shipment update dismissed — set in Shipments by hand", at: new Date().toISOString(), by },
    ]);
    return gateMovementService.get(id, companyId);
  }
}

export const gateAdminService = new GateAdminService();
