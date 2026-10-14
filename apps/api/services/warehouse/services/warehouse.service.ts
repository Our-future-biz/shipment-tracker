import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { APIError } from "encore.dev/api";
import { shipments } from "~encore/clients";
import { warehouseSectionRepository } from "../repositories/warehouseSection.repository";
import { MAX_PICKUP_ROWS, pickupRowsFromInput } from "./pickupPin";
import type { WarehouseSectionRecord } from "../schemas/warehouseSection.schema";
import type { WarehouseSectionItem } from "../interfaces/interfaces";

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

class WarehouseService {
  async listAll(companyId: string) {
    return warehouseTaskRepository.listAll(companyId);
  }

  async listByShipmentId(shipmentId: string, companyId: string) {
    return warehouseTaskRepository.listByShipmentId(shipmentId, companyId);
  }

  async update(id: string, companyId: string, data: Record<string, unknown>) {
    return warehouseTaskRepository.update(id, companyId, data);
  }

  // Warehouse sections
  async getSection(shipmentId: string, section: string, companyId: string) {
    return warehouseSectionRepository.findByShipmentAndSection(shipmentId, section, companyId);
  }

  // Saves only the changed fields of a section, each only if nobody changed it since the client
  // read it — two people saving different fields both keep their change, and a stale save of
  // the same field is refused with what changed. The first save of a section checks the
  // shipment belongs to the caller's company (shipmentGet answers not_found otherwise).
  async patchSection(shipmentId: string, section: string, companyId: string, changes: SectionKeyChange[]) {
    if (!(KEYED_SECTIONS as readonly string[]).includes(section)) {
      throw APIError.invalidArgument(`Section "${section}" is not saved field by field. Must be one of: ${KEYED_SECTIONS.join(", ")}`);
    }
    if (!shipmentId.trim()) throw APIError.invalidArgument("A shipment is required");
    if (!Array.isArray(changes) || !changes.length || changes.length > MAX_KEYS_PER_SAVE) {
      throw APIError.invalidArgument(`Send 1 to ${MAX_KEYS_PER_SAVE} changed fields`);
    }
    if (new Set(changes.map((c) => c.key)).size !== changes.length) throw APIError.invalidArgument("Each field may be sent once per save");
    for (const c of changes) {
      const bad = badChange(section, c);
      if (bad) throw APIError.invalidArgument(bad);
    }
    const res = await warehouseSectionRepository.patchKeys(shipmentId, section, companyId, changes, async () => {
      await shipments.shipmentGet({ shipmentId });
    });
    if (res.row) return res.row;
    if (!res.conflicts.length) throw APIError.aborted("The section changed meanwhile — reload and save again");
    const fields = res.conflicts.map((k) => FIELD_LABELS[k] ?? k).join(", ");
    throw APIError.aborted(`Changed meanwhile: ${fields} — someone else saved this. Reload to see the latest and save again.`);
  }

  // The pick-up save from Shipments: only the haulier / plate / driver rows. The PIN, its tries
  // and history are the server's (see gateMovementService.generatePickupPin) and stay as stored,
  // whatever the client sends.
  async upsertPickupRows(shipmentId: string, companyId: string, data: unknown) {
    const rows = pickupRowsFromInput(data);
    if (!rows) {
      throw APIError.invalidArgument(`Pick-up rows must be a list of up to ${MAX_PICKUP_ROWS} rows with haulier, license plate and driver as text`);
    }
    return warehouseSectionRepository.upsertPickupRows(shipmentId, companyId, rows);
  }
}

export const warehouseService = new WarehouseService();

/** A stored section as the API returns it (with its version, for per-field saves). */
export function sectionItem(row: WarehouseSectionRecord): WarehouseSectionItem {
  return {
    id: row.id,
    shipmentId: row.shipmentId,
    section: row.section,
    data: row.data,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
