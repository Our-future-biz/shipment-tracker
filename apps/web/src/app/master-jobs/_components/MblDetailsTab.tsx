"use client";

import { App, Tooltip } from "antd";
import { BuildOutlined, EnvironmentOutlined, FileTextOutlined, InboxOutlined, LockOutlined } from "@ant-design/icons";
import { CustomerLinkField } from "@/app/shipments/[jobNumber]/_components/CustomerLinkField";
import { getComputedValue } from "@/lib/columnConfig";
import { formatDate } from "@/lib/date";
import { teuForType } from "@/lib/cargo";
import { FULL_LOAD } from "@/lib/enums";
import type { MasterJobContainerLine, MasterJobItem, MasterJobShipmentItem, MasterJobUpdate } from "@/hooks/useMasterJobs";
import { FieldRow, IncotermRow, Label, MasterJobCard, ROW, ReadOnlyRow, jumpTo } from "./MasterJobFields";
import { MasterJobContainers } from "./MasterJobContainers";
import { MasterJobShipments } from "./MasterJobShipments";

// Load Type is chosen once; the server refuses switching it, so the row stops being editable.
function LockedLoadType({ value }: { value: string }) {
  return (
    <div className={ROW}>
      <Label label="Load Type" synced />
      <span className="flex-1 min-w-0 flex items-center gap-1.5 text-slate-900 font-medium">
        {value}
        <Tooltip title="Load Type can't be changed once it is set">
          <LockOutlined className="text-[11px] text-slate-400" aria-label="Locked" />
        </Tooltip>
      </span>
    </div>
  );
}

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

// Anchors the summary tiles jump to.
export const MJ_ANCHORS = {
  shipments: "mj-shipments",
  containers: "mj-containers",
  etd: "mj-estimated-departure",
  eta: "mj-estimated-arrival",
} as const;

interface TileProps {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  /** The card or row this tile jumps to. */
  target: string;
}

function Tile({ label, value, note, target }: TileProps) {
  return (
    <button
      type="button"
      onClick={() => jumpTo(target)}
      title={`Go to ${label}`}
      className="text-left bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm cursor-pointer transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
    >
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-[17px] font-bold text-slate-900">{value || "—"}</div>
      {note && <div className="mt-0.5 text-[12px] text-slate-500">{note}</div>}
    </button>
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
        <Tile label="Linked shipments" value={String(shipments.length)} target={MJ_ANCHORS.shipments} />
        <Tile label="Containers" value={String(containers.length)} note={teu ? `${teu} TEU` : undefined} target={MJ_ANCHORS.containers} />
        <Tile label="Estimated Departure" value={formatDate(value("estimatedDeparture"))} note={week("estimatedDepartureWeek")} target={MJ_ANCHORS.etd} />
        <Tile label="Estimated Arrival" value={formatDate(value("estimatedArrival"))} note={week("estimatedArrivalWeek")} target={MJ_ANCHORS.eta} />
      </div>

      <MasterJobCard icon={<FileTextOutlined />} title="MBL Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div>
            <FieldRow label="Freight Mode" fieldKey="freightMode" value={mj.freightMode} onCommit={handleCommit} />
            {mj.loadType ? <LockedLoadType value={mj.loadType} /> : (
              <FieldRow label="Load Type" fieldKey="loadType" value={mj.loadType} onCommit={handleCommit} synced />
            )}
            <IncotermRow label="Incoterm Origin" fieldKey="incotermOrigin" value={mj.incotermOrigin} onCommit={handleCommit} />
            <IncotermRow label="Incoterm Destination" fieldKey="incotermDestination" value={mj.incotermDestination} onCommit={handleCommit} />
            <FieldRow label="Trade Direction" fieldKey="tradeDirection" value={mj.tradeDirection} onCommit={handleCommit} />
            <FieldRow label="Booking Number" fieldKey="bookingNumber" value={mj.bookingNumber} onCommit={handleCommit} synced />
            <FieldRow label="Equipment" fieldKey="equipment" value={mj.equipment} onCommit={handleCommit} />
            <FieldRow label="Shipping line / Coloader" fieldKey="shippingLine" value={mj.shippingLine} onCommit={handleCommit} synced />
            <FieldRow label="Closing Date" fieldKey="closingDate" value={mj.closingDate} onCommit={handleCommit} synced />
            <FieldRow label="VGM Closing" fieldKey="vgmClosing" value={mj.vgmClosing} onCommit={handleCommit} synced />
            <FieldRow label="SI Closing" fieldKey="siClosing" value={mj.siClosing} onCommit={handleCommit} synced />
            <FieldRow label="Release Reference" fieldKey="releaseReference" value={mj.releaseReference} onCommit={handleCommit} synced />
            <FieldRow label="Release Depot" fieldKey="releaseDepot" value={mj.releaseDepot} onCommit={handleCommit} synced />
            <FieldRow label="POL" fieldKey="pol" value={mj.pol} onCommit={handleCommit} synced />
            <FieldRow label="POD" fieldKey="pod" value={mj.pod} onCommit={handleCommit} synced />
            <FieldRow label="Destination" fieldKey="destination" value={mj.destination} onCommit={handleCommit} />
          </div>
          <div>
            <FieldRow id={MJ_ANCHORS.etd} label="Estimated Departure" fieldKey="estimatedDeparture" value={mj.estimatedDeparture} onCommit={handleCommit} synced />
            <FieldRow id={MJ_ANCHORS.eta} label="Estimated Arrival" fieldKey="estimatedArrival" value={mj.estimatedArrival} onCommit={handleCommit} synced />
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

      {/* Totals of the whole MBL; each house keeps its own cargo, so these are not copied. */}
      <MasterJobCard icon={<BuildOutlined />} title="MBL Cargo">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div>
            <FieldRow label="Pieces (PCS)" fieldKey="pcs" value={mj.pcs} onCommit={handleCommit} />
            <FieldRow label="Type Of Packages" fieldKey="typeOfPackages" value={mj.typeOfPackages} onCommit={handleCommit} />
          </div>
          <div>
            <FieldRow label="Total Weight In Tons" fieldKey="totalWeightTons" value={mj.totalWeightTons} onCommit={handleCommit} />
            <FieldRow label="Total Volume In CBM" fieldKey="totalVolumeCbm" value={mj.totalVolumeCbm} onCommit={handleCommit} />
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
            <ReadOnlyRow label="Shipments Month" value={getComputedValue("shipmentsDate", data)} />
            <ReadOnlyRow label="Year" value={getComputedValue("shipmentsYear", data)} />
            <ReadOnlyRow label="ETD Week" value={getComputedValue("estimatedDepartureWeek", data)} />
            <ReadOnlyRow label="ETA Week" value={getComputedValue("estimatedArrivalWeek", data)} />
            {showDeparture && <ReadOnlyRow label="ATD Week" value={getComputedValue("actualDepartureWeek", data)} />}
            {showArrival && <ReadOnlyRow label="ATA Week" value={getComputedValue("actualArrivalWeek", data)} />}
          </div>
        </div>
      </MasterJobCard>

      <MasterJobContainers id={MJ_ANCHORS.containers} fromShipments={mj.loadType === FULL_LOAD} containers={containers} shipments={shipments} onSave={onSaveContainers} />

      <MasterJobCard id={MJ_ANCHORS.shipments} icon={<InboxOutlined />} title={`Linked shipments (${shipments.length})`}>
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
