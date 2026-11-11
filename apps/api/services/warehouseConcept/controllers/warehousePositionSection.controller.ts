import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { sectionItem, warehouseService, type SectionKeyChange } from "../services/warehouse.service";
import type { WarehouseConceptSectionItem, WarehouseSectionSummaryItem } from "../interfaces/interfaces";

// Sections of a warehouse POSITION (task) — linked to a shipment or stand-alone. By shipment,
// /warehouse-concept/sections/:shipmentId/:section (this service) resolves to the same rows.
// /warehouse/sections/:shipmentId/:section is the normal Warehouse service's, in its own
// database (since the concepts were split): what is saved there is not one of these rows.

interface PositionSectionGetRequest {
  taskId: string;
  section: string;
}

interface PositionSectionResponse {
  section: WarehouseConceptSectionItem | null;
}

// A section of a position; before its first save, the row its shipment had (if any).
export const warehousePositionSectionGet = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-concept/positions/:taskId/sections/:section" },
  async ({ taskId, section }: PositionSectionGetRequest): Promise<PositionSectionResponse> => {
    const row = await warehouseService.getSectionByTask(taskId, section, getAuthData()!.companyID);
    return { section: row ? sectionItem(row) : null };
  },
);

interface PositionSectionPatchRequest {
  taskId: string;
  section: string;
  /**
   * The fields to save (1–10), each with the value the client last saw in `expected` ("" = not
   * set). Fields not listed are left as stored.
   */
  changes: SectionKeyChange[];
}

// Saves changed fields of a position's section (Shipment Details: notes, remeasured lines). A
// field someone else changed since the client read it is refused with "Changed meanwhile …
// reload" (aborted); different fields saved at the same time both stay. Logged on the position's
// gate records.
export const warehousePositionSectionPatch = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse-concept/positions/:taskId/sections/:section" },
  async ({ taskId, section, changes }: PositionSectionPatchRequest): Promise<{ section: WarehouseConceptSectionItem }> => {
    const { companyID, userID } = getAuthData()!;
    return { section: sectionItem(await warehouseService.patchSectionByTask(taskId, section, companyID, changes, userID)) };
  },
);

interface PositionMarkSentRequest {
  taskId: string;
  /** vgm | survey | remeasurement | inform_operations */
  what: string;
  note?: string;
}

interface PositionMarkSentResponse {
  section: WarehouseConceptSectionItem;
  /**
   * Inform Operations of a position of a shipment: the e-mails tagged in the shipment's chat
   * (Person in Charge, Holiday Cover; empty when nobody is set). Null for anything else, and for a
   * stand-alone position (no shipment, no chat).
   */
  tagged: string[] | null;
}

// "Mark as sent" (VGM / survey / remeasurement sent outside the app) or "Inform Operations" for a
// position. Nothing is e-mailed. A resend is allowed and kept in the history; logged. Inform
// Operations also posts "Cargo has been remeasured by the warehouse" to the shipment's chat, tagging
// its Person in Charge and Holiday Cover - together with the record, or neither.
export const warehousePositionMarkSent = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-concept/positions/:taskId/mark-sent" },
  async ({ taskId, what, note }: PositionMarkSentRequest): Promise<PositionMarkSentResponse> => {
    const { companyID, userID } = getAuthData()!;
    if (what === "inform_operations") {
      const { row, tagged } = await warehouseService.informOperations(taskId, note ?? "", companyID, userID);
      return { section: sectionItem(row), tagged };
    }
    return { section: sectionItem(await warehouseService.markSent(taskId, what, note ?? "", companyID, userID)), tagged: null };
  },
);

// Per position: remeasured lines saved, last remeasurement sent, operations informed (worklist).
export const warehouseSectionSummary = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-concept/section-summary" },
  async (): Promise<{ positions: WarehouseSectionSummaryItem[] }> => {
    return { positions: await warehouseService.sectionSummary(getAuthData()!.companyID) };
  },
);
