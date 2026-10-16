import { api, type Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { kpiService } from "../services/kpi.service";
import type { WarehouseKpiReport } from "../interfaces/kpi.interfaces";
import { requireModule } from "../../../lib/modules";

interface WarehouseKpisRequest {
  /** YYYY-MM-DD (Prague), first day included; default 6 days before `to`. */
  from?: Query<string>;
  /** YYYY-MM-DD (Prague), last day included; default today. At most 366 days. */
  to?: Query<string>;
}

// Reports tab: KPIs from the gate stamps for a period, each with how it is measured; figures
// that cannot be measured are null with the reason. Any logged-in user of the company.
export const warehouseKpis = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-kpis" },
  async ({ from, to }: WarehouseKpisRequest): Promise<{ report: WarehouseKpiReport }> => {
    await requireModule("warehouse_concept");
    return { report: await kpiService.report(getAuthData()!.companyID, { from, to }) };
  },
);
