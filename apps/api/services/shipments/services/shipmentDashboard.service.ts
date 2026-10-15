import { shipmentRepository } from "../repositories/shipment.repository";
import type { ShipmentRecord } from "../schemas/shipment.schema";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { DEADLINE_PERIODS, deadlinePeriod } from "../lib/deadlinePeriod";
import type { DashboardKpis, DeadlineItem, DeadlinePeriod, ShipmentDashboard } from "../interfaces/interfaces";

const BILLED_STATUSES = new Set(["Billed [IMP]", "Billed [EXP]", "Billed [DOM]"]);

const KPI_STATUS_MAP: Record<string, keyof DashboardKpis> = {
  "Delivery Date Pending From Customer [IMP]": "waitingUnload",
  "Pre-Alert Received - Further Transport To Be Booked [IMP]": "sailedNotOrdered",
  "Booked For Further Transport [IMP]": "sailedOrdered",
  "All Done - Waiting To Be Shipped [IMP]": "waitingDeparture",
  "All Done - Waiting To Be Shipped [EXP]": "waitingDeparture",
  "All Done - Waiting To Be Shipped [DOM]": "waitingDeparture",
  "Booking Confirmation Pending [EXP]": "missingSailing",
};

const DATE_FIELDS: { field: keyof ShipmentRecord; label: string }[] = [
  { field: "estimatedDeparture", label: "ETD" },
  { field: "estimatedArrival", label: "ETA" },
  { field: "closingDate", label: "Closing" },
  { field: "cargoReadinessDate", label: "CRD" },
  { field: "pickupDate", label: "Pickup" },
];

class ShipmentDashboardService {
  async get(companyId: string, now = new Date()): Promise<ShipmentDashboard> {
    const shipments = await shipmentRepository.listAllForCompany(companyId, 5000);
    const kpis: DashboardKpis = {
      totalActive: 0,
      waitingUnload: 0,
      sailedNotOrdered: 0,
      sailedOrdered: 0,
      waitingDeparture: 0,
      missingSailing: 0,
    };
    const byPeriod = new Map<DeadlinePeriod, DeadlineItem[]>(DEADLINE_PERIODS.map((p) => [p, []]));

    for (const shipment of shipments) {
      const status = shipment.status || "";
      // Cancelled shipments count nowhere; billed ones are done and have no deadlines.
      if (status === CANCELLED_STATUS || BILLED_STATUSES.has(status)) continue;

      kpis.totalActive++;
      const kpiKey = KPI_STATUS_MAP[status];
      if (kpiKey) kpis[kpiKey]++;

      for (const { field, label } of DATE_FIELDS) {
        const raw = shipment[field];
        const date = raw instanceof Date ? raw.toISOString().slice(0, 10) : typeof raw === "string" ? raw : "";
        const period = date ? deadlinePeriod(date, now) : null;
        if (!period) continue;
        byPeriod.get(period)!.push({
          id: shipment.id,
          jobNumber: shipment.jobNumber,
          shipper: shipment.shipper || "",
          consignee: shipment.consignee || "",
          status,
          field: label,
          date,
        });
      }
    }

    const deadlines = DEADLINE_PERIODS.flatMap((period) => {
      const items = byPeriod.get(period)!;
      return items.length > 0 ? [{ period, items }] : [];
    });
    return { kpis, deadlines };
  }
}

export const shipmentDashboardService = new ShipmentDashboardService();
