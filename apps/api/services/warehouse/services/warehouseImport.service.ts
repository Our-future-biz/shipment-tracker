import { APIError } from "encore.dev/api";
import { sql } from "drizzle-orm";
import { shipments } from "~encore/clients";
import { db } from "../db/db";
import { gateMovementRepository, hasStamp } from "../repositories/gateMovement.repository";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { gateMovementTable, type GateEvent, type GateReleaseLine, type NewGateMovementRecord } from "../schemas/gateMovement.schema";
import type { WarehouseTaskRecord } from "../schemas/warehouseTask.schema";
import type { GateMovementInput, WarehouseImportResult } from "../interfaces/gate.interfaces";
import { CUSTOMS_MODES, CUSTOMS_STATUSES, customsLine } from "./customs";
import { DEFAULT_CHECKLIST, defaultReleaseGates, gateMovementService, normalizeLegs } from "./gateMovement.service";
import { PICKUP_PIN_GATE } from "./pickupPin";
import { isManager, userName } from "./users";

// Bringing shipments into the warehouse. Each shipment becomes a position (WCZ reference) and
// its gate record in ONE transaction, so there is never a position without its gate record or
// a reference used for nothing. The gate record copies the shipment's data once; "Refresh from
// shipment" copies it again on request, and the customs status follows the shipment on its own
// (shipmentFollow.service).

export type Shipment = Awaited<ReturnType<typeof shipments.shipmentGet>>["shipment"];

/** Shipments one import request may carry. */
export const MAX_IMPORT = 200;
const PARALLEL_FETCHES = 4;

/*
 * How a shipment maps to the gate record (also on the warehouse Read me tab):
 *
 *   handling        Export when the trade direction says export, else Import.
 *   visit           Import cargo leaves through the gate (výdej), export cargo arrives (příjem).
 *   operation type  Full Load by sea or rail, or with a container number → FCL stripping (Import)
 *                   or FCL stuffing (Export); Consolidation → LCL consolidation; Project
 *                   Shipment, or Full Load by road or air without a container → Cargo storage;
 *                   no load type → LCL consolidation.
 *   customs mode    The shipment's customs procedure when the gate knows it (SCP, JSD, T1, T2L,
 *                   ATA Carnet, RDT, C-Goods), else SCP.
 *   customs status  The shipment's customs status when valid, else the first status. It drives
 *                   the Customs line of the release gates and keeps following the shipment.
 *   release gates   The set for the operation type; import (outbound) records of a shipment
 *                   also wait for the pick-up PIN.
 */
export type ShipmentMappingInput = Partial<Pick<Shipment, "tradeDirection" | "loadType" | "freightMode" | "containerNumber" | "customsProcedure" | "customsStatus">>;

export function gateFieldsFromShipment(s: ShipmentMappingInput) {
  const handling = /export/i.test(s.tradeDirection ?? "") ? "Export" : "Import";
  const load = (s.loadType ?? "").trim();
  const box = /sea|rail/i.test(s.freightMode ?? "") || !!(s.containerNumber ?? "").trim();
  let operationType = "LCL consolidation";
  if (/^full/i.test(load) && box) operationType = handling === "Export" ? "FCL stuffing" : "FCL stripping";
  else if (/consol/i.test(load)) operationType = "LCL consolidation";
  else if (/project/i.test(load) || /^full/i.test(load)) operationType = "Cargo storage";
  const procedure = (s.customsProcedure ?? "").trim().toLowerCase();
  const customsMode = CUSTOMS_MODES.find((m) => m.toLowerCase() === procedure) ?? "SCP";
  const customsStatus = s.customsStatus && CUSTOMS_STATUSES.includes(s.customsStatus) ? s.customsStatus : CUSTOMS_STATUSES[0]!;
  return { handling, visit: handling === "Import" ? "výdej" : "příjem", operationType, customsMode, customsStatus };
}

