"use client";

import { useState } from "react";
import { Select } from "antd";
import { useShipments } from "@/hooks/useShipments";
import { PageHeader } from "@/components/PageHeader";
import { AppCard } from "@/components/AppCard";
import { CostsTab } from "@/app/shipments/[jobNumber]/tabs/CostsTab";
import { InvoicePanel } from "./InvoicePanel";

/**
 * Invoicing works on the same buying / selling rows as the shipment's Costs tab:
 * the Costs section here IS that tab, and the invoice is built from the selling rows
 * ticked for Invoice. One source of truth, so the two pages never disagree.
 */
export const InvoicingView = () => {
  const { shipments } = useShipments();
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const selectedShipment = shipments.find((s) => s.id === selectedShipmentId);

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1400px] mx-auto">
        <PageHeader title="Invoicing" />

        <AppCard className="mb-5">
          <Select
            placeholder="Select a shipment..."
            value={selectedShipmentId}
            onChange={setSelectedShipmentId}
            className="w-full max-w-xl"
            showSearch
            filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
            options={shipments.map((s) => ({ value: s.id, label: `${s.jobNumber} — ${s.shipper} → ${s.consignee}` }))}
          />
        </AppCard>

        {!selectedShipment ? (
          <AppCard>
            <div className="flex items-center justify-center h-[200px] text-slate-500 text-sm">
              Select a shipment to view invoicing
            </div>
          </AppCard>
        ) : (
          <>
            {/* key: a fresh Costs editor per shipment, so no row state carries over between shipments */}
            <CostsTab key={selectedShipment.id} shipment={selectedShipment} />
            <InvoicePanel key={`inv-${selectedShipment.id}`} shipment={selectedShipment} />
          </>
        )}
      </div>
    </div>
  );
};
