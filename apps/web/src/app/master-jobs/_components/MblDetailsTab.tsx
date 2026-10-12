"use client";

import { App } from "antd";
import { EnvironmentOutlined, FileTextOutlined, InboxOutlined } from "@ant-design/icons";
import { CustomerLinkField } from "@/app/shipments/[jobNumber]/_components/CustomerLinkField";
import { getComputedValue } from "@/lib/columnConfig";
import { formatDate } from "@/lib/date";
import { teuForType } from "@/lib/cargo";
import type { MasterJobContainerLine, MasterJobItem, MasterJobShipmentItem, MasterJobUpdate } from "@/hooks/useMasterJobs";
import { FieldRow, IncotermRow, MasterJobCard, ReadOnlyRow } from "./MasterJobFields";
import { MasterJobContainers } from "./MasterJobContainers";
import { MasterJobShipments } from "./MasterJobShipments";

interface MblDetailsTabProps {
  masterJob: MasterJobItem;
  containers: MasterJobContainerLine[];
  shipments: MasterJobShipmentItem[];
  onSave: (data: MasterJobUpdate) => Promise<unknown>;
  onSaveContainers: (containers: MasterJobContainerLine[]) => Promise<unknown>;
  onLinkShipments: (shipmentIds: string[]) => Promise<unknown>;
  onUnlinkShipment: (shipmentId: string) => Promise<unknown>;
}

// The master job's field values in the string shape the shipment column helpers expect.
function rowData(mj: MasterJobItem): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(mj)) out[k] = v == null ? "" : String(v);
  return out;
}

function Tile({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-[17px] font-bold text-slate-900">{value || "—"}</div>
      {note && <div className="mt-0.5 text-[12px] text-slate-500">{note}</div>}
    </div>
  );
}

