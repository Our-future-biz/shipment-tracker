import { api } from "encore.dev/api";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentRecord } from "../schemas/shipment.schema";

interface DeadlineItem {
  id: string;
  jobNumber: string;
  shipper: string;
  consignee: string;
  status: string;
  field: string;
  date: string;
}

interface DeadlineGroup {
  period: string;
  items: DeadlineItem[];
}

interface DashboardResponse {
  kpis: {
    totalActive: number;
    waitingUnload: number;
    sailedNotOrdered: number;
    sailedOrdered: number;
    waitingDeparture: number;
    missingSailing: number;
  };
  deadlines: DeadlineGroup[];
}

const BILLED_STATUSES = new Set(["Billed [IMP]", "Billed [EXP]"]);

const KPI_STATUS_MAP: Record<string, keyof DashboardResponse["kpis"]> = {
  "Delivery Date Pending From Customer [IMP]": "waitingUnload",
  "Pre-Alert Received - Further Transport To Be Booked [IMP]": "sailedNotOrdered",
  "Booked For Further Transport [IMP]": "sailedOrdered",
  "All Done - Waiting To Be Shipped [IMP]": "waitingDeparture",
  "All Done - Waiting To Be Shipped [EXP]": "waitingDeparture",
  "Booking Confirmation Pending [EXP]": "missingSailing",
};

const DATE_FIELDS = [
  { field: "estimatedDeparture", label: "ETD" },
  { field: "estimatedArrival", label: "ETA" },
  { field: "closingDate", label: "Closing" },
  { field: "cargoReadinessDate", label: "CRD" },
  { field: "pickupDate", label: "Pickup" },
] as const;

function categorizeDate(dateStr: string, now: Date): string | null {
  // Try parsing ISO date or MM/DD/YY
  let d: Date | null = null;
  if (dateStr.includes("-")) {
    d = new Date(dateStr);
  } else if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const month = parseInt(parts[0], 10);
      const day = parseInt(parts[1], 10);
      const year = 2000 + parseInt(parts[2], 10);
      d = new Date(year, month - 1, day);
    }
  }
  if (!d || isNaN(d.getTime())) return null;

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((d.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "OVERDUE";
  if (diffDays === 0) return "TODAY";

  const dayOfWeek = now.getDay() || 7; // Monday=1..Sunday=7
  const daysToEndOfWeek = 7 - dayOfWeek;
  if (diffDays <= daysToEndOfWeek) return "THIS_WEEK";
  if (diffDays <= daysToEndOfWeek + 7) return "NEXT_WEEK";
  return "LATER";
}

export const shipmentDashboard = api(
  { expose: true, auth: false, method: "GET", path: "/shipments/dashboard" },
  async (): Promise<DashboardResponse> => {
    const allShipments = await shipmentService.getAll(5000);
    const now = new Date();

    const kpis: DashboardResponse["kpis"] = {
      totalActive: 0,
      waitingUnload: 0,
      sailedNotOrdered: 0,
      sailedOrdered: 0,
      waitingDeparture: 0,
      missingSailing: 0,
    };

    const deadlineMap = new Map<string, DeadlineItem[]>();
    for (const period of ["OVERDUE", "TODAY", "THIS_WEEK", "NEXT_WEEK", "LATER"]) {
      deadlineMap.set(period, []);
    }

    const dateFieldAccessors: Array<{ field: keyof ShipmentRecord; label: string }> = DATE_FIELDS.map((df) => ({
      field: df.field as keyof ShipmentRecord,
      label: df.label,
    }));

    for (const shipment of allShipments) {
      const status = shipment.status || "";

      // KPIs — active = not billed
      if (!BILLED_STATUSES.has(status)) {
        kpis.totalActive++;
        const kpiKey = KPI_STATUS_MAP[status];
        if (kpiKey) kpis[kpiKey]++;
      }

      // Deadlines — only for active shipments
      if (BILLED_STATUSES.has(status)) continue;

      for (const df of dateFieldAccessors) {
        const raw = shipment[df.field];
        const dateVal = raw instanceof Date ? raw.toISOString().split("T")[0]! : typeof raw === "string" ? raw : "";
        if (!dateVal) continue;
        const period = categorizeDate(dateVal, now);
        if (!period) continue;
        deadlineMap.get(period)?.push({
          id: shipment.id,
          jobNumber: shipment.jobNumber,
          shipper: shipment.shipper || "",
          consignee: shipment.consignee || "",
          status,
          field: df.label,
          date: dateVal,
        });
      }
    }

    const deadlines: DeadlineGroup[] = [];
    for (const period of ["OVERDUE", "TODAY", "THIS_WEEK", "NEXT_WEEK", "LATER"]) {
      const items = deadlineMap.get(period) || [];
      if (items.length > 0) {
        deadlines.push({ period, items });
      }
    }

    return { kpis, deadlines };
  },
);
