"use client";

import { App, Tooltip } from "antd";
import { apiErrorMessage } from "@/lib/api";
import {
  BuildOutlined,
  CalendarOutlined,
  EnvironmentOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  LockOutlined,
} from "@ant-design/icons";
import { CustomerLinkField } from "@/app/shipments/[jobNumber]/_components/CustomerLinkField";
import { FreightModeContext } from "@/app/shipments/[jobNumber]/_components/EditableCell";
import { COLUMN_MAP, dateTimeUpdate, getComputedValue, joinDateTime } from "@/lib/columnConfig";
import { loadTypeLabel } from "@/lib/enums";
import { COLS2 } from "@/app/shipments/[jobNumber]/_components/detailStyles";
import type { MasterJobItem, MasterJobUpdate } from "@/hooks/useMasterJobs";
import { FieldRow, IncotermRow, Label, MasterJobCard, ROW, ReadOnlyRow } from "./MasterJobFields";
import { ProgressStages } from "@/app/shipments/[jobNumber]/_components/ShipmentSummary";
import { getStageFromFacts } from "@/app/shipments/[jobNumber]/_components/taskDefinitions";
import { formatDate } from "@/lib/date";
import { kgFromTons, tonsFromKg } from "../_lib/mblWeight";

// Load Type is chosen once; the server refuses switching it, so the row stops being editable.
function LockedLoadType({ value }: { value: string }) {
  return (
    <div className={ROW}>
      <Label label="Load Type" synced />
      <span className="flex-1 min-w-0 flex items-center gap-1.5 text-slate-900">
        {value}
        <Tooltip title="Load Type can't be changed once it is set">
          <LockOutlined className="text-[11px] text-slate-400" aria-label="Locked" />
        </Tooltip>
      </span>
    </div>
  );
}

// The master job's own fields; its containers and linked shipments have tabs of their own.
interface MblDetailsTabProps {
  masterJob: MasterJobItem;
  onSave: (data: MasterJobUpdate) => Promise<unknown>;
}

// The master job's field values in the string shape the shipment column helpers expect.
function rowData(mj: MasterJobItem): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(mj)) out[k] = v == null ? "" : String(v);
  return out;
}

// Anchors the summary top bar (MasterJobFacts) jumps to.
export const MJ_ANCHORS = {
  shipments: "mj-shipments",
  containers: "mj-containers",
  etd: "mj-estimated-departure",
  eta: "mj-estimated-arrival",
} as const;

