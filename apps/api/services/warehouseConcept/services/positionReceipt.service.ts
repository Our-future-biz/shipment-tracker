import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import { sql } from "drizzle-orm";
import { db } from "../db/db";
import { gateMovementRepository, type GateMovementRow } from "../repositories/gateMovement.repository";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import { stockLineRepository } from "../repositories/warehouseStock.repository";
import { gateMovementTable, type GateEvent } from "../schemas/gateMovement.schema";
import type { NewShipmentOutboxRecord } from "../schemas/shipmentOutbox.schema";
import type { GateMovementItem } from "../interfaces/gate.interfaces";
import { gateMovementService } from "./gateMovement.service";
import { houseContexts } from "./houses";
import { checkRequestId, pragueHhmm } from "./offline";
import { needsReweighSql } from "./reweigh";
import { keptReceivedDay, pragueDate, pragueDayStart } from "./storage";
import { deliverDue } from "./shipmentOutbox.service";
import { isManager, userName } from "./users";
import { syncStockForMovement } from "./warehouseStockSync";
import { COUNT_VOIDED } from "./warehouseStockPlan";
import {
  countedText,
  lastReceiptEvent,
  receiptPiecesRefusal,
  RECEIPT_EVENT,
  RECEIPT_STAMP,
  RECEIPT_VOIDED_EVENT,
  receiptBlocked,
  receiptSuggestions,
  suggestionsNotice,
  type ReceiptEvent,
  type ReceiptSuggestion,
} from "./positionReceipt";

// The receipt of loose import cargo (rules in positionReceipt.ts): an outbound position with no
// container is counted, its condition and location noted, and it is received — the received date
// (Prague day; the free time starts), status In Warehouse, the stock line at the location, and its
// shipment gets the received date and the WCZ reference through the outbox, as a tally tick does.
// One transaction with the gate record locked (the same lock a container's "add houses" takes, so
// a position is never received here and added to a stripping tally at once). A manager voids it
// with a reason: the typed date it replaced comes back; a shipment already updated is not changed back.
// A typed received date earlier than the day of the receipt is kept (the storage clock is not moved later).

export interface PositionReceiptInput {
  /** Pieces counted; null when not counted. */
  pieces?: number | null;
  /** Good · Damaged packaging · Damaged cargo · Wet · Re-packed (free text, at most 200). */
  condition?: string;
  /** Zone / rack (at most 100). */
  location?: string;
  note?: string;
  /** Floor mode: id of this request (UUID). A receipt already there from it is then an answer, not an error. */
  clientRequestId?: string;
}

export type ReceiptOutcome = "done" | "already_done" | "done_by_someone_else";

const MAX_NOTE = 2_000;
const MAX_REASON = 500;
const t = gateMovementTable;
const ref = (m: Pick<GateMovementRow, "positionRef" | "gateRef">) => m.positionRef || m.gateRef;

const text = (v: string | undefined, max: number, label: string) => {
  const s = (v ?? "").trim();
  if (s.length > max) throw APIError.invalidArgument(`${label} is too long (at most ${max} characters)`);
  return s;
};

function outboxRow(m: GateMovementRow, payload: Record<string, string>, userId: string, role: string): NewShipmentOutboxRecord {
  return { companyId: m.companyId, movementId: m.id, shipmentId: m.shipmentId!, kind: "received", stamp: RECEIPT_STAMP, payload, actingUserId: userId, actingRole: role };
}

