import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";

// What the master jobs list needs of the houses of many master jobs at once (mock test council n31, n32): the
// Load Types and Freight Modes on them, so a plain MCZ is judged by all its houses - not only the shipments a
// page has loaded - and a master job with no Freight Mode is named by its houses' mode. The houses are the
// live shipments linked to it, as the link rule reads them (repositories/shipment.repository findByMasterJobId);
// each with its status, as a cancelled one's mode never names the master job (lib/masterJobKind masterJobMode).

class MasterJobHouseKindsRepository {
  /** Per master job among `masterJobIds`, the Load Types, Freight Modes and statuses of its live houses, as stored (blanks included). */
  async ofMasterJobs(masterJobIds: readonly string[], companyId: string): Promise<Map<string, { loadType: string; freightMode: string; status: string }[]>> {
    if (masterJobIds.length === 0) return new Map();
    const rows = await db
      .selectDistinct({ masterJobId: shipmentTable.masterJobId, loadType: shipmentTable.loadType, freightMode: shipmentTable.freightMode, status: shipmentTable.status })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), inArray(shipmentTable.masterJobId, [...masterJobIds]), isNull(shipmentTable.deletedAt)));
    const out = new Map<string, { loadType: string; freightMode: string; status: string }[]>();
    for (const r of rows) {
      if (!r.masterJobId) continue;
      out.set(r.masterJobId, [...(out.get(r.masterJobId) ?? []), { loadType: r.loadType ?? "", freightMode: r.freightMode ?? "", status: r.status ?? "" }]);
    }
    return out;
  }
}

export const masterJobHouseKindsRepository = new MasterJobHouseKindsRepository();
