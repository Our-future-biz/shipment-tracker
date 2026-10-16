import { and, eq, gt, gte, isNull, lt } from "drizzle-orm";
import { db } from "../db/db";
import { warehouseContainerPositionTable, warehouseContainerTable, warehouseDockSlotTable } from "../schemas/warehouseRecords.schema";
import { warehouseReweighTable } from "../schemas/warehouseReweigh.schema";
import { warehouseExceptionTable } from "../schemas/warehouseException.schema";

// Read-only queries of the Reports KPIs: the rows of one company the calculation needs, with
// only the columns it reads.

const cp = warehouseContainerPositionTable;
const ct = warehouseContainerTable;
const rw = warehouseReweighTable;
const ex = warehouseExceptionTable;
const ds = warehouseDockSlotTable;


class KpiRepository {
  /** Live houses (container links) of the company. */
  houses(companyId: string) {
    return (
      db
        .select({ movementId: cp.movementId, containerId: cp.containerId, addedBy: cp.addedBy, stuffedAt: cp.stuffedAt, tickedAt: cp.tickedAt })
        .from(cp)
        .where(and(eq(cp.companyId, companyId), isNull(cp.deletedAt)))
    );
  }

  /** Live containers of the company. */
  containers(companyId: string) {
    return (
      db
        .select({
          id: ct.id,
          direction: ct.direction,
          equipment: ct.equipment,
          cbm: ct.cbm,
          pieces: ct.pieces,
          dischargePort: ct.dischargePort,
          gatedIn: ct.gatedIn,
          gatedOut: ct.gatedOut,
          gateInAt: ct.gateInAt,
          gateOutAt: ct.gateOutAt,
        })
        .from(ct)
        .where(and(eq(ct.companyId, companyId), isNull(ct.deletedAt)))
    );
  }

  /** Re-weighings of the company (all of them: the latest per position counts). */
  reweighs(companyId: string) {
    return (
      db
        .select({ movementId: rw.movementId, weighedKg: rw.weighedKg, declaredKg: rw.declaredKg, weighedAt: rw.weighedAt })
        .from(rw)
        .where(and(eq(rw.companyId, companyId), isNull(rw.deletedAt)))
    );
  }

  /** Dock slots of the company (every status) that end after `from` and start before `to`. */
  slotsBetween(companyId: string, from: Date, to: Date) {
    return (
      db
        .select({ movementId: ds.movementId, dock: ds.dock, direction: ds.direction, status: ds.status, startsAt: ds.startsAt, endsAt: ds.endsAt })
        .from(ds)
        .where(and(eq(ds.companyId, companyId), isNull(ds.deletedAt), gt(ds.endsAt, from), lt(ds.startsAt, to)))
    );
  }

  /** Exceptions of the company recorded since `since`. */
  exceptionsSince(companyId: string, since: Date) {
    return (
      db
        .select({ movementId: ex.movementId, type: ex.type, pieces: ex.pieces, createdAt: ex.createdAt })
        .from(ex)
        .where(and(eq(ex.companyId, companyId), isNull(ex.deletedAt), gte(ex.createdAt, since)))
    );
  }
}

export const kpiRepository = new KpiRepository();
