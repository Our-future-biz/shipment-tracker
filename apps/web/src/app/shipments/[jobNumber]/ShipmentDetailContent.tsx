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
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="p-10 text-center text-slate-500">
        Shipment not found.{" "}
        <Link href="/shipments" className="text-indigo-500">
          Back to list
        </Link>
      </div>
    );
  }

  const status = shipment.status ?? "";

  return (
    <div className="flex min-h-[calc(100vh-52px)]">
      <DetailSidebar
        shipment={shipment}
        activeSection={activeSection}
        onSelectSection={setActiveSection}
      />

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex gap-5">
          <div className="flex-1">
            <PageHeader
              title={shipment.jobNumber ?? shipment.id}
              breadcrumb={
                <span>
                  <Link href="/shipments" className="text-indigo-500 no-underline">
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
              <div className="grid grid-cols-2 gap-3 text-xs py-2">
                <div><span className="text-slate-500">Customer:</span> <strong>{shipment.customer || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Customer PIC:</span> <strong>{shipment.customerPic || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Customer Reference:</span> <strong>{shipment.customerReference || "\u2014"}</strong></div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="shipment-info"
              title="Shipment Info"
              description="Type, mode, incoterms, trade direction, department"
              status={shipment.freightMode ? "completed" : "not-started"}
            >
              <div className="grid grid-cols-2 gap-3 text-xs py-2">
                <div><span className="text-slate-500">Trade Direction:</span> <strong>{shipment.tradeDirection || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Freight Mode:</span> <strong>{shipment.freightMode || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Department:</span> <strong>{shipment.department || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Person in Charge:</span> <strong>{shipment.personInCharge || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Incoterms:</span> <strong>{shipment.incotermOrigin || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Service Type:</span> <strong>{shipment.serviceType || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Agent:</span> <strong>{shipment.agent || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Insurance:</span> <strong>{shipment.insurance || "\u2014"}</strong></div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="routing"
              title="Routing"
              description="Origin, destination, ports, dates"
              status={shipment.pol ? "in-progress" : "not-started"}
            >
              <div className="grid grid-cols-2 gap-3 text-xs py-2">
                <div><span className="text-slate-500">POL:</span> <strong>{shipment.pol || "\u2014"}</strong></div>
                <div><span className="text-slate-500">POD:</span> <strong>{shipment.pod || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Shipper:</span> <strong>{shipment.shipper || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Consignee:</span> <strong>{shipment.consignee || "\u2014"}</strong></div>
                <div><span className="text-slate-500">ETD:</span> <strong>{shipment.estimatedDeparture || "\u2014"}</strong></div>
                <div><span className="text-slate-500">ETA:</span> <strong>{shipment.estimatedArrival || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Pickup Address:</span> <strong>{shipment.pickupAddress || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Delivery Address:</span> <strong>{shipment.deliveryAddress || "\u2014"}</strong></div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="cargo"
              title="Cargo & Dimensions"
              description="Packages, containers, weight, volume, freight tons"
              status="not-started"
            >
              <div className="grid grid-cols-2 gap-3 text-xs py-2">
                <div><span className="text-slate-500">Cargo Description:</span> <strong>{shipment.cargoDescription || "\u2014"}</strong></div>
                <div><span className="text-slate-500">HS Code:</span> <strong>{shipment.hsCode || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Vessel:</span> <strong>{shipment.vessel || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Voyage:</span> <strong>{shipment.voyage || "\u2014"}</strong></div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="compliance"
              title="Compliance & Documentation"
              description="VGM, shipping instructions, AMS, ISF, BoL"
              status="not-started"
            >
              <div className="grid grid-cols-2 gap-3 text-xs py-2">
                <div><span className="text-slate-500">House BoL:</span> <strong>{shipment.houseBolNumber || "\u2014"}</strong></div>
                <div><span className="text-slate-500">Master BoL:</span> <strong>{shipment.masterBolNumber || "\u2014"}</strong></div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="costs"
              title="Costs & Billing"
              description="Freight, locals, insurance, customs -- supplier vs billing"
              status="not-started"
            >
              <div className="text-xs text-slate-400 py-2">
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
