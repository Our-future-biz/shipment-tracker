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
import { acceptRecordedAt, checkRequestId, offlineDetail, pragueHhmm, type ExceptionOutcome } from "./offline";
import type { GateMovementItem } from "../interfaces/gate.interfaces";
import { isUniqueViolation } from "../../../lib/db/errors";

// Damage / short / over (OS&D) exceptions of a gate movement. Recording one puts the cargo ON
// HOLD (the "No open exceptions" release-gate line goes to Blocked) and clears a supervisor
// override in force (Council Outlay 5, decision 14: the override was given for what was known
// then, not for the new damage or shortage); any user may resolve it with a note, logged; when
// none is left open the line goes to OK. Both run under the movement's row
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
    .select({ id: t.id, impRelease: t.impRelease, leftAt: t.leftAt, overridden: t.overridden, warehouseTaskId: t.warehouseTaskId })
    .from(t)
    .where(and(eq(t.id, id), eq(t.companyId, companyId), isNull(t.deletedAt)))
    .for("update");
  return row ?? null;
}

// Sets the exceptions line from the exceptions open now (unreleased movements only) and logs
// `events`, in the caller's transaction. `clearOverride` also takes back a supervisor override.
async function syncLine(tx: Tx, id: string, companyId: string, released: boolean, events: GateEvent[], resolvedBy: string, clearOverride = false) {
  const open = await gateExceptionRepository.openForMovement(tx, id, companyId);
  const at = new Date();
  const line: GateReleaseLine = open.length
    ? { g: EXCEPTION_GATE, s: "Blocked", note: openExceptionsNote(open) }
    : { g: EXCEPTION_GATE, s: "OK", note: `resolved ${hhmm(at)} · by ${resolvedBy || "—"}` };
  await tx
    .update(t)
    .set({
      ...(released ? {} : { releaseGates: setExceptionLineSql(line) }),
      ...(clearOverride ? { overridden: false } : {}),
      events: sql`${t.events} || ${JSON.stringify(events)}::jsonb`,
      updatedAt: at,
    })
    .where(and(eq(t.id, id), eq(t.companyId, companyId)));
}

export interface OpenExceptionFields {
  type: string;
  pieces: number;
  note: string;
  container?: string;
  surveyPhase?: string;
  /** manual | survey | tally */
  source: string;
  fileIds?: string[];
  createdAt?: Date;
  clientRequestId?: string;
  /** Extra text for the history line (e.g. recorded offline). */
  detail?: string;
}

/**
 * Opens an exception on a gate record in the caller's transaction: the record is locked, the
 * exception stored, the "No open exceptions" line set to Blocked and, while the cargo is still in
 * the warehouse, a supervisor override in force taken back (logged). The gate job, floor mode and
 * the stripping tally all open exceptions through here. Null when the record is archived.
 */
export async function openExceptionInTx(tx: Tx, id: string, companyId: string, by: string, f: OpenExceptionFields) {
  const m = await lockMovement(tx, id, companyId);
  if (!m) return null;
  const row = await gateExceptionRepository.insert(tx, {
    companyId,
    movementId: id,
    taskId: m.warehouseTaskId,
    type: f.type,
    pieces: f.pieces,
    note: f.note,
    container: (f.container ?? "").trim().slice(0, 50),
    surveyPhase: (f.surveyPhase ?? "").trim().slice(0, 100),
    source: f.source,
    fileIds: f.fileIds ?? [],
    createdBy: by,
    ...(f.createdAt ? { createdAt: f.createdAt } : {}),
    ...(f.clientRequestId ? { clientRequestId: f.clientRequestId } : {}),
  });
  const at = row.createdAt.toISOString();
  const held = !m.impRelease && !m.leftAt;
  const events: GateEvent[] = [
    {
      kind: "exceptionOpened",
      label: `Exception: ${f.type} ${f.pieces} pc${f.pieces === 1 ? "" : "s"}${m.impRelease ? "" : " — cargo on hold"}`,
      at,
      by,
      ...(f.detail ? { detail: f.detail } : {}),
      ...(f.clientRequestId ? { requestId: f.clientRequestId } : {}),
    },
  ];
  const clearOverride = m.overridden && held;
  if (clearOverride) {
    events.push({ kind: "overrideCleared", label: "Supervisor override cleared — a new exception was opened; the release gates count again", at, by });
  }
  await syncLine(tx, id, companyId, !!m.impRelease, events, by, clearOverride);
  return row;
}

/**
 * Resolves, in the caller's transaction, the Short exceptions a stripping tally of `container`
 * opened on the record — when that tally is voided, the shortage it recorded no longer stands.
 * Returns how many were resolved.
 */
