import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { and, eq, isNull, sql } from "drizzle-orm";
import { shipments } from "~encore/clients";
import { db } from "../db/db";
import { gateFileRepository } from "../repositories/gateFile.repository";
import { gateMovementRepository, type GateMovementRow } from "../repositories/gateMovement.repository";
import { reweighRepository } from "../repositories/reweigh.repository";
import { gateMovementTable, type GateEvent } from "../schemas/gateMovement.schema";
import type { GateMovementItem, GateReweighInput } from "../interfaces/gate.interfaces";
import { gateMovementService } from "./gateMovement.service";
import { houseContexts, tallyRequired } from "./houses";
import { acceptRecordedAt, checkRequestId, offlineDetail, pgCode, pragueHhmm } from "./offline";
import { kgText, MAX_REWEIGH_KG, pctText, reweighVariance } from "./reweigh";
import { userName } from "./users";

// Re-weighing of a position on receipt (LCL cargo: what the warehouse calls "VGM"). Any user may
// record one, at the gate or from a phone (offline queue: `recordedAt`, `clientRequestId`); it is
// compared with the declared gross weight and logged. A correction is a new weighing: the history
// stays and the latest counts. A weighing also turns the gate checklist's VGM icon green.

export type ReweighOutcome = "recorded" | "already_recorded";

const MAX_NOTE = 2_000;
const MAX_FILES = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** How long a weighing waits for the shipment's declared weight before using the gate figures. */
export const DECLARED_BUDGET_MS = 2_000;
const t = gateMovementTable;

// The declared gross weight: the shipment's total weight when it answers in time, else the gate
// figures (what the position was recorded with).
async function declaredWeight(m: GateMovementRow): Promise<{ kg: number | null; source: string }> {
  if (m.shipmentId) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const shipment = await Promise.race([
        shipments.shipmentGet({ shipmentId: m.shipmentId }).then((r) => r.shipment),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), DECLARED_BUDGET_MS);
        }),
      ]);
      const tons = shipment ? parseFloat(String(shipment.totalWeightTons ?? "").replace(",", ".")) : NaN;
      if (Number.isFinite(tons) && tons > 0) return { kg: Math.round(tons * 1000 * 1000) / 1000, source: "shipment" };
    } catch (err) {
      log.warn("warehouse: declared weight for the re-weigh not read from the shipment", { movementId: m.id, error: err instanceof Error ? err.message : String(err) });
    } finally {
      clearTimeout(timer);
    }
  }
  return m.weightKg > 0 ? { kg: m.weightKg, source: "gate" } : { kg: null, source: "" };
}

