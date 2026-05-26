"use client";

import type { ShipmentItem } from "@/hooks/useShipments";

interface SummaryPanelProps {
  shipment: ShipmentItem;
}

export function SummaryPanel({ shipment }: SummaryPanelProps) {
  const summaryRows = [
    { label: "Customer", value: shipment.customer },
    { label: "Route", value: [shipment.pol, shipment.pod].filter(Boolean).join(" \u2192 ") },
    { label: "Mode", value: shipment.freightMode },
    { label: "Incoterms", value: shipment.incotermOrigin },
    { label: "ETD", value: shipment.estimatedDeparture },
    { label: "ETA", value: shipment.estimatedArrival },
    { label: "Department", value: shipment.department },
    { label: "Handler", value: shipment.personInCharge },
  ];

  return (
    <div style={{ width: 260, flexShrink: 0 }}>
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: 18, position: "sticky", top: 76 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Summary</div>
        {summaryRows.map((row) =>
          row.value ? (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12 }}>
              <span style={{ color: "#64748b" }}>{row.label}</span>
              <span style={{ color: "#1e293b", fontWeight: 500, textAlign: "right", maxWidth: "60%" }}>{row.value}</span>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
