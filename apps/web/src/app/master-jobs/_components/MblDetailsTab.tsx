"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { App, Tooltip } from "antd";
import { apiErrorMessage } from "@/lib/api";
import {
  CalendarOutlined,
  ContainerOutlined,
  FileProtectOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  LockOutlined,
  NodeIndexOutlined,
  ProfileOutlined,
} from "@ant-design/icons";
import { CustomerLinkField } from "@/app/shipments/[jobNumber]/_components/CustomerLinkField";
import { FreightModeContext } from "@/app/shipments/[jobNumber]/_components/EditableCell";
import {
  COLUMN_MAP,
  dateTimeUpdate,
  getCellConditionalStyle,
  getComputedValue,
  getRowConditionalStyle,
  joinDateTime,
} from "@/lib/columnConfig";
import { loadTypeLabel } from "@/lib/enums";
import { COLS2, LABEL } from "@/app/shipments/[jobNumber]/_components/detailStyles";
import { EMPTY, LINK, REF } from "@/styles/ui";
import { useMasterJob, type MasterJobItem, type MasterJobUpdate } from "@/hooks/useMasterJobs";
import type { interfaces } from "@/lib/api/client";
import { FieldRow, IncotermRow, Label, MasterJobCard, ROW, ReadOnlyRow, type StyleFor } from "./MasterJobFields";
import { ProgressStages } from "@/app/shipments/[jobNumber]/_components/ShipmentSummary";
import { getStageFromFacts } from "@/app/shipments/[jobNumber]/_components/taskDefinitions";
import { formatDate, formatDateTime } from "@/lib/date";
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

