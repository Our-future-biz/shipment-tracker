"use client";

import { STATUS_COLORS } from "@/lib/enums";
import type { interfaces } from "@/lib/api/client";

type ShipmentItem = interfaces.ShipmentItem;

interface ShipmentDetailProps {
  shipment: ShipmentItem;
}

const FIELDS: Array<{ label: string; key: keyof ShipmentItem }> = [
  { label: "Job Number", key: "jobNumber" },
  { label: "Status", key: "status" },
  { label: "Shipper", key: "shipper" },
  { label: "Consignee", key: "consignee" },
  { label: "POL", key: "pol" },
  { label: "POD", key: "pod" },
  { label: "Destination", key: "destination" },
  { label: "Trade Direction", key: "tradeDirection" },
  { label: "Load Type", key: "loadType" },
  { label: "Vessel", key: "vessel" },
  { label: "Voyage", key: "voyage" },
  { label: "Customs Status", key: "customsStatus" },
  { label: "ETA", key: "estimatedArrival" },
];

export const ShipmentDetail = ({ shipment }: ShipmentDetailProps) => {
  return (
    <div className="space-y-3 text-xs">
      {FIELDS.map(({ label, key }) => (
        <div key={key} className="flex gap-2 py-1 border-b border-gray-100 dark:border-gray-800">
          <span className="text-gray-500 w-32 flex-none font-medium">{label}</span>
          <span className="text-gray-800 dark:text-gray-200">{shipment[key] || "—"}</span>
        </div>
      ))}
    </div>
  );
};