export function MblDetailsTab({ masterJob: mj, onSave }: MblDetailsTabProps) {
  const { message } = App.useApp();
  const data = rowData(mj);

  const save = async (patch: MasterJobUpdate) => {
    try {
      await onSave(patch);
    } catch (e) {
      // The server's word: e.g. a save that would change a house the user may not change (lib/shipmentEditRule).
      message.error(`Saving the master job failed: ${apiErrorMessage(e)}`);
    }
  };
  // A closing / deadline comes as "YYYY-MM-DD HH:MM" and is saved as its date and its time.
  const handleCommit = (fieldKey: string, v: string) => {
    const col = COLUMN_MAP.get(fieldKey);
    save((col ? dateTimeUpdate(col, v) : { [fieldKey]: v }) as MasterJobUpdate);
  };

  // The MBL's total weight is typed in kg and kept in tons; text that is no weight is refused.
  const commitWeightKg = (_fieldKey: string, typed: string) => {
    const tons = tonsFromKg(typed);
    if (tons === null) {
      message.warning(`"${typed}" is not a weight in kg`);
      return;
    }
    if (tons !== mj.totalWeightTons) save({ totalWeightTons: tons });
  };

  // The actual date that matters follows the direction: an export is tracked by its
  // departure, an import by its arrival. Without a direction both are shown.
  const direction = mj.tradeDirection.trim().toLowerCase();
  const showDeparture = direction !== "import";
  const showArrival = direction !== "export";
  const isConsolidation = mj.loadType === "Consolidation";

  // Laid out like the Shipment Details tab's main column: the overview (with the parties), the Key
  // Dates and Carrier & Bill of Lading, each in two columns, then Equipment & Depot beside MBL Cargo
  // once the column is wide enough.
  // The stages, as the shipment's progress bar shows them. A master job has no task ticks, customs
  // status or delivery (those are its shipments'), so its own dates move it, by the shipment's
  // rule: departed = In transit, arrived = past Arrive at POD.
  const stage = getStageFromFacts({ tradeDirection: mj.tradeDirection, actualDeparture: mj.actualDeparture, actualArrival: mj.actualArrival });
  const stageFacts: Record<string, string> = {
    "In transit": mj.actualDeparture ? `ATD ${formatDate(mj.actualDeparture)}` : "",
    "Arrive at POD": mj.actualArrival ? `ATA ${formatDate(mj.actualArrival)}` : "",
  };

  return (
    <div className="@container flex flex-col gap-4 min-w-0">
      {/* The master job's progress, above its cards as on Shipment Details */}
      <ProgressStages activeIndex={stage} factOf={stageFacts} ariaLabel="Master job progress" />
      <MasterJobCard icon={<FileTextOutlined />} title="Master Job Overview">
        <div className={COLS2}>
          <div className="min-w-0">
            <FieldRow label="Freight Mode" fieldKey="freightMode" value={mj.freightMode} onCommit={handleCommit} />
            {/* By air a Full Load reads Single Shipment. */}
            {mj.loadType ? <LockedLoadType value={loadTypeLabel(mj.loadType, mj.freightMode)} /> : (
              <FreightModeContext.Provider value={mj.freightMode || undefined}>
                <FieldRow label="Load Type" fieldKey="loadType" value={mj.loadType} onCommit={handleCommit} synced />
              </FreightModeContext.Provider>
            )}
            <FieldRow label="Trade Direction" fieldKey="tradeDirection" value={mj.tradeDirection} onCommit={handleCommit} />
            <IncotermRow label="Incoterms Origin" fieldKey="incotermOrigin" value={mj.incotermOrigin} onCommit={handleCommit} />
            <IncotermRow label="Incoterms Destination" fieldKey="incotermDestination" value={mj.incotermDestination} onCommit={handleCommit} />
          </div>
          <div className="min-w-0">
            <FieldRow label="Booking Number" fieldKey="bookingNumber" value={mj.bookingNumber} onCommit={handleCommit} synced />
            <FieldRow label="Equipment" fieldKey="equipment" value={mj.equipment} onCommit={handleCommit} />
            <FieldRow label="Shipping line / Coloader" fieldKey="shippingLine" value={mj.shippingLine} onCommit={handleCommit} synced />
            {/* A service name only exists on a consolidation (the coloader's service). */}
            {isConsolidation && (
              <FieldRow label="Service Name" fieldKey="serviceName" value={mj.serviceName} onCommit={handleCommit} synced />
            )}
            {/* The parties, here in the overview rather than in a card of their own. */}
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
            <FieldRow label="Supplier's PIC" fieldKey="supplierPic" value={mj.supplierPic} onCommit={handleCommit} synced />
          </div>
        </div>
      </MasterJobCard>

      {/* KEY DATES — as on the shipment: the second card, in two columns */}
      <MasterJobCard icon={<CalendarOutlined />} title="Key Dates">
        <div className={COLS2}>
          <div className="min-w-0">
            <FieldRow id={MJ_ANCHORS.etd} label="ETD Estimated" fieldKey="estimatedDeparture" value={mj.estimatedDeparture} onCommit={handleCommit} synced />
            {showDeparture && (
              <FieldRow label="ATD Actual" fieldKey="actualDeparture" value={mj.actualDeparture} onCommit={handleCommit} synced />
            )}
            <FieldRow id={MJ_ANCHORS.eta} label="ETA Estimated" fieldKey="estimatedArrival" value={mj.estimatedArrival} onCommit={handleCommit} synced />
            {showArrival && (
              <FieldRow label="ATA Actual" fieldKey="actualArrival" value={mj.actualArrival} onCommit={handleCommit} synced />
            )}
            <FieldRow label="ETA Warehouse/HUB" fieldKey="etaWarehouse" value={mj.etaWarehouse} onCommit={handleCommit} synced />
            {/* The warehouse's actual date right under its estimate, as ATD under ETD. */}
            <FieldRow label="Warehouse Received" fieldKey="warehouseReceivedDate" value={mj.warehouseReceivedDate} onCommit={handleCommit} synced />
            {/* The shipment has these two in its overview; here they close the dates' left column. */}
            <ReadOnlyRow label="Shipments Month" value={getComputedValue("shipmentsDate", data)} />
            <ReadOnlyRow label="Year" value={getComputedValue("shipmentsYear", data)} />
          </div>
          <div className="min-w-0">
            <ReadOnlyRow label="Est. Departure Week" value={getComputedValue("estimatedDepartureWeek", data)} />
            {showDeparture && <ReadOnlyRow label="Actual Departure Week" value={getComputedValue("actualDepartureWeek", data)} />}
            <ReadOnlyRow label="Est. Arrival Week" value={getComputedValue("estimatedArrivalWeek", data)} />
            {showArrival && <ReadOnlyRow label="Actual Arrival Week" value={getComputedValue("actualArrivalWeek", data)} />}
            <FieldRow label="Closing Date (Cargo Closing)" fieldKey="closingDate" value={joinDateTime(mj.closingDate, mj.closingTime)} onCommit={handleCommit} synced />
            <FieldRow label="VGM Closing" fieldKey="vgmClosing" value={joinDateTime(mj.vgmClosing, mj.vgmClosingTime)} onCommit={handleCommit} synced />
            <FieldRow label="SI Closing" fieldKey="siClosing" value={joinDateTime(mj.siClosing, mj.siClosingTime)} onCommit={handleCommit} synced />
            <FieldRow label="AMS Deadline" fieldKey="amsDeadline" value={joinDateTime(mj.amsDeadline, mj.amsDeadlineTime)} onCommit={handleCommit} synced />
            <FieldRow label="ISF Deadline" fieldKey="isfDeadline" value={joinDateTime(mj.isfDeadline, mj.isfDeadlineTime)} onCommit={handleCommit} synced />
          </div>
        </div>
      </MasterJobCard>

      {/* CARRIER & BILL OF LADING — across the width in two columns, now that the parties are in the overview */}
      <MasterJobCard icon={<FileProtectOutlined />} title="Carrier & Bill of Lading">
        <div className={COLS2}>
          <div className="min-w-0">
            <FieldRow label="Master BoL Number" fieldKey="masterBolNumber" value={mj.masterBolNumber} onCommit={handleCommit} synced />
            <FieldRow label="Master BoL Type" fieldKey="masterBolType" value={mj.masterBolType} onCommit={handleCommit} synced />
            <FieldRow label="Vessel" fieldKey="vessel" value={mj.vessel} onCommit={handleCommit} synced />
            <FieldRow label="Voyage" fieldKey="voyage" value={mj.voyage} onCommit={handleCommit} synced />
          </div>
          <div className="min-w-0">
            <FieldRow label="POL" fieldKey="pol" value={mj.pol} onCommit={handleCommit} synced />
            <FieldRow label="POD" fieldKey="pod" value={mj.pod} onCommit={handleCommit} synced />
            <FieldRow label="Destination" fieldKey="destination" value={mj.destination} onCommit={handleCommit} />
          </div>
        </div>
      </MasterJobCard>

      {/* EQUIPMENT & DEPOT  |  MBL CARGO */}
      <div className="grid grid-cols-1 @min-[760px]:grid-cols-2 gap-4">
        <MasterJobCard icon={<EnvironmentOutlined />} title="Equipment & Depot" className="h-full">
          <FieldRow label="Release Reference" fieldKey="releaseReference" value={mj.releaseReference} onCommit={handleCommit} synced />
          <FieldRow label="Release Depot" fieldKey="releaseDepot" value={mj.releaseDepot} onCommit={handleCommit} synced />
          <FieldRow label="Redelivery Reference" fieldKey="redeliveryReference" value={mj.redeliveryReference} onCommit={handleCommit} synced />
          <FieldRow label="Redelivery Depot" fieldKey="redeliveryDepot" value={mj.redeliveryDepot} onCommit={handleCommit} synced />
        </MasterJobCard>
        {/* Totals of the whole MBL; each house keeps its own cargo, so these are not copied. */}
        <MasterJobCard icon={<BuildOutlined />} title="MBL Cargo" className="h-full">
          <FieldRow label="Pieces (PCS)" fieldKey="pcs" value={mj.pcs} onCommit={handleCommit} />
          <FieldRow label="Type Of Packages" fieldKey="typeOfPackages" value={mj.typeOfPackages} onCommit={handleCommit} />
          {/* In kg, as the shipments show their weights; the master job keeps it in tons. */}
          <FieldRow label="Total Weight (kg)" fieldKey="totalWeightKg" value={kgFromTons(mj.totalWeightTons)} onCommit={commitWeightKg} />
          <FieldRow label="Total Volume In CBM" fieldKey="totalVolumeCbm" value={mj.totalVolumeCbm} onCommit={handleCommit} />
        </MasterJobCard>
      </div>

    </div>
  );
}