// The shipment's data copied onto its gate record (and again by "Refresh from shipment").
export function copiedFields(s: Partial<Shipment>) {
  return {
    customer: s.customer ?? "",
    customerRef: s.customerReference ?? "",
    customerContact: s.customerPic ?? "",
    shipmentOwner: s.personInCharge ?? "",
    colli: parseInt(s.pcs ?? "", 10) || 0,
    packing: s.typeOfPackages ?? "",
    weightKg: s.totalWeightTons ? Math.round(parseFloat(s.totalWeightTons) * 1000) || 0 : 0,
    measureCbm: s.totalVolumeCbm ? parseFloat(s.totalVolumeCbm) || 0 : 0,
    freightMode: s.freightMode ?? "",
    loadType: s.loadType ?? "",
    commodity: s.cargoDescription ?? "",
    jobNumber: s.jobNumber ?? "",
    pol: s.pol ?? "",
    pod: s.pod ?? "",
    etd: s.estimatedDeparture ?? "",
    eta: s.estimatedArrival ?? "",
    vessel: s.vessel ?? "",
    voyage: s.voyage ?? "",
    containerNumber: s.containerNumber ?? "",
    sealNumber: s.sealNumber ?? "",
    bookingNumber: s.bookingNumber ?? "",
    hblNumber: s.houseBolNumber ?? "",
    mblNumber: s.masterBolNumber ?? "",
  };
}

const FIELD_LABELS: Record<string, string> = {
  customer: "customer",
  customerRef: "customer ref",
  customerContact: "customer contact",
  shipmentOwner: "shipment owner",
  colli: "pieces",
  packing: "packing",
  weightKg: "weight",
  measureCbm: "measure",
  freightMode: "freight mode",
  loadType: "load type",
  commodity: "commodity",
  jobNumber: "job number",
  pol: "POL",
  pod: "POD",
  etd: "ETD",
  eta: "ETA",
  vessel: "vessel",
  voyage: "voyage",
  containerNumber: "container",
  sealNumber: "seal",
  bookingNumber: "booking",
  hblNumber: "HBL",
  mblNumber: "MBL",
};

// Cargo figures and container / seal the gate may have corrected at the gate. Once the record
// has a stamp, a refresh fills them only while blank; a different value is reported as
// "differs from shipment" and kept.
const GATE_CHECKED: ReadonlySet<string> = new Set(["colli", "weightKg", "measureCbm", "packing", "containerNumber", "sealNumber"]);
const isBlank = (v: unknown) => v === null || v === undefined || v === "" || v === 0;
const shown = (v: unknown) => {
  const t = isBlank(v) ? "—" : String(v);
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
};

// The gate record of a shipment's position, as it is stored.
export function linkedRecord(companyId: string, task: Pick<WarehouseTaskRecord, "id" | "taskId">, s: Partial<Shipment>, by: string, now: Date): NewGateMovementRecord {
  const g = gateFieldsFromShipment(s);
  const event: GateEvent = {
    kind: "created",
    label: `Created from shipment ${s.jobNumber || "—"} as ${task.taskId}`,
    at: now.toISOString(),
    by,
    detail: `${g.handling} · ${g.operationType} · ${g.customsMode}`,
  };
  return {
    companyId,
    gateRef: task.taskId,
    warehouseTaskId: task.id,
    ...g,
    ...copiedFields(s),
    transportLegs: normalizeLegs([]),
    checklist: DEFAULT_CHECKLIST,
    // Import rows are outbound and linked to the task's shipment: they wait for the pick-up PIN.
    releaseGates: defaultReleaseGates(g.handling, g.operationType, g.customsStatus, g.handling === "Import"),
    events: [event],
    updatedBy: by,
    shipmentCheckedAt: now,
  };
}

const reasonOf = (err: unknown) =>
  err instanceof APIError && err.code === "not_found" ? "Shipment not found" : err instanceof Error ? err.message : String(err);
const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "23505" || (err as { cause?: { code?: string } })?.cause?.code === "23505";

// Reads shipments, at most PARALLEL_FETCHES at a time, with the caller's access.
async function fetchShipments(ids: string[]) {
  const out = new Map<string, { shipment: Shipment } | { error: unknown }>();
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        out.set(id, { shipment: (await shipments.shipmentGet({ shipmentId: id })).shipment });
      } catch (error) {
        out.set(id, { error });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_FETCHES, ids.length) }, worker));
  return out;
}

class WarehouseImportService {
  // One shipment into the warehouse: its position and gate record in one transaction. A
  // shipment already in the warehouse keeps its position (created: false); if that position
  // never had a gate record, it gets one now.
  async importOne(companyId: string, by: string, s: Shipment, now = new Date()) {
    try {
      return await db.transaction(async (tx) => {
        const { task, created } = await warehouseTaskRepository.createInTx(tx, companyId, s.id, now);
        let movementId: string | null;
        if (created || !(await gateMovementRepository.taskHasMovement(task.id, tx))) {
          movementId = (await gateMovementRepository.create(linkedRecord(companyId, task, s, by, now), tx)).id;
        } else {
          movementId = await gateMovementRepository.liveIdForTask(task.id, tx);
        }
        return { task, created, movementId };
      });
    } catch (err) {
      // Added by another path at the same moment: it is in the warehouse.
      if (!isUniqueViolation(err)) throw err;
      const task = await warehouseTaskRepository.findLiveForShipment(companyId, s.id);
      if (!task) throw err;
      return { task, created: false, movementId: await gateMovementRepository.liveIdForTask(task.id) };
    }
  }

