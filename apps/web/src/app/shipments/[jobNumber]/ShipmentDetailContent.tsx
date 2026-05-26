"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Spin } from "antd";
import { useShipments } from "@/hooks/useShipments";
import { DetailSidebar } from "../_components/DetailSidebar";
import { SummaryPanel } from "../_components/SummaryPanel";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { AccordionSection } from "@/components/AccordionSection";
import Link from "next/link";

export function ShipmentDetailContent() {
  const { jobNumber } = useParams<{ jobNumber: string }>();
  const { shipments, isLoading } = useShipments();
  const [activeSection, setActiveSection] = useState("customer");

  const shipment = shipments.find((s) => s.id === jobNumber);

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
        Shipment not found.{" "}
        <Link href="/shipments" style={{ color: "#6366f1" }}>
          Back to list
        </Link>
      </div>
    );
  }

  const status = shipment.status ?? "";

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 52px)" }}>
      <DetailSidebar
        shipment={shipment}
        activeSection={activeSection}
        onSelectSection={setActiveSection}
      />

      <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <PageHeader
              title={shipment.jobNumber ?? shipment.id}
              breadcrumb={
                <span>
                  <Link href="/shipments" style={{ color: "#6366f1", textDecoration: "none" }}>
                    Shipments
                  </Link>
                  {" \u2192 "}
                  {shipment.jobNumber ?? shipment.id}
                </span>
              }
              extra={status ? <StatusBadge status={status} /> : undefined}
            />

            <AccordionSection
              id="customer"
              title="Customer Details"
              description="Contact, references, person in charge"
              status={shipment.customer ? "completed" : "not-started"}
              defaultOpen={activeSection === "customer"}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12, padding: "8px 0" }}>
                <div><span style={{ color: "#64748b" }}>Customer:</span> <strong>{shipment.customer || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Customer PIC:</span> <strong>{shipment.customerPic || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Customer Reference:</span> <strong>{shipment.customerReference || "\u2014"}</strong></div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="shipment-info"
              title="Shipment Info"
              description="Type, mode, incoterms, trade direction, department"
              status={shipment.freightMode ? "completed" : "not-started"}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12, padding: "8px 0" }}>
                <div><span style={{ color: "#64748b" }}>Trade Direction:</span> <strong>{shipment.tradeDirection || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Freight Mode:</span> <strong>{shipment.freightMode || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Department:</span> <strong>{shipment.department || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Person in Charge:</span> <strong>{shipment.personInCharge || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Incoterms:</span> <strong>{shipment.incotermOrigin || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Service Type:</span> <strong>{shipment.serviceType || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Agent:</span> <strong>{shipment.agent || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Insurance:</span> <strong>{shipment.insurance || "\u2014"}</strong></div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="routing"
              title="Routing"
              description="Origin, destination, ports, dates"
              status={shipment.pol ? "in-progress" : "not-started"}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12, padding: "8px 0" }}>
                <div><span style={{ color: "#64748b" }}>POL:</span> <strong>{shipment.pol || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>POD:</span> <strong>{shipment.pod || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Shipper:</span> <strong>{shipment.shipper || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Consignee:</span> <strong>{shipment.consignee || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>ETD:</span> <strong>{shipment.estimatedDeparture || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>ETA:</span> <strong>{shipment.estimatedArrival || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Pickup Address:</span> <strong>{shipment.pickupAddress || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Delivery Address:</span> <strong>{shipment.deliveryAddress || "\u2014"}</strong></div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="cargo"
              title="Cargo & Dimensions"
              description="Packages, containers, weight, volume, freight tons"
              status="not-started"
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12, padding: "8px 0" }}>
                <div><span style={{ color: "#64748b" }}>Cargo Description:</span> <strong>{shipment.cargoDescription || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>HS Code:</span> <strong>{shipment.hsCode || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Vessel:</span> <strong>{shipment.vessel || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Voyage:</span> <strong>{shipment.voyage || "\u2014"}</strong></div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="compliance"
              title="Compliance & Documentation"
              description="VGM, shipping instructions, AMS, ISF, BoL"
              status="not-started"
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12, padding: "8px 0" }}>
                <div><span style={{ color: "#64748b" }}>House BoL:</span> <strong>{shipment.houseBolNumber || "\u2014"}</strong></div>
                <div><span style={{ color: "#64748b" }}>Master BoL:</span> <strong>{shipment.masterBolNumber || "\u2014"}</strong></div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="costs"
              title="Costs & Billing"
              description="Freight, locals, insurance, customs — supplier vs billing"
              status="not-started"
            >
              <div style={{ fontSize: 12, color: "#94a3b8", padding: "8px 0" }}>
                Cost grid will be connected in a future update.
              </div>
            </AccordionSection>
          </div>

          <SummaryPanel shipment={shipment} />
        </div>
      </div>
    </div>
  );
}
