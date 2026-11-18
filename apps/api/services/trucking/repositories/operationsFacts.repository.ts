import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import { truckingConsignmentTable, type TruckingConsignmentRecord } from "../schemas/truckingConsignment.schema";
import { truckingExceptionTable, type TruckingExceptionRecord } from "../schemas/avizace.schema";
import { truckingOutboxTable } from "../schemas/truckingOutbox.schema";

// The grouped reads of Shipments → Managers' Trucking facts (services/operationsFacts.service.ts):
// one statement per family for all the jobs asked. Read only. The legs and trips come from the
// neighbours' repositories (legRepository.forConsignments, tripRepository.findMany).

const c = truckingConsignmentTable;
const e = truckingExceptionTable;
const o = truckingOutboxTable;

class OperationsFactsRepository {
  /** The jobs' consignments not cancelled and not Ready to bill (live rows), the ones still in play among them. */
  async consignmentsOf(companyId: string, shipmentIds: string[]): Promise<TruckingConsignmentRecord[]> {
    if (!shipmentIds.length) return [];
    return db
      .select()
      .from(c)
      .where(and(eq(c.companyId, companyId), inArray(c.shipmentId, shipmentIds), isNull(c.deletedAt), isNull(c.cancelledAt), isNull(c.readyToBillAt)));
  }

  /** The delivery exceptions of these consignments not closed (the partial index trucking_exception_open_idx). */
  async openExceptions(companyId: string, consignmentIds: string[]): Promise<TruckingExceptionRecord[]> {
    if (!consignmentIds.length) return [];
    return db
      .select()
      .from(e)
      .where(and(eq(e.companyId, companyId), inArray(e.consignmentId, consignmentIds), isNull(e.closedAt), isNull(e.deletedAt)));
  }

  /**
   * Per job, its updates not delivered in time, as the Consignments list's "Not sent to the job" counts them
   * (truckingOutboxRepository.unsentFor): pending longer than `minutes`, and failed for good.
   */
  async unsentCounts(companyId: string, shipmentIds: string[], minutes: number): Promise<Map<string, { waiting: number; failed: number }>> {
    if (!shipmentIds.length) return new Map();
    const rows = await db
      .select({
        shipmentId: o.shipmentId,
        waiting: sql<number>`count(*) FILTER (WHERE ${o.status} = 'pending' AND ${o.createdAt} < now() - make_interval(mins => ${minutes}))::int`,
        failed: sql<number>`count(*) FILTER (WHERE ${o.status} = 'failed')::int`,
      })
      .from(o)
      .where(and(eq(o.companyId, companyId), inArray(o.shipmentId, shipmentIds), inArray(o.status, ["pending", "failed"]), isNull(o.deletedAt)))
      .groupBy(o.shipmentId);
    return new Map(rows.map((r) => [r.shipmentId, { waiting: Number(r.waiting), failed: Number(r.failed) }]));
  }
}

export const operationsFactsRepository = new OperationsFactsRepository();
