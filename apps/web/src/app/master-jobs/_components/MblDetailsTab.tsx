"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Tooltip } from "antd";
import { useMessages } from "@/lib/toast";
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
import { FreightModeContext, ShipmentDetailsEditableContext } from "@/app/shipments/[jobNumber]/_components/EditableCell";
import {
  COLUMN_MAP,
  dateTimeUpdate,
  getCellConditionalStyle,
  getComputedValue,
  getRowConditionalStyle,
  joinDateTime,
} from "@/lib/columnConfig";
import { loadTypeLabel } from "@/lib/enums";
import { masterJobModeOf } from "../_lib/masterJobWords";
import { LABEL } from "@/app/shipments/[jobNumber]/_components/detailStyles";
import { EMPTY, LINK, REF } from "@/styles/ui";
import { useMasterJob, type MasterJobItem, type MasterJobUpdate } from "@/hooks/useMasterJobs";
import type { interfaces } from "@/lib/api/client";
import { FieldRow, IncotermRow, Label, MasterJobFieldCard, ROW, ReadOnlyRow, type StyleFor } from "./MasterJobFields";
import { ProgressStages } from "@/app/shipments/[jobNumber]/_components/ShipmentSummary";
import { carrierCardTitle, fieldsForMode, masterBolWord, modeLabel, progressStagesFor } from "@/app/shipments/[jobNumber]/freightModeFields";
import { getStageFromFacts } from "@/app/shipments/[jobNumber]/_components/taskDefinitions";
import { formatDate, formatDateTime } from "@/lib/date";
import { kgFromTons, tonsFromKg } from "../_lib/mblWeight";
import { useAuth } from "@/lib/auth/AuthContext";
import { personShown } from "@/app/shipments/_lib/personNames";
import { usePeopleNames } from "@/app/shipments/_lib/usePeopleNames";
import { canChangeShipmentDetails } from "@/lib/shipmentEditRule";

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

// Created By by name, with the stored e-mail on hover, as a shipment's Created By (PersonRoRow;
// mock test run: the master job showed the e-mail).
function CreatedByRow({ value }: { value: string | null | undefined }) {
  const shown = personShown(value, usePeopleNames());
  return <ReadOnlyRow label="Created By" value={shown.text ? <span title={shown.email || undefined}>{shown.text}</span> : null} />;
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
  /** The Key Dates card: where a date's jump lands when the user's field choice hides its row. */
  dates: "mj-key-dates",
} as const;

/** The rows a date in the summary jumps to, by their names in Key Dates. */
export const MJ_DATE_ROWS: Record<string, string> = {
  [MJ_ANCHORS.etd]: "ETD Estimated",
  [MJ_ANCHORS.eta]: "ETA Estimated",
};