  // Imports shipments in one request: each is read from Shipments (a few at a time), then gets
  // its position and gate record. One result per shipment, in the order sent; a shipment that
  // cannot be read fails with the reason and uses no reference.
  async importShipments(companyId: string, userId: string, shipmentIds: string[]): Promise<WarehouseImportResult[]> {
    const ids = [...new Set((shipmentIds ?? []).map((id) => id.trim()).filter(Boolean))];
    if (!ids.length) throw APIError.invalidArgument("Choose at least one shipment");
    if (ids.length > MAX_IMPORT) throw APIError.invalidArgument(`At most ${MAX_IMPORT} shipments per import`);
    const by = await userName(userId);
    const fetched = await fetchShipments(ids);
    const results: WarehouseImportResult[] = [];
    for (const shipmentId of ids) {
      const f = fetched.get(shipmentId)!;
      const base = { shipmentId, jobNumber: "", taskId: null, ref: "", movementId: null, reason: "" };
      if ("error" in f) {
        results.push({ ...base, outcome: "failed", reason: reasonOf(f.error) });
        continue;
      }
      try {
        const r = await this.importOne(companyId, by, f.shipment);
        results.push({
          ...base,
          jobNumber: f.shipment.jobNumber ?? "",
          outcome: r.created ? "created" : "already",
          taskId: r.task.id,
          ref: r.task.taskId,
          movementId: r.movementId,
        });
      } catch (err) {
        results.push({ ...base, jobNumber: f.shipment.jobNumber ?? "", outcome: "failed", reason: reasonOf(err) });
      }
    }
    return results;
  }

  // "Create new": a position of its own (WCZ reference, no shipment) and its gate record in one
  // transaction. The record is checked and filled in before the reference is taken.
  async createPosition(companyId: string, userId: string, input: GateMovementInput) {
    const handling = input.handling === "Export" ? "Export" : "Import";
    const record = await gateMovementService.buildRecord(companyId, userId, {
      ...input,
      gateRef: "(new position)",
      warehouseTaskId: undefined,
      pin: undefined,
      // A job's customs status is kept only when the gate knows it; otherwise the gate default applies.
      customsStatus: input.customsStatus && CUSTOMS_STATUSES.includes(input.customsStatus) ? input.customsStatus : undefined,
      handling,
      // Import cargo leaves through the gate, export cargo arrives — as for shipment positions.
      visit: handling === "Import" ? "výdej" : "příjem",
    });
    const { task, movementId } = await db.transaction(async (tx) => {
      const { task } = await warehouseTaskRepository.createInTx(tx, companyId, null);
      const row = await gateMovementRepository.create({ ...record, gateRef: task.taskId, warehouseTaskId: task.id }, tx);
      return { task, movementId: row.id };
    });
    return { task, movement: await gateMovementService.get(movementId, companyId) };
  }