export function MblDetailsTab({
  masterJob: mj,
  containers,
  shipments,
  onSave,
  onSaveContainers,
  onLinkShipments,
  onUnlinkShipment,
}: MblDetailsTabProps) {
  const { message } = App.useApp();
  const data = rowData(mj);
  const value = (key: keyof MasterJobItem) => (mj[key] == null ? "" : String(mj[key]));
  const week = (key: string) => {
    const w = getComputedValue(key, data);
    return w ? `Week ${w}` : "";
  };

  const save = async (patch: MasterJobUpdate) => {
    try {
      await onSave(patch);
    } catch {
      message.error("Saving the master job failed");
    }
  };
  const handleCommit = (fieldKey: string, v: string) => save({ [fieldKey]: v } as MasterJobUpdate);

  // The actual date that matters follows the direction: an export is tracked by its
  // departure, an import by its arrival. Without a direction both are shown.
  const direction = mj.tradeDirection.trim().toLowerCase();
  const showDeparture = direction !== "import";
  const showArrival = direction !== "export";
  const isConsolidation = mj.loadType === "Consolidation";
  const teu = containers.reduce((sum, c) => sum + teuForType(c.type), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Tile label="Linked shipments" value={String(shipments.length)} />
        <Tile label="Containers" value={String(containers.length)} note={teu ? `${teu} TEU` : undefined} />
        <Tile label="Estimated Departure" value={formatDate(value("estimatedDeparture"))} note={week("estimatedDepartureWeek")} />
        <Tile label="Estimated Arrival" value={formatDate(value("estimatedArrival"))} note={week("estimatedArrivalWeek")} />
      </div>

      <MasterJobCard icon={<FileTextOutlined />} title="MBL Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div>
            <FieldRow label="Freight Mode" fieldKey="freightMode" value={mj.freightMode} onCommit={handleCommit} />
            <FieldRow label="Load Type" fieldKey="loadType" value={mj.loadType} onCommit={handleCommit} synced />
            <IncotermRow label="Incoterm Origin" fieldKey="incotermOrigin" value={mj.incotermOrigin} onCommit={handleCommit} />
            <IncotermRow label="Incoterm Destination" fieldKey="incotermDestination" value={mj.incotermDestination} onCommit={handleCommit} />
            <FieldRow label="Trade Direction" fieldKey="tradeDirection" value={mj.tradeDirection} onCommit={handleCommit} />
            <FieldRow label="Booking Number" fieldKey="bookingNumber" value={mj.bookingNumber} onCommit={handleCommit} />
            <FieldRow label="Shipping line / Coloader" fieldKey="shippingLine" value={mj.shippingLine} onCommit={handleCommit} synced />
            <FieldRow label="Closing Date" fieldKey="closingDate" value={mj.closingDate} onCommit={handleCommit} />
            <FieldRow label="Release Depot" fieldKey="releaseDepot" value={mj.releaseDepot} onCommit={handleCommit} synced />
            <FieldRow label="POL" fieldKey="pol" value={mj.pol} onCommit={handleCommit} synced />
            <FieldRow label="POD" fieldKey="pod" value={mj.pod} onCommit={handleCommit} synced />
            <FieldRow label="Destination" fieldKey="destination" value={mj.destination} onCommit={handleCommit} />
          </div>
          <div>
            <FieldRow label="Estimated Departure" fieldKey="estimatedDeparture" value={mj.estimatedDeparture} onCommit={handleCommit} synced />
            <FieldRow label="Estimated Arrival" fieldKey="estimatedArrival" value={mj.estimatedArrival} onCommit={handleCommit} synced />
            {showDeparture && (
              <FieldRow label="Actual Departure" fieldKey="actualDeparture" value={mj.actualDeparture} onCommit={handleCommit} synced />
            )}
            {showArrival && (
              <FieldRow label="Actual Arrival" fieldKey="actualArrival" value={mj.actualArrival} onCommit={handleCommit} synced />
            )}
            <FieldRow label="ETA Warehouse/HUB" fieldKey="etaWarehouse" value={mj.etaWarehouse} onCommit={handleCommit} synced />
            <FieldRow label="Master BoL Number" fieldKey="masterBolNumber" value={mj.masterBolNumber} onCommit={handleCommit} synced />
            <CustomerLinkField
              label="Shipper"
              name={mj.shipper}
              customerId={mj.shipperId}
              onChange={(name, id) => save({ shipper: name, shipperId: id })}
            />
            <CustomerLinkField
              label="Consignee"
              name={mj.consignee}
              customerId={mj.consigneeId}
              onChange={(name, id) => save({ consignee: name, consigneeId: id })}
            />
            <FieldRow label="Master BoL Type" fieldKey="masterBolType" value={mj.masterBolType} onCommit={handleCommit} synced />
            <FieldRow label="Vessel" fieldKey="vessel" value={mj.vessel} onCommit={handleCommit} synced />
            <FieldRow label="Voyage" fieldKey="voyage" value={mj.voyage} onCommit={handleCommit} synced />
            {/* A service name only exists on a consolidation (the coloader's service). */}
            {isConsolidation && (
              <FieldRow label="Service Name" fieldKey="serviceName" value={mj.serviceName} onCommit={handleCommit} synced />
            )}
          </div>
        </div>
      </MasterJobCard>

      <MasterJobCard icon={<EnvironmentOutlined />} title="Warehouse & Depot">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div>
            <FieldRow label="Warehouse Received" fieldKey="warehouseReceivedDate" value={mj.warehouseReceivedDate} onCommit={handleCommit} synced />
            <FieldRow label="Redelivery Reference" fieldKey="redeliveryReference" value={mj.redeliveryReference} onCommit={handleCommit} synced />
            <FieldRow label="Redelivery Depot" fieldKey="redeliveryDepot" value={mj.redeliveryDepot} onCommit={handleCommit} synced />
            <FieldRow label="Supplier's PIC" fieldKey="supplierPic" value={mj.supplierPic} onCommit={handleCommit} synced />
          </div>
          <div>
            <ReadOnlyRow label="Shipment Date" value={getComputedValue("shipmentsDate", data)} />
            <ReadOnlyRow label="Year" value={getComputedValue("shipmentsYear", data)} />
            <ReadOnlyRow label="ETD Week" value={getComputedValue("estimatedDepartureWeek", data)} />
            <ReadOnlyRow label="ETA Week" value={getComputedValue("estimatedArrivalWeek", data)} />
            {showDeparture && <ReadOnlyRow label="ATD Week" value={getComputedValue("actualDepartureWeek", data)} />}
            {showArrival && <ReadOnlyRow label="ATA Week" value={getComputedValue("actualArrivalWeek", data)} />}
          </div>
        </div>
      </MasterJobCard>

      <MasterJobContainers containers={containers} shipments={shipments} onSave={onSaveContainers} />

      <MasterJobCard icon={<InboxOutlined />} title={`Linked shipments (${shipments.length})`}>
        <MasterJobShipments
          masterJob={mj}
          shipments={shipments}
          onLink={onLinkShipments}
          onUnlink={onUnlinkShipment}
        />
      </MasterJobCard>
    </div>
  );
}