export function MblDetailsTab({ masterJob: mj, onSave }: MblDetailsTabProps) {
  const message = useMessages();
  const { user } = useAuth();
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
  // rule: departed = In transit, arrived = past Arrive at Port of Discharge.
  const stage = getStageFromFacts({ tradeDirection: mj.tradeDirection, actualDeparture: mj.actualDeparture, actualArrival: mj.actualArrival });
  // The freight mode it goes by - its own, else its shipments' one while it has none - for its stages, its rows and
  // every cell alike (Shipments review): a master job of air houses with no Freight Mode is air throughout.
  const mode = masterJobModeOf(mj);
  // The stages by its freight mode, as a shipment's bar: an air master job arrives at its airport (user council T9).
  const stages = progressStagesFor(mode);
  // Its rows in the words of its freight mode, as a shipment's (mock council S4-4): an air master job names its
  // MAWB, flight and airports, and leaves out the empty sea-only rows (voyage, container, VGM / SI closings).
  const named = (key: string, sea: string) => modeLabel(key, sea, mode);
  const rowValue = (key: string): string | null | undefined =>
    key === "containerNumber" ? containerNumbers : (mj as unknown as Record<string, string | null | undefined>)[key];
  const byMode = <F extends { key: string; label: string }>(columns: F[][]): F[][] => columns.map((column) => fieldsForMode(column, mode, rowValue));
  // The empty container's release and redelivery, left out of an air master job while empty; with all four
  // left out the card is too (mock test S21-044).
  const equipColumns = byMode([
    [
      { key: "releaseReference", label: "Release Reference", row: <FieldRow label="Release Reference" fieldKey="releaseReference" value={mj.releaseReference} onCommit={handleCommit} styleFor={styleFor} synced /> },
      { key: "releaseDepot", label: "Release Depot", row: <FieldRow label="Release Depot" fieldKey="releaseDepot" value={mj.releaseDepot} onCommit={handleCommit} styleFor={styleFor} synced /> },
      { key: "redeliveryReference", label: "Redelivery Reference", row: <FieldRow label="Redelivery Reference" fieldKey="redeliveryReference" value={mj.redeliveryReference} onCommit={handleCommit} styleFor={styleFor} synced /> },
      { key: "redeliveryDepot", label: "Redelivery Depot", row: <FieldRow label="Redelivery Depot" fieldKey="redeliveryDepot" value={mj.redeliveryDepot} onCommit={handleCommit} styleFor={styleFor} synced /> },
    ],
  ]);
  const showsEquip = equipColumns.some((column) => column.length > 0);
  const arrivalLabel = stages.find((s) => s.index === 3)?.label ?? "Arrive at Port of Discharge";
  const stageFacts: Record<string, string> = {
    "In transit": mj.actualDeparture ? `ATD ${formatDate(mj.actualDeparture)}` : "",
    [arrivalLabel]: mj.actualArrival ? `ATA ${formatDate(mj.actualArrival)}` : "",
  };

  // Its people are changed only by them or a manager (anyone while neither is named), as a
  // shipment's people; the server refuses the same (masterJob.service).
  const peopleEditable = canChangeShipmentDetails(user, mj);
  const peopleRow = (row: React.ReactNode) => <ShipmentDetailsEditableContext.Provider value={peopleEditable}>{row}</ShipmentDetailsEditableContext.Provider>;

  return (
    // The freight mode reaches every cell, as on a shipment: by air Port of Loading and Port of Discharge also offer
    // airports, by sea Destination ocean terminals, and by air a Full Load reads Single Shipment.
    <FreightModeContext.Provider value={mode || undefined}>
    <div className="@container flex flex-col gap-4 min-w-0">
      {/* The master job's progress, above its cards as on Shipment Details */}
      <ProgressStages activeIndex={stage} factOf={stageFacts} stages={stages} ariaLabel="Master job progress" />
      <MasterJobFieldCard
        cardId="masterJob.overview"
        icon={<ProfileOutlined />}
        title="Master Job Overview"
        columns={byMode([
          [
            { key: "tradeDirection", label: "Trade Direction", row: <FieldRow label="Trade Direction" fieldKey="tradeDirection" value={mj.tradeDirection} onCommit={handleCommit} styleFor={styleFor} /> },
            { key: "freightMode", label: "Freight Mode", row: <FieldRow label="Freight Mode" fieldKey="freightMode" value={mj.freightMode} onCommit={handleCommit} styleFor={styleFor} /> },
            {
              key: "loadType",
              label: "Load Type",
              row: mj.loadType ? (
                <LockedLoadType value={loadTypeLabel(mj.loadType, mode)} />
              ) : (
                <FieldRow label="Load Type" fieldKey="loadType" value={mj.loadType} onCommit={handleCommit} styleFor={styleFor} synced />
              ),
            },
            { key: "incotermOrigin", label: "Incoterms Origin", row: <IncotermRow label="Incoterms Origin" fieldKey="incotermOrigin" value={mj.incotermOrigin} onCommit={handleCommit} /> },
            { key: "incotermDestination", label: "Incoterms Destination", row: <IncotermRow label="Incoterms Destination" fieldKey="incotermDestination" value={mj.incotermDestination} onCommit={handleCommit} /> },
            // Under the incoterms, so the two columns come out even (7 and 6).
            { key: "shipmentsDate", label: "Shipments Month", row: <ReadOnlyRow label="Shipments Month" value={getComputedValue("shipmentsDate", data)} /> },
            { key: "shipmentsYear", label: "Year", row: <ReadOnlyRow label="Year" value={getComputedValue("shipmentsYear", data)} /> },
          ],
          [
            { key: "equipment", label: "Equipment", row: <FieldRow label="Equipment" fieldKey="equipment" value={mj.equipment} onCommit={handleCommit} styleFor={styleFor} /> },
            { key: "shippingLine", label: "Shipping line / Coloader", row: <FieldRow label={named("shippingLine", "Shipping line / Coloader")} fieldKey="shippingLine" value={mj.shippingLine} onCommit={handleCommit} styleFor={styleFor} synced /> },
            { key: "serviceName", label: "Service Name", row: <FieldRow label="Service Name" fieldKey="serviceName" value={mj.serviceName} onCommit={handleCommit} styleFor={styleFor} synced /> },
            // The parties, here in the overview rather than in a card of their own.
            {
              key: "shipper",
              label: "Shipper",
              row: <CustomerLinkField label="Shipper" name={mj.shipper} customerId={mj.shipperId} onChange={(name, id) => save({ shipper: name, shipperId: id })} />,
            },
            {
              key: "consignee",
              label: "Consignee",
              row: <CustomerLinkField label="Consignee" name={mj.consignee} customerId={mj.consigneeId} onChange={(name, id) => save({ consignee: name, consigneeId: id })} />,
            },
            { key: "supplierPic", label: "Supplier's Contact", row: <FieldRow label="Supplier's Contact" fieldKey="supplierPic" value={mj.supplierPic} onCommit={handleCommit} styleFor={styleFor} synced /> },
          ],
        ])}
      />

      {/* KEY DATES — as on the shipment: the second card, in two columns. Evened out, 8 and 7: the
          voyage on the left, each date with its week under it; the warehouse and the closings on
          the right. */}
      <MasterJobFieldCard
        id={MJ_ANCHORS.dates}
        cardId="masterJob.dates"
        icon={<CalendarOutlined />}
        title="Key Dates"
        columns={byMode([
          [
            { key: "estimatedDeparture", label: "ETD Estimated", row: <FieldRow id={MJ_ANCHORS.etd} label="ETD Estimated" fieldKey="estimatedDeparture" value={mj.estimatedDeparture} onCommit={handleCommit} styleFor={styleFor} synced /> },
            { key: "estimatedDepartureWeek", label: "Est. Departure Week", row: <ReadOnlyRow label="Est. Departure Week" value={getComputedValue("estimatedDepartureWeek", data)} /> },
            { key: "actualDeparture", label: "ATD Actual", row: <FieldRow label="ATD Actual" fieldKey="actualDeparture" value={mj.actualDeparture} onCommit={handleCommit} styleFor={styleFor} synced /> },
            { key: "actualDepartureWeek", label: "Actual Departure Week", row: <ReadOnlyRow label="Actual Departure Week" value={getComputedValue("actualDepartureWeek", data)} /> },
            { key: "estimatedArrival", label: "ETA Estimated", row: <FieldRow id={MJ_ANCHORS.eta} label="ETA Estimated" fieldKey="estimatedArrival" value={mj.estimatedArrival} onCommit={handleCommit} styleFor={styleFor} synced /> },
            { key: "estimatedArrivalWeek", label: "Est. Arrival Week", row: <ReadOnlyRow label="Est. Arrival Week" value={getComputedValue("estimatedArrivalWeek", data)} /> },
            { key: "actualArrival", label: "ATA Actual", row: <FieldRow label="ATA Actual" fieldKey="actualArrival" value={mj.actualArrival} onCommit={handleCommit} styleFor={styleFor} synced /> },
            { key: "actualArrivalWeek", label: "Actual Arrival Week", row: <ReadOnlyRow label="Actual Arrival Week" value={getComputedValue("actualArrivalWeek", data)} /> },
          ],
          [
            { key: "etaWarehouse", label: "ETA Warehouse/HUB", row: <FieldRow label="ETA Warehouse/HUB" fieldKey="etaWarehouse" value={mj.etaWarehouse} onCommit={handleCommit} styleFor={styleFor} synced /> },
            // The warehouse's actual date right under its estimate.
            { key: "warehouseReceivedDate", label: "Warehouse Received", row: <FieldRow label="Warehouse Received" fieldKey="warehouseReceivedDate" value={mj.warehouseReceivedDate} onCommit={handleCommit} styleFor={styleFor} synced /> },
            { key: "closingDate", label: "Closing Date (Cargo Closing)", row: <FieldRow label="Closing Date (Cargo Closing)" fieldKey="closingDate" value={joinDateTime(mj.closingDate, mj.closingTime)} onCommit={handleCommit} styleFor={styleFor} synced /> },
            { key: "vgmClosing", label: "VGM Closing", row: <FieldRow label="VGM Closing" fieldKey="vgmClosing" value={joinDateTime(mj.vgmClosing, mj.vgmClosingTime)} onCommit={handleCommit} styleFor={styleFor} synced /> },
            { key: "siClosing", label: "SI Closing", row: <FieldRow label="SI Closing" fieldKey="siClosing" value={joinDateTime(mj.siClosing, mj.siClosingTime)} onCommit={handleCommit} styleFor={styleFor} synced /> },
            { key: "amsDeadline", label: "AMS Deadline", row: <FieldRow label="AMS Deadline" fieldKey="amsDeadline" value={joinDateTime(mj.amsDeadline, mj.amsDeadlineTime)} onCommit={handleCommit} styleFor={styleFor} synced /> },
            { key: "isfDeadline", label: "ISF Deadline", row: <FieldRow label="ISF Deadline" fieldKey="isfDeadline" value={joinDateTime(mj.isfDeadline, mj.isfDeadlineTime)} onCommit={handleCommit} styleFor={styleFor} synced /> },
          ],
        ])}
      />

      {/* CARRIER & BILL OF LADING  |  REFERENCES & ROUTING */}
      <div className="grid grid-cols-1 @min-[760px]:grid-cols-2 gap-4">
        <MasterJobFieldCard
          cardId="masterJob.carrier"
          icon={<FileProtectOutlined />}
          title={carrierCardTitle(mode)}
          className="h-full"
          columns={byMode([
            [
              { key: "vessel", label: "Vessel", row: <FieldRow label={named("vessel", "Vessel")} fieldKey="vessel" value={mj.vessel} onCommit={handleCommit} styleFor={styleFor} synced /> },
              { key: "voyage", label: "Voyage", row: <FieldRow label="Voyage" fieldKey="voyage" value={mj.voyage} onCommit={handleCommit} styleFor={styleFor} synced /> },
              { key: "containerNumber", label: "Container Number", row: <ContainerNumberLinkRow value={containerNumbers} href={containersHref} /> },
              { key: "masterBolNumber", label: "Master BoL Number", row: <FieldRow label={named("masterBolNumber", "Master BoL Number")} fieldKey="masterBolNumber" value={mj.masterBolNumber} onCommit={handleCommit} styleFor={styleFor} synced /> },
              { key: "masterBolType", label: "Master BoL Type", row: <FieldRow label={named("masterBolType", "Master BoL Type")} fieldKey="masterBolType" value={mj.masterBolType} onCommit={handleCommit} styleFor={styleFor} synced /> },
            ],
          ])}
        />
        <MasterJobFieldCard
          cardId="masterJob.refsRouting"
          icon={<NodeIndexOutlined />}
          title="References & Routing"
          className="h-full"
          columns={byMode([
            [
              { key: "bookingNumber", label: "Booking Number", row: <FieldRow label="Booking Number" fieldKey="bookingNumber" value={mj.bookingNumber} onCommit={handleCommit} styleFor={styleFor} synced /> },
              { key: "pol", label: "Port of Loading", row: <FieldRow label={named("pol", "Port of Loading")} fieldKey="pol" value={mj.pol} onCommit={handleCommit} styleFor={styleFor} synced /> },
              { key: "pod", label: "Port of Discharge", row: <FieldRow label={named("pod", "Port of Discharge")} fieldKey="pod" value={mj.pod} onCommit={handleCommit} styleFor={styleFor} synced /> },
              { key: "hub", label: "HUB", row: <FieldRow label="HUB" fieldKey="hub" value={mj.hub} onCommit={handleCommit} styleFor={styleFor} synced /> },
              { key: "destination", label: "Destination", row: <FieldRow label="Destination" fieldKey="destination" value={mj.destination} onCommit={handleCommit} styleFor={styleFor} /> },
            ],
          ])}
        />
      </div>

      {/* EQUIPMENT & DEPOT  |  MBL CARGO (an air master job's MAWB Cargo) */}
      <div className="grid grid-cols-1 @min-[760px]:grid-cols-2 gap-4">
        {showsEquip && (
          <MasterJobFieldCard cardId="masterJob.equip" icon={<ContainerOutlined />} title="Equipment & Depot" className="h-full" columns={equipColumns} />
        )}
        {/* Totals of the whole MBL; each house keeps its own cargo, so these are not copied. */}
        <MasterJobFieldCard
          cardId="masterJob.cargo"
          icon={<InboxOutlined />}
          title={`${masterBolWord(mode)} Cargo`}
          className="h-full"
          columns={[
            [
              { key: "pcs", label: "COLLI", row: <FieldRow label="COLLI" fieldKey="pcs" value={mj.pcs} onCommit={handleCommit} styleFor={styleFor} /> },
              { key: "typeOfPackages", label: "Type Of Packages", row: <FieldRow label="Type Of Packages" fieldKey="typeOfPackages" value={mj.typeOfPackages} onCommit={handleCommit} styleFor={styleFor} /> },
              // In kg, as the shipments show their weights; the master job keeps it in tons.
              { key: "totalWeightKg", label: "Total Weight In KG", row: <FieldRow label="Total Weight In KG" fieldKey="totalWeightKg" value={kgFromTons(mj.totalWeightTons)} onCommit={commitWeightKg} styleFor={styleFor} /> },
              { key: "totalVolumeCbm", label: "Total Volume In CBM", row: <FieldRow label="Total Volume In CBM" fieldKey="totalVolumeCbm" value={mj.totalVolumeCbm} onCommit={handleCommit} styleFor={styleFor} /> },
            ],
          ]}
        />
      </div>

      {/* BASIC INFORMATION — the master job's own record, at the bottom as on a shipment. Its
          people (a user picked by e-mail) on the left, who created it and when on the right. */}
      <MasterJobFieldCard
        cardId="masterJob.basic"
        icon={<InfoCircleOutlined />}
        title="Basic Information"
        columns={[
          [
            { key: "personInCharge", label: "Handled By", row: peopleRow(<FieldRow label="Handled By" fieldKey="personInCharge" value={mj.personInCharge} onCommit={handleCommit} />) },
            { key: "holidayCover", label: "Holiday Cover", row: peopleRow(<FieldRow label="Holiday Cover" fieldKey="holidayCover" value={mj.holidayCover} onCommit={handleCommit} />) },
          ],
          [
            { key: "createdBy", label: "Created By", row: <CreatedByRow value={mj.createdBy} /> },
            { key: "createdAt", label: "Created On", row: <ReadOnlyRow label="Created On" value={formatDateTime(mj.createdAt)} /> },
          ],
        ]}
      />
    </div>
    </FreightModeContext.Provider>
  );
}
