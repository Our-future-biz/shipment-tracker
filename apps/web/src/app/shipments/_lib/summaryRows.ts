import type { ShipmentItem } from "@/hooks/useShipments";

/** The facts of the shipment's Summary panel, named as everywhere else in the app (Handled By, not Handler). */
export function summaryRows(shipment: ShipmentItem): { label: string; value: string | null | undefined }[] {
  return [
    { label: "Customer", value: shipment.customer },
    { label: "Route", value: [shipment.pol, shipment.pod].filter(Boolean).join(" → ") },
    { label: "Mode", value: shipment.freightMode },
    { label: "Incoterms", value: shipment.incotermOrigin },
    { label: "ETD", value: shipment.estimatedDeparture },
    { label: "ETA", value: shipment.estimatedArrival },
    { label: "Department", value: shipment.department },
    { label: "Handled By", value: shipment.personInCharge },
  ];
}