class PositionReceiptService {
  async record(
    id: string,
    companyId: string,
    userId: string,
    role: string,
    input: PositionReceiptInput,
  ): Promise<{ movement: GateMovementItem; outcome: ReceiptOutcome; notice: string; suggestExceptions: ReceiptSuggestion[] }> {
    const pieces = input?.pieces ?? null;
    // 0 pieces is refused: cargo that did not come is a Short exception (R29).
    const piecesRefused = receiptPiecesRefusal(pieces);
    if (piecesRefused) throw APIError.invalidArgument(piecesRefused);
    const condition = text(input?.condition, 200, "The condition");
    const location = text(input?.location, 100, "The location");
    const note = text(input?.note, MAX_NOTE, "The note");
    const requestId = checkRequestId(input?.clientRequestId);
    const by = await userName(userId);
    let delivered = false;
    let suggestExceptions: ReceiptSuggestion[] = [];
    const result = await db.transaction(async (tx) => {
      const [m] = await gateMovementRepository.lockLive(tx, [id], companyId);
      if (!m) throw APIError.notFound("Gate movement not found");
      const prev = lastReceiptEvent(m.events);
      // A replay of the same phone request is an answer, not an error.
      if (requestId && m.events.some((e) => e.kind === RECEIPT_EVENT && e.requestId === requestId)) {
        return { outcome: "already_done" as const, notice: "This receipt was already sent from this phone" };
      }
      const house = (await houseContexts([id], companyId, tx)).get(id);
      const blocked = receiptBlocked(m, house ? house.container.number : null);
      if (blocked) {
        if (requestId && m.receivedAt && prev) {
          return { outcome: "done_by_someone_else" as const, notice: `${ref(m)} was already received ${pragueHhmm(new Date(prev.at))}${prev.by ? ` by ${prev.by}` : ""}` };
        }
        throw APIError.failedPrecondition(`${ref(m)}: ${blocked}`);
      }
      // LCL cargo is re-weighed before its receipt (checked under the position's lock), as before a tally tick.
      const res = await tx.execute(sql`SELECT (NOT ${needsReweighSql} OR EXISTS (SELECT 1 FROM warehouse_reweigh rw WHERE rw.movement_id = ${t.id} AND rw.deleted_at IS NULL)) AS ok FROM ${t} WHERE ${t.id} = ${m.id}`);
      if (!(res.rows[0] as { ok?: boolean } | undefined)?.ok) throw APIError.failedPrecondition("LCL cargo is re-weighed before the receipt — record the re-weigh first");
      const at = new Date();
      // A typed "Received in warehouse" day earlier than today stays: the storage clock and the
      // shipment keep it (moving it later is storage given away — only a manager does that,
      // lib/warehouseReceivedRule). The receipt still records what was counted, and when.
      const kept = keptReceivedDay(m.loadInDate, pragueDate(at));
      const day = kept ?? pragueDate(at);
      const receivedAt = kept ? pragueDayStart(kept) : at;
      const counted = countedText(pieces, m.colli, condition, location);
      const outboxId = m.shipmentId ? randomUUID() : undefined;
      const event: ReceiptEvent = {
        kind: RECEIPT_EVENT,
        label: "Received — receipt in the warehouse (no container)",
        at: at.toISOString(),
        by,
        detail:
          [counted, note, kept ? `Received in warehouse ${kept} kept` : m.loadInDate && m.loadInDate !== day ? `Received in warehouse was ${m.loadInDate}` : ""].filter(Boolean).join(" · ") ||
          undefined,
        // The typed received date the receipt replaces, restored if the receipt is voided.
        ...(m.loadInDate ? { previous: m.loadInDate } : {}),
        ...(requestId ? { requestId } : {}),
        ...(outboxId ? { outboxId } : {}),
        receipt: { pieces, condition, location },
      };
      const row = await gateMovementRepository.conditionalUpdate(
        m.id,
        companyId,
        { receivedAt, loadInDate: day, status: sql`CASE WHEN ${t.status} = 'Expected' THEN 'In Warehouse' ELSE ${t.status} END`, updatedBy: by },
        [event as GateEvent],
        sql`${t.receivedAt} IS NULL AND ${t.impRelease} IS NULL`,
        tx,
      );
      if (!row) throw APIError.aborted("The position changed meanwhile — reload and try again");
      if (m.shipmentId) {
        await shipmentOutboxRepository.enqueue(tx, [
          { ...outboxRow(m, { warehouseReceivedDate: day, ...(m.positionRef ? { warehouseReference: m.positionRef } : {}) }, userId, role), id: outboxId },
        ]);
        delivered = true;
      }
      // The stock line opens at the receipt; the location counted here goes on it, as a tally
      // tick's does (a location a person already set on the line is kept).
      await syncStockForMovement(tx, companyId, m.id, { by, at, why: "receipt in the warehouse" });
      if (location) {
        const line = await stockLineRepository.autoForMovement(tx, companyId, m.id);
        if (line && !line.location) await stockLineRepository.updateTx(tx, line.id, companyId, { location: location.toUpperCase() });
      }
      suggestExceptions = receiptSuggestions(m.colli, pieces, condition);
      return { outcome: "done" as const, notice: suggestionsNotice(suggestExceptions, m.colli, condition) };
    });
    if (delivered) await deliverDue(id);
    return { movement: await gateMovementService.get(id, companyId), ...result, suggestExceptions };
  }

