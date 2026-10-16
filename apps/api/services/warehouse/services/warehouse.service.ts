import { APIError } from "encore.dev/api";
import { iso } from "../../../lib/db/serialize";
import { assertShipmentExists } from "../../../lib/shipmentRefs";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { warehouseSectionRepository } from "../repositories/warehouseSection.repository";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { MAX_PICKUP_ROWS, PICKUP_SECTION, pickupRowsFromInput, stripPickupSecrets } from "./pickupPin";
import { userName } from "./users";
import { reweighRepository } from "../repositories/reweigh.repository";
import { kgText, needsReweigh } from "./reweigh";
import { gateAdminService } from "./gateAdmin.service";
import type { NewWarehouseTaskRecord, WarehouseTaskRecord } from "../schemas/warehouseTask.schema";
import type { WarehouseSectionRecord } from "../schemas/warehouseSection.schema";
import type { Tx } from "../repositories/warehouseSection.repository";
import {
  WAREHOUSE_SECTIONS,
  type WarehouseSection,
  type WarehouseSectionItem,
  type WarehouseSectionSummaryItem,
  type WarehouseTaskItem,
  type WarehouseTaskPatch,
} from "../interfaces/interfaces";

export { formatWarehouseRef, warehouseRefYear } from "./warehouseRef";

/** Sections saved field by field (PATCH); pick-up keeps its own rows-only save. */
export const KEYED_SECTIONS = ["job", "customs", "invoicing"] as const;

// Keys of the Shipment Details ("job") section and the longest text each may hold.
const JOB_KEYS: Record<string, number> = {
  notes: 10_000,
  vgm_sent: 2_000,
  survey_sent: 2_000,
  remeasurement_sent: 2_000,
  inform_operations_sent: 2_000,
  remeasure_rows: 100_000,
};
const MAX_REMEASURE_ROWS = 200;
const MAX_KEYS_PER_SAVE = 10;
// Sections nothing in the app writes yet: any plain key, short text.
const OTHER_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const OTHER_MAX = 10_000;

const FIELD_LABELS: Record<string, string> = {
  notes: "notes",
  vgm_sent: "VGM sent",
  survey_sent: "survey sent",
  remeasurement_sent: "remeasurement sent",
  inform_operations_sent: "operations informed",
  remeasure_rows: "remeasured lines",
  remeasure_rows_saved_at: "remeasured lines saved",
};

export interface SectionKeyChange {
  key: string;
  /** New text value; "" clears the field. */
  value: string;
  /** The value the client last saw ("" = not set). The save is refused if it changed since. */
  expected: string;
}

// Why one change may not be saved; null when it may.
function badChange(section: string, c: SectionKeyChange): string | null {
  if (typeof c.value !== "string" || typeof c.expected !== "string") return `${c.key}: value and expected must be text`;
  if (section === "job") {
    const max = JOB_KEYS[c.key];
    if (max === undefined) return `Unknown field "${c.key}" for Shipment Details`;
    if (c.value.length > max) return `${FIELD_LABELS[c.key] ?? c.key} is too long (at most ${max} characters)`;
    if (c.key === "remeasure_rows" && c.value) {
      let rows: unknown;
      try {
        rows = JSON.parse(c.value);
      } catch {
        return "Remeasured lines must be a JSON list";
      }
      if (!Array.isArray(rows) || rows.length > MAX_REMEASURE_ROWS || rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))) {
        return `Remeasured lines must be a list of up to ${MAX_REMEASURE_ROWS} lines`;
      }
    }
    return null;
  }
  if (!OTHER_KEY.test(c.key)) return `Invalid field name "${c.key}"`;
  return c.value.length > OTHER_MAX ? `${c.key} is too long (at most ${OTHER_MAX} characters)` : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECTION_LABELS: Record<string, string> = { job: "Shipment Details", customs: "Customs", invoicing: "Invoicing" };
/** What "Mark as sent" records (the field is `<kind>_sent`). */
export const SENT_KINDS = ["vgm", "survey", "remeasurement", "inform_operations"] as const;
const MAX_SENT_NOTE = 2_000;

/** How the supplier e-mail records a send (see markSent). */
export interface MarkSentOptions {
  /** Extra fields of the sent value and its history entry (recipients, attachments, e-mail id). */
  entry?: Record<string, string>;
  /** History text instead of the field label, e.g. "VGM e-mailed to a@x.cz (3 photos)". */
  logLabel?: string;
  /** Runs in the same transaction, after the section is marked and the History line added. */
  after?: (tx: Tx) => Promise<void>;
}

