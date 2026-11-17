import { shipments } from "~encore/clients";
import { mainSearchNumber } from "../../../lib/mainSearch";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import type { SearchWarehouseResponse, WarehousePage } from "../interfaces/interfaces";

// A reference typed with the warehouse's letters, the Warehouse Concept's (WCZ…) or none: its
// number. The way a job number is found whatever its letters (WCZ2026001 finds WHCZ2026001).
const REFERENCE_WORD = /^(?:WHCZ|WCZ)?([0-9]+)$/;

/** The number of a warehouse reference typed as `text` (mainSearchNumber's), or null for other text. */
export function warehouseRefDigits(text: string): string | null {
  return REFERENCE_WORD.exec(text)?.[1] ?? null;
}

/**
 * The Warehouse page a shipment is on, by its two dates (as the web's lists take it): released →
 * Out Warehouse, taken in → Stock, otherwise In Warehouse.
 */
export function warehousePageOf(job: { warehouseReceivedDate: string | null; warehouseReleasedDate: string | null }): WarehousePage {
  if (job.warehouseReleasedDate) return "out";
  return job.warehouseReceivedDate ? "stock" : "in";
}

/**
 * The main search in the warehouse: the records of the company's shipments whose reference holds
 * what was typed (from 4 characters, spaces left out, in any case) or is that number typed with
 * other letters or none, each with its job - asked of the shipments service, with the caller's
 * company - and the page the shipment is on. A record whose job is gone is left out.
 */
export async function searchWarehouseMain(companyId: string, q: string, limit: number): Promise<SearchWarehouseResponse> {
  const text = mainSearchNumber(q);
  if (!text) return { items: [], total: 0 };
  const { rows, total } = await warehouseTaskRepository.searchMain(companyId, text, warehouseRefDigits(text), limit);
  const ids = [...new Set(rows.flatMap((r) => (r.shipmentId ? [r.shipmentId] : [])))];
  const { shipments: jobs } = ids.length ? await shipments._internalShipmentBasics({ ids }) : { shipments: [] };
  const jobOf = new Map(jobs.map((j) => [j.id, j]));
  return {
    items: rows.flatMap((r) => {
      const job = r.shipmentId ? jobOf.get(r.shipmentId) : undefined;
      return job ? [{ id: r.id, reference: r.taskId, shipmentId: job.id, jobNumber: job.jobNumber, customer: job.customer, page: warehousePageOf(job) }] : [];
    }),
    total,
  };
}