  // Voids the receipt (manager, with reason). The position is not received any more: the typed
  // "Received in warehouse" date it replaced comes back, the stock line is voided, and what the
  // receipt still owed the shipment is cancelled; a shipment already updated is NOT changed back (logged).
  async voidReceipt(id: string, companyId: string, userId: string, role: string, reason: string): Promise<{ movement: GateMovementItem; notice: string }> {
    if (!isManager(role)) throw APIError.permissionDenied("Only a manager can do this");
    const why = (reason ?? "").trim();
    if (why.length < 3) throw APIError.invalidArgument("A reason is needed to void the receipt (at least 3 characters)");
    if (why.length > MAX_REASON) throw APIError.invalidArgument(`The reason is too long (at most ${MAX_REASON} characters)`);
    const by = await userName(userId);
    let notice = "";
    await db.transaction(async (tx) => {
      const [m] = await gateMovementRepository.lockLive(tx, [id], companyId);
      if (!m) throw APIError.notFound("Gate movement not found");
      const prev = lastReceiptEvent(m.events);
      if (!prev || !m.receivedAt) throw APIError.failedPrecondition(`${ref(m)} has no receipt to void`);
      if (m.impRelease) throw APIError.failedPrecondition("The cargo is already released — void the WH release first");
      const at = new Date().toISOString();
      const receiptDay = pragueDate(m.receivedAt);
      const events: GateEvent[] = [
        { kind: RECEIPT_VOIDED_EVENT, label: "Receipt voided", at, by, detail: `${why} · was ${pragueHhmm(m.receivedAt)}${prev.by ? ` by ${prev.by}` : ""}` },
      ];
      // Only the update THIS receipt owed: an earlier receipt voided before has rows of its own
      // (sent, or cancelled by its void) that must not make this void warn. A receipt made before
      // the id was kept falls back to every receipt row.
      const cancelled = m.shipmentId ? await shipmentOutboxRepository.cancelForStamps(tx, m.id, companyId, [RECEIPT_STAMP]) : [];
      const owed = prev.outboxId ? cancelled.filter((r) => r.id === prev.outboxId) : cancelled;
      const inFlight = (r: (typeof owed)[number]) => r.status === "pending" && !!r.lockedUntil && r.lockedUntil.getTime() > Date.now();
      if (owed.some((r) => (r.status === "pending" && !inFlight(r)) || r.status === "failed")) {
        events.push({ kind: "shipmentUpdateCancelled", label: "Shipment update cancelled — the receipt was voided", at, by, detail: "warehouse received date" });
      }
      if (owed.some((r) => r.status === "sent") || owed.some(inFlight)) {
        events.push({
          kind: "shipmentMayNeedCorrecting",
          label: "Shipment may need correcting",
          at,
          by,
          detail: "its warehouse received date was set from this receipt and is not changed back — correct it in Shipments if needed",
        });
        notice = "The shipment is not changed back — its warehouse received date was (or is being) set from this receipt. Check it in Shipments and correct it if needed.";
      }
      const row = await gateMovementRepository.conditionalUpdate(
        m.id,
        companyId,
        {
          receivedAt: null,
          loadInDate: sql`CASE WHEN ${t.loadInDate} = ${receiptDay} THEN ${prev.previous ?? ""} ELSE ${t.loadInDate} END`,
          status: sql`CASE WHEN ${t.status} = 'In Warehouse' AND ${t.gateIn} IS NULL AND ${t.expDraft} IS NULL AND ${t.expReceipt} IS NULL THEN 'Expected' ELSE ${t.status} END`,
          updatedBy: by,
        },
        events,
        sql`${t.impRelease} IS NULL AND ${t.receivedAt} IS NOT NULL`,
        tx,
      );
      if (!row) throw APIError.aborted("The position changed meanwhile — reload and try again");
      // The typed date it gave back may still receive the position; else the stock line is voided.
      await syncStockForMovement(tx, companyId, m.id, { by, why: `${COUNT_VOIDED.receipt}: ${why}`, countVoided: true });
    });
    return { movement: await gateMovementService.get(id, companyId), notice };
  }
}

export const positionReceiptService = new PositionReceiptService();