function checkChanges(section: string, changes: SectionKeyChange[]) {
  const known = toSection(section);
  if (!(KEYED_SECTIONS as readonly string[]).includes(known)) {
    throw APIError.invalidArgument(`The ${known} section is not saved field by field. Must be one of: ${KEYED_SECTIONS.join(", ")}`);
  }
  if (!Array.isArray(changes) || !changes.length || changes.length > MAX_KEYS_PER_SAVE) {
    throw APIError.invalidArgument(`Send 1 to ${MAX_KEYS_PER_SAVE} changed fields`);
  }
  if (new Set(changes.map((c) => c.key)).size !== changes.length) throw APIError.invalidArgument("Each field may be sent once per save");
  for (const c of changes) {
    const bad = badChange(section, c);
    if (bad) throw APIError.invalidArgument(bad);
  }
}

// Saving the remeasured lines also records when they were saved (the "send the remeasurement"
// prompt compares it with the last send).
const savedExtras = (changes: SectionKeyChange[]): Record<string, string> =>
  changes.some((c) => c.key === "remeasure_rows") ? { remeasure_rows_saved_at: new Date().toISOString() } : {};

function settled(res: { row: WarehouseSectionRecord; conflicts: null } | { row: null; conflicts: string[] }) {
  if (res.row) return res.row;
  if (!res.conflicts.length) throw APIError.aborted("The section changed meanwhile — reload and save again");
  const fields = res.conflicts.map((k) => FIELD_LABELS[k] ?? k).join(", ");
  throw APIError.aborted(`Changed meanwhile: ${fields} — someone else saved this. Reload to see the latest and save again.`);
}

// When a "sent" field was last set: its JSON timestamp, or the plain time; null when not set.
function sentAt(v: string): string | null {
  if (!v) return null;
  try {
    const p: unknown = JSON.parse(v);
    if (p && typeof p === "object" && typeof (p as { timestamp?: unknown }).timestamp === "string") return (p as { timestamp: string }).timestamp;
  } catch {
    // plain time
  }
  return v;
}