  // Copies the shipment's data onto its gate record again (any user, logged with what changed,
  // old → new). Once the record has a stamp, cargo figures, container and seal the gate may have
  // corrected are filled only while blank; differing ones are kept and reported (`differs`).
  // Operation type and customs mode are mapped again only while the record has no stamp; a new
  // operation type rebuilds the release gates, keeping the ticks of lines that stay and the
  // Pick-up PIN line. The customs status follows the shipment until the release.
  async refreshFromShipment(id: string, companyId: string, userId: string) {
    const m = await gateMovementRepository.findById(id, companyId);
    if (!m) throw APIError.notFound("Gate movement not found");
    if (!m.shipmentId) throw APIError.failedPrecondition("This record is not linked to a shipment");
    const { shipment } = await shipments.shipmentGet({ shipmentId: m.shipmentId });
    const now = new Date();
    const changes: Partial<NewGateMovementRecord> = {};
    const names: string[] = [];
    const details: string[] = [];
    const differs: string[] = [];
    const stamped = hasStamp(m);
    const copied = copiedFields(shipment);
    for (const [k, v] of Object.entries(copied) as [keyof typeof copied, string | number][]) {
      if (m[k] === v) continue;
      const label = FIELD_LABELS[k] ?? k;
      if (stamped && GATE_CHECKED.has(k) && !isBlank(m[k])) {
        differs.push(`${label}: gate ${shown(m[k])}, shipment ${shown(v)}`);
        continue;
      }
      (changes as Record<string, unknown>)[k] = v;
      names.push(label);
      details.push(`${label}: ${shown(m[k])} → ${shown(v)}`);
    }

    const mapped = gateFieldsFromShipment({ ...shipment, tradeDirection: m.handling });
    let customsStatus = m.customsStatus;
    if (!m.impRelease && CUSTOMS_STATUSES.includes(shipment.customsStatus) && shipment.customsStatus !== m.customsStatus) {
      customsStatus = changes.customsStatus = shipment.customsStatus;
      names.push("customs status");
      details.push(`customs status: ${shown(m.customsStatus)} → ${shown(shipment.customsStatus)}`);
    }
    let gates: GateReleaseLine[] = m.releaseGates;
    if (!hasStamp(m)) {
      if (mapped.customsMode !== m.customsMode) {
        changes.customsMode = mapped.customsMode;
        names.push("customs mode");
        details.push(`customs mode: ${shown(m.customsMode)} → ${shown(mapped.customsMode)}`);
      }
      if (mapped.operationType !== m.operationType) {
        changes.operationType = mapped.operationType;
        names.push(`operation type ${mapped.operationType} (release gates rebuilt)`);
        details.push(`operation type: ${shown(m.operationType)} → ${shown(mapped.operationType)}`);
        const pickup = m.releaseGates.find((g) => g.g === PICKUP_PIN_GATE);
        gates = defaultReleaseGates(m.handling, mapped.operationType, customsStatus).map((line) => {
          const old = m.releaseGates.find((x) => x.g === line.g);
          return old && line.g !== "Customs" ? { ...line, s: old.s, note: old.note } : line;
        });
        if (pickup) gates.push(pickup);
      }
    }
    if (customsStatus !== m.customsStatus) {
      gates = gates.some((g) => g.g === "Customs") ? gates.map((g) => (g.g === "Customs" ? customsLine(customsStatus) : g)) : [...gates, customsLine(customsStatus)];
    }
    if (gates !== m.releaseGates) changes.releaseGates = gates;

    const by = await userName(userId);
    const t = gateMovementTable;
    const row = await gateMovementRepository.conditionalUpdate(
      id,
      companyId,
      { ...changes, shipmentCheckedAt: now, ...(names.length ? { updatedBy: by } : {}) },
      [
        {
          kind: "refreshedFromShipment",
          label: names.length ? `Refreshed from shipment: ${names.join(", ")}` : "Refreshed from shipment: no changes",
          at: now.toISOString(),
          by,
          ...(details.length || differs.length
            ? { detail: [...details, ...differs.map((d) => `kept (differs from shipment) — ${d}`)].join("; ").slice(0, 2000) }
            : {}),
        },
      ],
      sql`date_trunc('milliseconds', ${t.updatedAt}) = ${m.updatedAt.toISOString()}::timestamptz`,
    );
    if (!row) throw APIError.aborted("The record changed meanwhile — refresh again");
    return { movement: await gateMovementService.get(id, companyId), changed: names, differs };
  }

  // Positions of shipments that have no gate record (made before every import created one):
  // each gets its record from the shipment. Manager only. A shipment that cannot be read is
  // reported and gets no blank record.
  async repairMissingRows(companyId: string, userId: string, role: string) {
    if (!isManager(role)) throw APIError.permissionDenied("Only a manager can do this");
    const tasks = await gateMovementRepository.tasksWithoutMovement(companyId);
    const by = await userName(userId);
    const fetched = await fetchShipments([...new Set(tasks.map((t) => t.shipmentId!))]);
    let created = 0;
    const failed: { taskId: string; ref: string; reason: string }[] = [];
    for (const task of tasks) {
      const f = fetched.get(task.shipmentId!)!;
      if ("error" in f) {
        failed.push({ taskId: task.id, ref: task.taskId, reason: reasonOf(f.error) });
        continue;
      }
      const now = new Date();
      const made = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`warehouse_ref:${companyId}`}))`);
        if (await gateMovementRepository.taskHasMovement(task.id, tx)) return false;
        await gateMovementRepository.create(linkedRecord(companyId, task, f.shipment, by, now), tx);
        return true;
      });
      if (made) created++;
    }
    return { created, failed };
  }
}

export const warehouseImportService = new WarehouseImportService();
