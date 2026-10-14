import { APIError } from "encore.dev/api";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import { gateExceptionRepository } from "../repositories/gateException.repository";
import { gateFileRepository } from "../repositories/gateFile.repository";
import { gateMovementTable, type GateEvent, type GateReleaseLine } from "../schemas/gateMovement.schema";
import type { Tx } from "../repositories/warehouseSection.repository";
import type { GateExceptionInput } from "../interfaces/gate.interfaces";
import { gateMovementService } from "./gateMovement.service";
import { EXCEPTION_GATE, EXCEPTION_TYPES, openExceptionsNote, setExceptionLineSql } from "./osd";
import { userName } from "./users";

// Damage / short / over (OS&D) exceptions of a gate movement. Recording one puts the cargo ON
// HOLD (the "No open exceptions" release-gate line goes to Blocked); any user may resolve it with
// a note, logged; when none is left open the line goes to OK. Both run under the movement's row
// lock, so the line always matches the open exceptions, and a WH release racing with a new
// exception is refused (gateMovement.service armedSql).

const MAX_PIECES = 100_000;
const MAX_NOTE = 2_000;
const MAX_FILES = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const t = gateMovementTable;

const hhmm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" }).format(d);

// Locks the live movement until the transaction ends; null when there is none.
async function lockMovement(tx: Tx, id: string, companyId: string) {
  const [row] = await tx
    .select({ id: t.id, impRelease: t.impRelease, warehouseTaskId: t.warehouseTaskId })
    .from(t)
    .where(and(eq(t.id, id), eq(t.companyId, companyId), isNull(t.deletedAt)))
    .for("update");
  return row ?? null;
}

// Sets the exceptions line from the exceptions open now (unreleased movements only) and logs
// `events`, in the caller's transaction.
async function syncLine(tx: Tx, id: string, companyId: string, released: boolean, events: GateEvent[], resolvedBy: string) {
  const open = await gateExceptionRepository.openForMovement(tx, id, companyId);
  const at = new Date();
  const line: GateReleaseLine = open.length
    ? { g: EXCEPTION_GATE, s: "Blocked", note: openExceptionsNote(open) }
    : { g: EXCEPTION_GATE, s: "OK", note: `resolved ${hhmm(at)} · by ${resolvedBy || "—"}` };
  await tx
    .update(t)
    .set({
      ...(released ? {} : { releaseGates: setExceptionLineSql(line) }),
      events: sql`${t.events} || ${JSON.stringify(events)}::jsonb`,
      updatedAt: at,
    })
    .where(and(eq(t.id, id), eq(t.companyId, companyId)));
}

class GateExceptionService {
  async create(id: string, companyId: string, userId: string, input: GateExceptionInput) {
    const type = (input?.type ?? "").trim();
    if (!(EXCEPTION_TYPES as readonly string[]).includes(type)) throw APIError.invalidArgument(`Type must be one of: ${EXCEPTION_TYPES.join(", ")}`);
    const pieces = input.pieces;
    if (!Number.isInteger(pieces) || pieces < 1 || pieces > MAX_PIECES) throw APIError.invalidArgument("Pieces must be a whole number of at least 1");
    const note = (input.note ?? "").trim();
    if (note.length > MAX_NOTE) throw APIError.invalidArgument(`The note is too long (at most ${MAX_NOTE} characters)`);
    const source = input.source === "survey" ? "survey" : "manual";
    const fileIds = [...new Set(input.fileIds ?? [])];
    if (fileIds.length > MAX_FILES) throw APIError.invalidArgument(`At most ${MAX_FILES} photos per exception`);
    for (const f of fileIds) {
      if (!UUID.test(f) || !(await gateFileRepository.findById(f, id, companyId))) {
        throw APIError.invalidArgument("A photo does not belong to this gate record");
      }
    }
    const by = await userName(userId);
    await db.transaction(async (tx) => {
      const m = await lockMovement(tx, id, companyId);
      if (!m) throw APIError.notFound("Gate movement not found");
      const row = await gateExceptionRepository.create(tx, {
        companyId,
        movementId: id,
        taskId: m.warehouseTaskId,
        type,
        pieces,
        note,
        container: (input.container ?? "").trim().slice(0, 50),
        surveyPhase: (input.surveyPhase ?? "").trim().slice(0, 100),
        source,
        fileIds,
        createdBy: by,
      });
      const event: GateEvent = {
        kind: "exceptionOpened",
        label: `Exception: ${type} ${pieces} pc${pieces === 1 ? "" : "s"}${m.impRelease ? "" : " — cargo on hold"}`,
        at: row.createdAt.toISOString(),
        by,
        ...(note ? { detail: note } : {}),
      };
      await syncLine(tx, id, companyId, !!m.impRelease, [event], by);
    });
    return gateMovementService.get(id, companyId);
  }

  async resolve(id: string, exceptionId: string, companyId: string, userId: string, note: string) {
    const text = (note ?? "").trim();
    if (!text) throw APIError.invalidArgument("A note is required to resolve an exception");
    if (text.length > MAX_NOTE) throw APIError.invalidArgument(`The note is too long (at most ${MAX_NOTE} characters)`);
    if (!UUID.test(exceptionId)) throw APIError.notFound("Exception not found");
    const by = await userName(userId);
    await db.transaction(async (tx) => {
      const m = await lockMovement(tx, id, companyId);
      if (!m) throw APIError.notFound("Gate movement not found");
      const row = await gateExceptionRepository.resolve(tx, exceptionId, id, companyId, by, text);
      if (!row) {
        const cur = await gateExceptionRepository.findById(exceptionId, id, companyId);
        if (!cur) throw APIError.notFound("Exception not found");
        throw APIError.failedPrecondition("This exception is already resolved");
      }
      const event: GateEvent = {
        kind: "exceptionResolved",
        label: `Exception resolved: ${row.type} ${row.pieces} pc${row.pieces === 1 ? "" : "s"}`,
        at: new Date().toISOString(),
        by,
        detail: text,
      };
      await syncLine(tx, id, companyId, !!m.impRelease, [event], by);
    });
    return gateMovementService.get(id, companyId);
  }
}

export const gateExceptionService = new GateExceptionService();