/** A task row as the API returns it. */
export const toTaskItem = (r: WarehouseTaskRecord): WarehouseTaskItem => ({
  id: r.id,
  taskId: r.taskId,
  shipmentId: r.shipmentId,
  type: r.type,
  priority: r.priority,
  status: r.status,
  assignee: r.assignee,
  dueDate: r.dueDate,
  cargo: r.cargo,
  weight: r.weight,
  notes: r.notes,
  data: r.data,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// A path parameter can't be typed as a union in Encore, so the section is checked here.
export function toSection(section: string): WarehouseSection {
  const found = WAREHOUSE_SECTIONS.find((s) => s === section);
  if (!found) throw APIError.invalidArgument(`Unknown section; use one of: ${WAREHOUSE_SECTIONS.join(", ")}`);
  return found;
}

// The fields a task update carries, ready for the table; undefined ones are left as they are.
export function taskChanges(patch: WarehouseTaskPatch): Partial<NewWarehouseTaskRecord> {
  const { dueDate, ...rest } = patch;
  const out: Partial<NewWarehouseTaskRecord> = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  );
  if (dueDate !== undefined) {
    const d = dueDate.trim();
    if (d && !DATE.test(d)) throw APIError.invalidArgument("dueDate must be a date (yyyy-mm-dd)");
    out.dueDate = d || null;
  }
  return out;
}

class WarehouseService {
  async listAll(companyId: string): Promise<WarehouseTaskItem[]> {
    return (await warehouseTaskRepository.listAll(companyId)).map(toTaskItem);
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<WarehouseTaskItem[]> {
    // Not a shipment id: nothing (a uuid column can't be compared with it).
    if (!UUID.test(shipmentId)) return [];
    return (await warehouseTaskRepository.listByShipmentId(shipmentId, companyId)).map(toTaskItem);
  }

  async update(id: string, companyId: string, patch: WarehouseTaskPatch): Promise<WarehouseTaskItem> {
    const changes = taskChanges(patch);
    const task = UUID.test(id) ? await warehouseTaskRepository.update(id, companyId, changes) : null;
    if (!task) throw APIError.notFound("Warehouse task not found");
    return toTaskItem(task);
  }

  // Warehouse sections. They belong to the warehouse position (task) — linked to a shipment or
  // not; Shipments still reads and saves them by shipment id, which resolves to the shipment's
  // live position (or, with none, to the shipment's own row). The pick-up section stays keyed to
  // the shipment.

  /** A section by shipment id (the Shipments view): its position's row, else the shipment's own. */
  async getSection(shipmentId: string, section: string, companyId: string): Promise<WarehouseSectionRecord | null> {
    const known = toSection(section);
    // Not a shipment id: no section (a uuid column can't be compared with it).
    if (!UUID.test(shipmentId)) return null;
    if (known === PICKUP_SECTION) return warehouseSectionRepository.findPickup(shipmentId, companyId);
    const task = await warehouseTaskRepository.findLiveForShipment(companyId, shipmentId);
    const own = task ? await warehouseSectionRepository.findByTask(task.id, known, companyId) : null;
    return own ?? warehouseSectionRepository.findAdoptable(shipmentId, known, companyId);
  }

  /** A section of a position; before its first save, the row its shipment had (taken over then). */
  async getSectionByTask(taskId: string, section: string, companyId: string): Promise<WarehouseSectionRecord | null> {
    toSection(section);
    const task = await this.liveTask(taskId, companyId);
    if (section === PICKUP_SECTION) return task.shipmentId ? warehouseSectionRepository.findPickup(task.shipmentId, companyId) : null;
    const own = await warehouseSectionRepository.findByTask(task.id, section, companyId);
    if (own || !task.shipmentId) return own;
    return warehouseSectionRepository.findAdoptable(task.shipmentId, section, companyId);
  }

  private async liveTask(taskId: string, companyId: string) {
    if (!UUID.test(taskId)) throw APIError.notFound("Warehouse position not found");
    const task = await warehouseTaskRepository.findAny(taskId, companyId);
    if (!task || task.deletedAt) throw APIError.notFound("Warehouse position not found");
    return task;
  }

  // Saves only the changed fields of a section, each only if nobody changed it since the client
  // read it — two people saving different fields both keep their change, and a stale save of
  // the same field is refused with what changed. By shipment id (Shipments): the shipment's live
  // position's section when it has one; else the shipment's own row, whose first save checks the
  // shipment belongs to the caller's company (assertShipmentExists answers not_found otherwise).
  async patchSection(shipmentId: string, section: string, companyId: string, changes: SectionKeyChange[], userId = "") {
    checkChanges(section, changes);
    if (!shipmentId.trim()) throw APIError.invalidArgument("A shipment is required");
    if (!UUID.test(shipmentId)) throw APIError.invalidArgument("Not a shipment id");
    const task = await warehouseTaskRepository.findLiveForShipment(companyId, shipmentId);
    if (task) return this.patchSectionByTask(task.id, section, companyId, changes, userId);
    const res = await warehouseSectionRepository.patchKeys({ kind: "shipment", shipmentId }, section, companyId, changes, {
      // The shipment's first section row: the shipment must exist in the caller's company.
      onCreate: async () => {
        await assertShipmentExists(shipmentId);
      },
      extra: savedExtras(changes),
    });
    return settled(res);
  }

  // The same per-field save for a position (linked or stand-alone). The save is logged, in one
  // summarised event, on the position's live gate records (History).
  async patchSectionByTask(taskId: string, section: string, companyId: string, changes: SectionKeyChange[], userId = "") {
    checkChanges(section, changes);
    const task = await this.liveTask(taskId, companyId);
    const by = await userName(userId);
    const res = await warehouseSectionRepository.patchKeys(
      { kind: "task", taskId: task.id, shipmentId: task.shipmentId },
      section,
      companyId,
      changes,
      {
        extra: savedExtras(changes),
        after: (tx) =>
          gateMovementRepository.appendEventsForTask(
            task.id,
            companyId,
            [{ kind: "sectionSaved", label: `${SECTION_LABELS[section] ?? section} saved: ${changes.map((c) => FIELD_LABELS[c.key] ?? c.key).join(", ")}`, at: new Date().toISOString(), by }],
            tx,
          ),
      },
    );
    return settled(res);
  }

  // "Mark as sent" for a position: VGM, survey or remeasurement sent outside the app, or
  // operations informed. A resend is allowed: the field shows the latest and every send stays in
  // its history (`<field>_history`), logged on the position's gate records. The supplier e-mail
  // (emailSupplier.service) records its sends through here too, with `opts`: the recipients and
  // attachments in the entry, its own History text and its attempt settled in the same transaction.
  async markSent(taskId: string, what: string, note: string, companyId: string, userId: string, opts: MarkSentOptions = {}) {
    if (!(SENT_KINDS as readonly string[]).includes(what)) throw APIError.invalidArgument(`What was sent must be one of: ${SENT_KINDS.join(", ")}`);
    const text = (note ?? "").trim();
    if (text.length > MAX_SENT_NOTE) throw APIError.invalidArgument(`The note is too long (at most ${MAX_SENT_NOTE} characters)`);
    const task = await this.liveTask(taskId, companyId);
    const by = await userName(userId);
    const at = new Date().toISOString();
    const key = `${what}_sent`;
    // VGM sent: the weight sent is the warehouse's re-weighing (the latest of the position's live
    // gate record), recorded with the send. An LCL position not re-weighed yet is sent without one
    // and the log says so.
    const weighed: Record<string, string> = {};
    let vgmNote = "";
    if (what === "vgm") {
      const movementId = await gateMovementRepository.liveIdForTask(task.id, companyId);
      const m = movementId ? await gateMovementRepository.findById(movementId, companyId) : null;
      const rw = m ? await reweighRepository.latestForMovement(m.id, companyId) : null;
      if (rw) {
        weighed.weighedKg = String(rw.weighedKg);
        weighed.weighedAt = rw.weighedAt.toISOString();
        vgmNote = `re-weighed ${kgText(rw.weighedKg)}`;
      } else if (m && needsReweigh(m)) {
        vgmNote = "not re-weighed yet";
      }
    }
    // Operations informed keeps the plain time Shipments shows; the others keep time and note.
    const extra = opts.entry ?? {};
    const value = what === "inform_operations" ? at : JSON.stringify({ timestamp: at, note: text, by, ...weighed, ...extra });
    const label = opts.logLabel ?? FIELD_LABELS[key] ?? key;
    return warehouseSectionRepository.markSent(
      { kind: "task", taskId: task.id, shipmentId: task.shipmentId },
      "job",
      companyId,
      key,
      value,
      { at, note: text, by, ...weighed, ...extra },
      async (tx) => {
        await gateMovementRepository.appendEventsForTask(
          task.id,
          companyId,
          [{ kind: "sectionSent", label: `Shipment Details: ${label}${vgmNote ? ` (${vgmNote})` : ""}`, at, by, ...(text ? { detail: text } : {}) }],
          tx,
        );
        await opts.after?.(tx);
      },
    );
  }

  // Per position: what the remeasurement worklist needs from its Shipment Details.
  async sectionSummary(companyId: string): Promise<WarehouseSectionSummaryItem[]> {
    const rows = await warehouseSectionRepository.listForTasks(companyId, "job");
    return rows.map((r) => {
      const d = r.data && typeof r.data === "object" && !Array.isArray(r.data) ? (r.data as Record<string, unknown>) : {};
      const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
      let lines = 0;
      try {
        const parsed: unknown = JSON.parse(str("remeasure_rows") || "[]");
        lines = Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        lines = 0;
      }
      return {
        taskId: r.taskId!,
        hasLines: lines > 0,
        lineCount: lines,
        linesSavedAt: str("remeasure_rows_saved_at") || null,
        remeasurementSentAt: sentAt(str("remeasurement_sent")),
        operationsInformedAt: sentAt(str("inform_operations_sent")),
        hasNotes: !!str("notes").trim(),
        version: r.version,
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  }

  // The pick-up save from Shipments: only the haulier / plate / driver rows. The PIN, its tries
  // and history are the server's (see gateMovementService.generatePickupPin) and stay as stored,
  // whatever the client sends.
  async upsertPickupRows(shipmentId: string, companyId: string, data: unknown) {
    if (!UUID.test(shipmentId)) throw APIError.invalidArgument("Not a shipment id");
    const rows = pickupRowsFromInput(data);
    if (!rows) {
      throw APIError.invalidArgument(`Pick-up rows must be a list of up to ${MAX_PICKUP_ROWS} rows with haulier, license plate and driver as text`);
    }
    // The shipment's first pick-up save: the shipment must exist in the caller's company.
    if (!(await warehouseSectionRepository.findPickup(shipmentId, companyId))) await assertShipmentExists(shipmentId);
    return warehouseSectionRepository.upsertPickupRows(shipmentId, companyId, rows);
  }

  // A shipment deleted in Shipments (the shipmentDeleted subscription; runs as the system and is
  // safe to run again). Handled cargo is kept: a position the gate never stamped is removed the
  // normal way (its gate records archived, reason "Shipment deleted in Shipments"); a stamped one
  // stays, with a "Shipment deleted" event on its gate records. What the gate still owed the
  // shipment is cancelled. With no position left, the shipment's pick-up row and the section rows
  // no position owns are retired too.
  async retireShipment(shipmentId: string, companyId: string): Promise<void> {
    if (!UUID.test(shipmentId)) return;
    const { kept } = await gateAdminService.retireForDeletedShipment(shipmentId, companyId);
    if (!kept.length) await warehouseSectionRepository.softDeleteForShipment(shipmentId, companyId);
  }
}

export const warehouseService = new WarehouseService();

/** A stored section as the API returns it (with its version, for per-field saves). */
export function sectionItem(row: WarehouseSectionRecord): WarehouseSectionItem {
  return {
    id: row.id,
    taskId: row.taskId ?? null,
    shipmentId: row.shipmentId ?? null,
    section: row.section,
    // The pick-up PIN (and its hash) never leaves the server in a section.
    data: row.section === PICKUP_SECTION ? stripPickupSecrets(row.data) : row.data,
    version: row.version,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