export async function resolveTallyExceptionsInTx(tx: Tx, id: string, companyId: string, by: string, container: string, note: string) {
  const m = await lockMovement(tx, id, companyId);
  if (!m) return 0;
  const open = (await gateExceptionRepository.openForMovement(tx, id, companyId)).filter((e) => e.source === "tally" && e.container === container);
  const events: GateEvent[] = [];
  for (const e of open) {
    const row = await gateExceptionRepository.resolve(tx, e.id, id, companyId, by, note);
    if (row) events.push({ kind: "exceptionResolved", label: `Exception resolved: ${row.type} ${row.pieces} pc${row.pieces === 1 ? "" : "s"}`, at: new Date().toISOString(), by, detail: note });
  }
  if (events.length) await syncLine(tx, id, companyId, !!m.impRelease, events, by);
  return events.length;
}

class GateExceptionService {
  async create(id: string, companyId: string, userId: string, input: GateExceptionInput) {
    return (await this.createWithOutcome(id, companyId, userId, input)).movement;
  }

  // Records the exception. Floor mode (phones) sends an id with it (`clientRequestId`) and, when
  // it was recorded offline, the time on the phone (`recordedAt`, logged as recorded offline):
  // the same id sent again adds nothing ("already_recorded"), even when two copies arrive at once
  // (the movement lock, then the unique index, decide).
  async createWithOutcome(
    id: string,
    companyId: string,
    userId: string,
    input: GateExceptionInput,
  ): Promise<{ movement: GateMovementItem; outcome: ExceptionOutcome; notice: string }> {
    const type = (input?.type ?? "").trim();
    if (!(EXCEPTION_TYPES as readonly string[]).includes(type)) throw APIError.invalidArgument(`Type must be one of: ${EXCEPTION_TYPES.join(", ")}`);
    const pieces = input.pieces;
    if (!Number.isInteger(pieces) || pieces < 1 || pieces > MAX_PIECES) throw APIError.invalidArgument("Pieces must be a whole number of at least 1");
    const note = (input.note ?? "").trim();
    if (note.length > MAX_NOTE) throw APIError.invalidArgument(`The note is too long (at most ${MAX_NOTE} characters)`);
    const source = input.source === "survey" || input.source === "tally" ? input.source : "manual";
    const requestId = checkRequestId(input.clientRequestId);
    const now = new Date();
    const already = async () => {
      const prev = requestId ? await gateExceptionRepository.findByRequestId(db, id, companyId, requestId) : null;
      if (!prev) return null;
      return {
        movement: await gateMovementService.get(id, companyId),
        outcome: "already_recorded" as const,
        notice: `Exception (${prev.type} ${prev.pieces} pc${prev.pieces === 1 ? "" : "s"}) was already sent from this phone (${pragueHhmm(prev.createdAt)})`,
      };
    };
    // A replay is answered before its time is checked (as stamps and surveys are): an exception
    // the server stored but whose answer was lost may come back late or with a skewed clock.
    const known = await already();
    if (known) return known;
    const at = input.recordedAt ? acceptRecordedAt(input.recordedAt, now, { requestId }) : now;
    const fileIds = [...new Set(input.fileIds ?? [])];
    if (fileIds.length > MAX_FILES) throw APIError.invalidArgument(`At most ${MAX_FILES} photos per exception`);
    for (const f of fileIds) {
      if (!UUID.test(f) || !(await gateFileRepository.findById(f, id, companyId))) {
        throw APIError.invalidArgument("A photo does not belong to this gate record");
      }
    }
    const by = await userName(userId);
    let created: boolean;
    try {
      created = await db.transaction(async (tx) => {
        const m = await lockMovement(tx, id, companyId);
        if (!m) throw APIError.notFound("Gate movement not found");
        // A copy of this request that got the lock first has made it already.
        if (requestId && (await gateExceptionRepository.findByRequestId(tx, id, companyId, requestId))) return false;
        const detail = [note, input.recordedAt ? offlineDetail(at, now) : ""].filter(Boolean).join(" · ");
        await openExceptionInTx(tx, id, companyId, by, {
          type,
          pieces,
          note,
          container: input.container,
          surveyPhase: input.surveyPhase,
          source,
          fileIds,
          createdAt: at,
          ...(requestId ? { clientRequestId: requestId } : {}),
          ...(detail ? { detail } : {}),
        });
        return true;
      });
    } catch (err) {
      // Two copies of one request racing past the lock: the unique index lets one in.
      if (!isUniqueViolation(err) || !requestId) throw err;
      created = false;
    }
    if (!created) {
      const again = await already();
      if (again) return again;
    }
    const notice = input.recordedAt ? `Exception recorded — recorded offline at ${pragueHhmm(at)}` : "";
    return { movement: await gateMovementService.get(id, companyId), outcome: "recorded", notice };
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
