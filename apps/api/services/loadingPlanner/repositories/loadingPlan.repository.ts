import { and, desc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import type { PlanLinkKind } from "../interfaces/interfaces";
import { loadingPlanTable as t, type LoadingPlanRecord } from "../schemas/loadingPlan.schema";

class LoadingPlanRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "loading_plan");
  }

  /** The company's plans, last saved first; with a link, only the plans of that shipment or quote. */
  async listLatest(companyId: string, link?: { kind: PlanLinkKind; id: string }, limit = 500): Promise<LoadingPlanRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), isNull(t.deletedAt), link ? and(eq(t.linkKind, link.kind), eq(t.linkId, link.id)) : undefined))
      .orderBy(desc(t.updatedAt))
      .limit(limit);
  }
}

export const loadingPlanRepository = new LoadingPlanRepository();