class ReweighService {
  async record(
    id: string,
    companyId: string,
    userId: string,
    input: GateReweighInput,
  ): Promise<{ movement: GateMovementItem; outcome: ReweighOutcome; notice: string }> {
    const kg = input?.weighedKg;
    if (typeof kg !== "number" || !Number.isFinite(kg) || kg <= 0 || kg > MAX_REWEIGH_KG) {
      throw APIError.invalidArgument(`Weighed weight must be a number of kg above 0 and at most ${MAX_REWEIGH_KG.toLocaleString("en-GB")}`);
    }
    const weighedKg = Math.round(kg * 1000) / 1000;
    const note = (input.note ?? "").trim();
    if (note.length > MAX_NOTE) throw APIError.invalidArgument(`The note is too long (at most ${MAX_NOTE} characters)`);
    const requestId = checkRequestId(input.clientRequestId);
    const already = async () => {
      const prev = requestId ? await reweighRepository.findByRequestId(id, companyId, requestId) : null;
      if (!prev) return null;
      return {
        movement: await gateMovementService.get(id, companyId),
        outcome: "already_recorded" as const,
        notice: `Re-weigh (${kgText(prev.weighedKg)}) was already sent from this phone (${pragueHhmm(prev.weighedAt)})`,
      };
    };
    const known = await already();
    if (known) return known;

    const m = await gateMovementRepository.findById(id, companyId);
    if (!m) throw APIError.notFound("Gate movement not found");
    if (m.impRelease || m.leftAt) throw APIError.failedPrecondition("The cargo already left the warehouse — it is not re-weighed any more");
    // The cargo must be here: an inbound arrival (gate-in / draft receipt), or the gate-in of the
    // import container it is stripped from. (Outgoing cargo without a container tally has no
    // arrival stamp of its own; it may be weighed any time before it leaves.)
    const house = (await houseContexts([id], companyId)).get(id);
    const tallied = m.visit === "výdej" && tallyRequired(house);
    const arrivedAt = m.visit === "výdej" ? (tallied ? house.container.gateInAt : null) : (m.gateIn ?? m.expDraft);
    const arrivedWhat = tallied ? `the gate-in of container ${house.container.number}` : "the gate-in";
    if (!arrivedAt && (m.visit !== "výdej" || tallied)) throw APIError.failedPrecondition(`The cargo has not arrived yet — re-weigh it after ${arrivedWhat}`);
    const now = new Date();
    const at = input.recordedAt ? acceptRecordedAt(input.recordedAt, now, { notBefore: arrivedAt, after: arrivedWhat }) : now;
    const fileIds = [...new Set(input.fileIds ?? [])];
    if (fileIds.length > MAX_FILES) throw APIError.invalidArgument(`At most ${MAX_FILES} photos per re-weigh`);
    for (const f of fileIds) {
      if (!UUID.test(f) || !(await gateFileRepository.findById(f, id, companyId))) throw APIError.invalidArgument("A photo does not belong to this gate record");
    }
    const declared = await declaredWeight(m);
    const v = reweighVariance(weighedKg, declared.kg);
    const by = await userName(userId);
    let created: Awaited<ReturnType<typeof reweighRepository.create>> | null = null;
    let newerExists = false;
    try {
      created = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select({ id: t.id })
          .from(t)
          .where(and(eq(t.id, id), eq(t.companyId, companyId), isNull(t.deletedAt)))
          .for("update");
        if (!locked) throw APIError.notFound("Gate movement not found");
        if (requestId && (await reweighRepository.findByRequestId(id, companyId, requestId, tx))) return null;
        const latest = await reweighRepository.latestForMovement(id, companyId, tx);
        newerExists = !!latest && latest.weighedAt.getTime() > at.getTime();
        const row = await reweighRepository.create(tx, {
          companyId,
          movementId: id,
          taskId: m.warehouseTaskId,
          weighedKg,
          declaredKg: declared.kg,
          declaredSource: declared.source,
          variancePct: v.pct,
          flagged: v.flagged,
          weighedBy: by,
          weighedAt: at,
          fileIds,
          note,
          ...(requestId ? { clientRequestId: requestId } : {}),
        });
        const compared = declared.kg ? ` (declared ${kgText(declared.kg)} · ${pctText(v.pct)}${v.flagged ? " — variance" : ""})` : "";
        const detail = [note, latest ? `was ${kgText(latest.weighedKg)}` : "", input.recordedAt ? offlineDetail(at, now) : ""].filter(Boolean).join(" · ");
        const event: GateEvent = {
          kind: "reweighed",
          label: `${latest ? "Re-weighed again" : "Re-weighed"} ${kgText(weighedKg)}${compared}`,
          at: at.toISOString(),
          by,
          ...(detail ? { detail } : {}),
          ...(requestId ? { requestId } : {}),
        };
        // The gate checklist's VGM icon is done once the cargo is weighed.
        await gateMovementRepository.conditionalUpdate(
          id,
          companyId,
          { checklist: sql`jsonb_set(${t.checklist}, '{vgm}', '"g"'::jsonb, true)` },
          [event],
          undefined,
          tx,
        );
        return row;
      });
    } catch (err) {
      if (pgCode(err) !== "23505" || !requestId) throw err;
    }
    if (!created) {
      const again = await already();
      if (again) return again;
    }
    const notices = [
      input.recordedAt ? `Re-weighed — recorded offline at ${pragueHhmm(at)}` : "",
      newerExists ? "Kept in history; a newer re-weigh counts" : "",
      v.flagged ? `More than 5 % off the declared weight (${pctText(v.pct)}) — inform operations` : "",
    ].filter(Boolean);
    return { movement: await gateMovementService.get(id, companyId), outcome: "recorded", notice: notices.join(" · ") };
  }
}

export const reweighService = new ReweighService();