// Container Number as a link, as on Shipment Details: a click opens the master job's Container
// Details tab, where each container is listed with its seal, type and shipments.
function ContainerNumberLinkRow({ value, href }: { value: string; href: string }) {
  return (
    <div className={ROW}>
      <span className={LABEL}>Container Number</span>
      {value ? (
        <div className="flex-1 min-w-0 truncate">
          {/* A tab switch, as the tab strip does it: no new history entry. */}
          <Link href={href} replace title="Open Container Details" className={`${LINK} ${REF} font-medium`}>
            {value}
          </Link>
        </div>
      ) : (
        <span className={`flex-1 min-w-0 ${EMPTY}`}>—</span>
      )}
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

// The Shipments list's colours, as Shipment Details gives its rows (makeStyleFor there): a past
// date green and bold, the MBL type's tint, and an OBL turns every value red.
function makeStyleFor(data: Record<string, string>): StyleFor {
  const rowStyle = getRowConditionalStyle(data);
  return (fieldKey, value) => {
    const merged: React.CSSProperties = { ...(rowStyle ?? {}), ...(getCellConditionalStyle(fieldKey, value ?? "", data) ?? {}) };
    return Object.keys(merged).length ? merged : undefined;
  };
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
  const qc = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The same read as the page's (one cache), for the container numbers.
  const { containers } = useMasterJob(mj.id);
  const data = rowData(mj);
  const styleFor = makeStyleFor(data);

  // The master job as useMasterJob keeps it (hooks/useMasterJobs.ts), which the page shows.
  const cacheKey = ["master-jobs", "one", mj.id];
  const save = async (patch: MasterJobUpdate) => {
    // The new value shows at once, as on a shipment, while the save (which also writes every house) runs.
    await qc.cancelQueries({ queryKey: cacheKey });
    const before = qc.getQueryData<interfaces.MasterJobDetail>(cacheKey)?.masterJob;
    qc.setQueryData<interfaces.MasterJobDetail>(cacheKey, (old) => old && { ...old, masterJob: { ...old.masterJob, ...patch } });
    try {
      await onSave(patch);
    } catch (e) {
      // Only what this save changed goes back (another save may be on its way), then it is read again.
      if (before) {
        const undo = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof MasterJobItem]])) as Partial<MasterJobItem>;
        qc.setQueryData<interfaces.MasterJobDetail>(cacheKey, (old) => old && { ...old, masterJob: { ...old.masterJob, ...undo } });
      }
      qc.invalidateQueries({ queryKey: cacheKey });
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

  // The containers' numbers, as a shipment shows its own; the link opens their tab, the rest of the
  // address kept.
  const containerNumbers = containers.map((c) => c.containerNumber.trim()).filter(Boolean).join(", ");
  const containersParams = new URLSearchParams(searchParams.toString());
  containersParams.set("tab", "containers");
  const containersHref = `${pathname}?${containersParams.toString()}`;

  // Laid out like the Shipment Details tab's main column: the overview (with the parties) and the
  // Key Dates in two columns, then Carrier & Bill of Lading beside References & Routing and
  // Equipment & Depot beside MBL Cargo once the column is wide enough, and Basic Information last.
  // The stages, as the shipment's progress bar shows them. A master job has no task ticks, customs
  // status or delivery (those are its shipments'), so its own dates move it, by the shipment's
  // rule: departed = In transit, arrived = past Arrive at POD.
  const stage = getStageFromFacts({ tradeDirection: mj.tradeDirection, actualDeparture: mj.actualDeparture, actualArrival: mj.actualArrival });
  const stageFacts: Record<string, string> = {
    "In transit": mj.actualDeparture ? `ATD ${formatDate(mj.actualDeparture)}` : "",
    "Arrive at POD": mj.actualArrival ? `ATA ${formatDate(mj.actualArrival)}` : "",
  };

  return (
    // The freight mode reaches every cell, as on a shipment: by air POL and POD also offer
    // airports, by sea Destination ocean terminals, and by air a Full Load reads Single Shipment.
    <FreightModeContext.Provider value={mj.freightMode || undefined}>
    <div className="@container flex flex-col gap-4 min-w-0">
      {/* The master job's progress, above its cards as on Shipment Details */}
      <ProgressStages activeIndex={stage} factOf={stageFacts} ariaLabel="Master job progress" />
      <MasterJobCard icon={<ProfileOutlined />} title="Master Job Overview">
        <div className={COLS2}>
          <div className="min-w-0">
            <FieldRow label="Trade Direction" fieldKey="tradeDirection" value={mj.tradeDirection} onCommit={handleCommit} styleFor={styleFor} />
            <FieldRow label="Freight Mode" fieldKey="freightMode" value={mj.freightMode} onCommit={handleCommit} styleFor={styleFor} />
            {mj.loadType ? (
              <LockedLoadType value={loadTypeLabel(mj.loadType, mj.freightMode)} />
            ) : (
              <FieldRow label="Load Type" fieldKey="loadType" value={mj.loadType} onCommit={handleCommit} styleFor={styleFor} synced />
            )}
            <IncotermRow label="Incoterms Origin" fieldKey="incotermOrigin" value={mj.incotermOrigin} onCommit={handleCommit} />
            <IncotermRow label="Incoterms Destination" fieldKey="incotermDestination" value={mj.incotermDestination} onCommit={handleCommit} />
            {/* Under the incoterms, so the two columns come out even (7 and 6). */}
            <ReadOnlyRow label="Shipments Month" value={getComputedValue("shipmentsDate", data)} />
            <ReadOnlyRow label="Year" value={getComputedValue("shipmentsYear", data)} />
          </div>
          <div className="min-w-0">
            <FieldRow label="Equipment" fieldKey="equipment" value={mj.equipment} onCommit={handleCommit} styleFor={styleFor} />
            <FieldRow label="Shipping line / Coloader" fieldKey="shippingLine" value={mj.shippingLine} onCommit={handleCommit} styleFor={styleFor} synced />
            <FieldRow label="Service Name" fieldKey="serviceName" value={mj.serviceName} onCommit={handleCommit} styleFor={styleFor} synced />
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
            <FieldRow label="Supplier's PIC" fieldKey="supplierPic" value={mj.supplierPic} onCommit={handleCommit} styleFor={styleFor} synced />
          </div>
        </div>
      </MasterJobCard>

      {/* KEY DATES — as on the shipment: the second card, in two columns */}
      <MasterJobCard icon={<CalendarOutlined />} title="Key Dates">
        {/* Evened out, 8 and 7: the voyage on the left, each date with its week under it; the warehouse
            and the closings on the right. */}
        <div className={COLS2}>
          <div className="min-w-0">
            <FieldRow id={MJ_ANCHORS.etd} label="ETD Estimated" fieldKey="estimatedDeparture" value={mj.estimatedDeparture} onCommit={handleCommit} styleFor={styleFor} synced />
            <ReadOnlyRow label="Est. Departure Week" value={getComputedValue("estimatedDepartureWeek", data)} />
            <FieldRow label="ATD Actual" fieldKey="actualDeparture" value={mj.actualDeparture} onCommit={handleCommit} styleFor={styleFor} synced />
            <ReadOnlyRow label="Actual Departure Week" value={getComputedValue("actualDepartureWeek", data)} />
            <FieldRow id={MJ_ANCHORS.eta} label="ETA Estimated" fieldKey="estimatedArrival" value={mj.estimatedArrival} onCommit={handleCommit} styleFor={styleFor} synced />
            <ReadOnlyRow label="Est. Arrival Week" value={getComputedValue("estimatedArrivalWeek", data)} />
            <FieldRow label="ATA Actual" fieldKey="actualArrival" value={mj.actualArrival} onCommit={handleCommit} styleFor={styleFor} synced />
            <ReadOnlyRow label="Actual Arrival Week" value={getComputedValue("actualArrivalWeek", data)} />
          </div>
          <div className="min-w-0">
            <FieldRow label="ETA Warehouse/HUB" fieldKey="etaWarehouse" value={mj.etaWarehouse} onCommit={handleCommit} styleFor={styleFor} synced />
            {/* The warehouse's actual date right under its estimate. */}
            <FieldRow label="Warehouse Received" fieldKey="warehouseReceivedDate" value={mj.warehouseReceivedDate} onCommit={handleCommit} styleFor={styleFor} synced />
            <FieldRow label="Closing Date (Cargo Closing)" fieldKey="closingDate" value={joinDateTime(mj.closingDate, mj.closingTime)} onCommit={handleCommit} styleFor={styleFor} synced />
            <FieldRow label="VGM Closing" fieldKey="vgmClosing" value={joinDateTime(mj.vgmClosing, mj.vgmClosingTime)} onCommit={handleCommit} styleFor={styleFor} synced />
            <FieldRow label="SI Closing" fieldKey="siClosing" value={joinDateTime(mj.siClosing, mj.siClosingTime)} onCommit={handleCommit} styleFor={styleFor} synced />
            <FieldRow label="AMS Deadline" fieldKey="amsDeadline" value={joinDateTime(mj.amsDeadline, mj.amsDeadlineTime)} onCommit={handleCommit} styleFor={styleFor} synced />
            <FieldRow label="ISF Deadline" fieldKey="isfDeadline" value={joinDateTime(mj.isfDeadline, mj.isfDeadlineTime)} onCommit={handleCommit} styleFor={styleFor} synced />
          </div>
        </div>
      </MasterJobCard>

      {/* CARRIER & BILL OF LADING  |  REFERENCES & ROUTING */}
      <div className="grid grid-cols-1 @min-[760px]:grid-cols-2 gap-4">
        <MasterJobCard icon={<FileProtectOutlined />} title="Carrier & Bill of Lading" className="h-full">
          <FieldRow label="Vessel" fieldKey="vessel" value={mj.vessel} onCommit={handleCommit} styleFor={styleFor} synced />
          <FieldRow label="Voyage" fieldKey="voyage" value={mj.voyage} onCommit={handleCommit} styleFor={styleFor} synced />
          <ContainerNumberLinkRow value={containerNumbers} href={containersHref} />
          <FieldRow label="Master BoL Number" fieldKey="masterBolNumber" value={mj.masterBolNumber} onCommit={handleCommit} styleFor={styleFor} synced />
          <FieldRow label="Master BoL Type" fieldKey="masterBolType" value={mj.masterBolType} onCommit={handleCommit} styleFor={styleFor} synced />
        </MasterJobCard>
        <MasterJobCard icon={<NodeIndexOutlined />} title="References & Routing" className="h-full">
          <FieldRow label="Booking Number" fieldKey="bookingNumber" value={mj.bookingNumber} onCommit={handleCommit} styleFor={styleFor} synced />
          <FieldRow label="POL" fieldKey="pol" value={mj.pol} onCommit={handleCommit} styleFor={styleFor} synced />
          <FieldRow label="POD" fieldKey="pod" value={mj.pod} onCommit={handleCommit} styleFor={styleFor} synced />
          <FieldRow label="HUB" fieldKey="hub" value={mj.hub} onCommit={handleCommit} styleFor={styleFor} synced />
          <FieldRow label="Destination" fieldKey="destination" value={mj.destination} onCommit={handleCommit} styleFor={styleFor} />
        </MasterJobCard>
      </div>

      {/* EQUIPMENT & DEPOT  |  MBL CARGO */}
      <div className="grid grid-cols-1 @min-[760px]:grid-cols-2 gap-4">
        <MasterJobCard icon={<ContainerOutlined />} title="Equipment & Depot" className="h-full">
          <FieldRow label="Release Reference" fieldKey="releaseReference" value={mj.releaseReference} onCommit={handleCommit} styleFor={styleFor} synced />
          <FieldRow label="Release Depot" fieldKey="releaseDepot" value={mj.releaseDepot} onCommit={handleCommit} styleFor={styleFor} synced />
          <FieldRow label="Redelivery Reference" fieldKey="redeliveryReference" value={mj.redeliveryReference} onCommit={handleCommit} styleFor={styleFor} synced />
          <FieldRow label="Redelivery Depot" fieldKey="redeliveryDepot" value={mj.redeliveryDepot} onCommit={handleCommit} styleFor={styleFor} synced />
        </MasterJobCard>
        {/* Totals of the whole MBL; each house keeps its own cargo, so these are not copied. */}
        <MasterJobCard icon={<InboxOutlined />} title="MBL Cargo" className="h-full">
          <FieldRow label="COLLI" fieldKey="pcs" value={mj.pcs} onCommit={handleCommit} styleFor={styleFor} />
          <FieldRow label="Type Of Packages" fieldKey="typeOfPackages" value={mj.typeOfPackages} onCommit={handleCommit} styleFor={styleFor} />
          {/* In kg, as the shipments show their weights; the master job keeps it in tons. */}
          <FieldRow label="Total Weight In KG" fieldKey="totalWeightKg" value={kgFromTons(mj.totalWeightTons)} onCommit={commitWeightKg} styleFor={styleFor} />
          <FieldRow label="Total Volume In CBM" fieldKey="totalVolumeCbm" value={mj.totalVolumeCbm} onCommit={handleCommit} styleFor={styleFor} />
        </MasterJobCard>
      </div>

      {/* BASIC INFORMATION — the master job's own record, at the bottom as on a shipment */}
      <MasterJobCard icon={<InfoCircleOutlined />} title="Basic Information">
        {/* Its people (a user picked by e-mail) on the left, who created it and when on the right. */}
        <div className={COLS2}>
          <div className="min-w-0">
            <FieldRow label="Person In Charge" fieldKey="personInCharge" value={mj.personInCharge} onCommit={handleCommit} />
            <FieldRow label="Holiday Cover" fieldKey="holidayCover" value={mj.holidayCover} onCommit={handleCommit} />
          </div>
          <div className="min-w-0">
            <ReadOnlyRow label="Created By" value={mj.createdBy} />
            <ReadOnlyRow label="Created On" value={formatDateTime(mj.createdAt)} />
          </div>
        </div>
      </MasterJobCard>
    </div>
    </FreightModeContext.Provider>
  );
}
