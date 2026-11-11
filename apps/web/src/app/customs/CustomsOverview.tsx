"use client";

import Link from "next/link";
import { ContainerOutlined, EnvironmentOutlined, InboxOutlined, SwapOutlined, TruckOutlined } from "@ant-design/icons";
import { PartyContactLink } from "@/app/shipments/[jobNumber]/_components/PartyContactLink";
import { DetailCard } from "@/app/shipments/[jobNumber]/ShipmentDetailContent";
import { type ShipmentItem } from "@/hooks/useShipments";
import { useWarehouseSection } from "@/hooks/useWarehouseSection";
import { truckingLines } from "./_lib/truckingLines";
import { formatDate, formatDateTime } from "@/lib/date";
import { loadTypeLabel } from "@/lib/enums";
import { CUSTOMS_DOCUMENT_TYPES } from "@/lib/documentTypes";
import { customsDeadlineAt } from "@/lib/customsDeadline";
import { RECEIVED_TICKS } from "@/lib/customsReceived";
import { CUSTOMS_CONTAINERS_ID } from "@/app/shipments/[jobNumber]/tabs/CustomsTab";
import { COLS2, LABEL, ROW, VALUE } from "@/app/shipments/[jobNumber]/_components/detailStyles";
import { KPI_TONE_CLASS } from "@/components/KpiTile";
import { CopyButton } from "@/components/CopyButton";
import { EMPTY, HINT, LABEL_TEXT, LINK, PAGE_TITLE, REF, TD, TH } from "@/styles/ui";

// What a customs officer needs from the shipment itself, read-only: everything here is
// kept in Shipments and only shown in Customs.
const ro = (key: string, label: string) => ({ key, label, ro: true });

const ROUTE = [
  ro("pol", "Port of Loading"),
  ro("origin", "Origin"),
  ro("shippingLine", "Shipping line / Coloader"),
  ro("vessel", "Vessel"),
  ro("voyage", "Voyage"),
];

const REFERENCES = [
  ro("pod", "Port of Discharge"),
  ro("destination", "Destination"),
  ro("houseBolNumber", "House BoL Number"),
  ro("insurance", "Insurance"),
];

const noCommit = () => {};

/**
 * The one incoterm customs works with: the origin incoterm for an import, the destination
 * incoterm for an export. A shipment without a direction shows whichever is filled in.
 */
function customsIncoterm(shipment: ShipmentItem): string {
  const direction = (shipment.tradeDirection || "").toLowerCase();
  if (direction === "import") return shipment.incotermOrigin;
  if (direction === "export") return shipment.incotermDestination;
  return shipment.incotermOrigin || shipment.incotermDestination;
}

function InfoRow({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      <div className={VALUE}>{children || <span className={EMPTY}>—</span>}</div>
    </div>
  );
}

/** A party's name, linked to its customer page when the shipment has it linked. */
function PartyName({ name, customerId }: { name: string; customerId?: string | null }) {
  if (!name) return null;
  return customerId ? (
    <Link href={`/customers/${customerId}`} className={`${LINK} font-medium`}>
      {name}
    </Link>
  ) : (
    <>{name}</>
  );
}

// The first column (what the line is) reads from the left; the figures after it are centred
// under their headings, like the cargo table in the shipment.
// `failed`: the lines could not be read, and `empty` says so (in red) rather than that there are none.
function LinesTable({ head, rows, empty, failed = false }: { head: string[]; rows: string[][]; empty: string; failed?: boolean }) {
  if (rows.length === 0) return <div className={`py-3 ${HINT} ${failed ? "!text-red-600" : ""}`}>{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`${TH} ${i === 0 ? "" : "!text-center"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={`${TD} ${j === 0 ? "text-left" : "text-center"}`}>
                  {cell || <span className={EMPTY}>—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface FactProps {
  label: string;
  className?: string;
  children: React.ReactNode;
}

// One fact of the header: a small caps label over its value, as in the shipment header
// (ShipmentFacts). Nothing wraps: a value too long for its column is cut, with the full text on hover.
function Fact({ label, className = "", children }: FactProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className={`${LABEL_TEXT} whitespace-nowrap truncate`} title={label}>{label}</div>
      <div className="mt-0.5 min-h-[22px] flex items-center whitespace-nowrap overflow-hidden text-[13px] font-medium text-slate-900 min-w-0">{children}</div>
    </div>
  );
}

const dash = <span className={EMPTY}>—</span>;

/** A plain value that is cut instead of widening its column. */
const text = (v: string | null | undefined, className = "") => (v ? <span className={`truncate ${className}`} title={v}>{v}</span> : dash);

/**
 * The shipment as customs sees it, in the page header on every tab: which job it is, whose,
 * how urgent and by when; then where and when the cargo arrives and whether the papers are in.
 * Read-only: priority and deadline are changed in the Customs Overview card, the rest in Shipments.
 */
export function CustomsFacts({ shipment }: { shipment: ShipmentItem }) {
  const job = shipment.jobNumber ?? shipment.id;
  const urgent = shipment.customsPriority === "Urgent";
  // A deadline that has passed is shown in red until customs has released the shipment.
  const deadlineAt = customsDeadlineAt(shipment.customsDeadline);
  const overdue =
    urgent && shipment.customsStatus !== "Customs Cleared/Released" && !!deadlineAt && deadlineAt.isBefore(Date.now());
  const received = shipment.documentTypes ?? [];
  const missing = CUSTOMS_DOCUMENT_TYPES.filter((t) => !received.includes(t));
  // The documents follow the uploads: a paper copy ticked as received by hand still has to be
  // uploaded before customs can review it, and the list says so.
  const tickedOnPaper = (type: string) =>
    Object.entries(RECEIVED_TICKS).some(([field, ticked]) => ticked === type && shipment[field as keyof ShipmentItem] === "yes");
  const missingList = missing.map((t) => (tickedOnPaper(t) ? `${t} (on paper, to upload)` : t)).join(", ");
  const pod = shipment.pod;

  return (
    // Two rows of six on a wide screen, lined up as in the shipment header: Job, Direction, Load Type,
    // Customer, Priority, Deadline; then Port of Discharge, ETA Estimated, CFS, ETA Warehouse/HUB,
    // Warehouse Received, Documents. Below xl the job number has a row of its own.
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-[minmax(max-content,1fr)_minmax(96px,0.8fr)_minmax(94px,0.8fr)_minmax(132px,1.5fr)_minmax(140px,1fr)_minmax(170px,1.4fr)] gap-x-6 xl:gap-x-4 2xl:gap-x-6 gap-y-3 xl:gap-y-1.5 xl:[&>*:not(:first-child)]:[contain:inline-size] xl:[&>*:nth-child(n+7)]:pt-1.5 xl:[&>*:nth-child(n+7)]:border-t xl:[&>*:nth-child(n+7)]:border-indigo-100">
      <Fact label="Job" className="col-span-full xl:col-span-1">
        {/* The job number is the page's title. */}
        <div className="flex items-center gap-1 min-w-0">
          <h1 className={`${PAGE_TITLE} ${REF} truncate`} title={job}>
            {job}
          </h1>
          <CopyButton text={job} what="job number" />
        </div>
      </Fact>
      <Fact label="Direction">{text(shipment.tradeDirection)}</Fact>
      <Fact label="Load Type">{text(loadTypeLabel(shipment.loadType, shipment.freightMode))}</Fact>
      <Fact label="Customer">
        {shipment.customer ? (
          shipment.customerId ? (
            <Link href={`/customers/${shipment.customerId}`} className={`${LINK} truncate`} title={shipment.customer}>
              {shipment.customer}
            </Link>
          ) : (
            text(shipment.customer)
          )
        ) : (
          dash
        )}
      </Fact>
      <Fact label="Priority">
        <span className={`font-semibold ${urgent ? KPI_TONE_CLASS.red : KPI_TONE_CLASS.green}`}>{shipment.customsPriority || "Standard"}</span>
      </Fact>
      <Fact label="Deadline">
        {urgent && shipment.customsDeadline ? (
          <span className={`tabular-nums text-[14px] font-semibold ${overdue ? KPI_TONE_CLASS.red : ""}`}>{formatDateTime(shipment.customsDeadline)}</span>
        ) : (
          dash
        )}
      </Fact>
      <Fact label="Port of Discharge">
        <span className="min-w-0">{pod ? <span className="block truncate" title={pod}>{pod}</span> : dash}</span>
      </Fact>
      <Fact label="ETA Estimated">
        <span className="tabular-nums text-[14px] font-semibold">{formatDate(shipment.estimatedArrival) || dash}</span>
      </Fact>
      <Fact label="CFS">{text(shipment.cfs)}</Fact>
      <Fact label="ETA Warehouse/HUB">
        <span className="tabular-nums text-[14px] font-semibold">{formatDate(shipment.etaWarehouse) || dash}</span>
      </Fact>
      <Fact label="Warehouse Received">
        <span className="tabular-nums">{formatDate(shipment.warehouseReceivedDate) || dash}</span>
      </Fact>
      <Fact label="Documents">
        {missing.length === 0 ? (
          <span className={`font-semibold ${KPI_TONE_CLASS.green}`}>Received</span>
        ) : (
          text(`Missing: ${missingList}`, `font-semibold ${KPI_TONE_CLASS.red}`)
        )}
      </Fact>
    </div>
  );
}

/** The shipment's own data, below the Customs card. */
export function CustomsShipmentInfo({ shipment }: { shipment: ShipmentItem }) {
  const cargo = (shipment.cargoItems ?? []).map((c) => [
    c.cargoDescription,
    c.hsCode,
    c.pieces,
    c.packageType,
    c.grossWeight,
    [c.commercialInvoiceValue, c.currency].filter(Boolean).join(" "),
  ]);
  const containers = (shipment.containers ?? []).map((c) => [
    c.containerNumber,
    c.sealNumber,
    c.type,
    [c.packages, c.packageType].filter(Boolean).join(" "),
    c.grossWeight,
    c.volume,
  ]);
  const { data: pickup, isLoading: pickupLoading, isError: pickupFailed } = useWarehouseSection(shipment.id, "pickup");

  return (
    <>
      <DetailCard
        icon={<SwapOutlined />}
        title="Transport"
        columns={[ROUTE, REFERENCES]}
        shipment={shipment}
        onCommit={noCommit}
        renderAfter={{ houseBolNumber: <InfoRow label="Incoterms">{customsIncoterm(shipment)}</InfoRow> }}
      />
      {/* The same card as in the shipment (party as a link to its customer page, contact, address), read-only. */}
      <DetailCard icon={<EnvironmentOutlined />} title="Commercial Parties" columns={[[]]} shipment={shipment} onCommit={noCommit}>
        <div className={COLS2}>
          <div>
            <InfoRow label="Shipper">
              <PartyName name={shipment.shipper} customerId={shipment.shipperId} />
            </InfoRow>
            <InfoRow label="Contact">
              {shipment.shipperContact && shipment.shipperId ? (
                <PartyContactLink name={shipment.shipperContact} contactId={shipment.shipperContactId} customerId={shipment.shipperId} />
              ) : (
                shipment.shipperContact
              )}
            </InfoRow>
            <InfoRow label="Pick-up Address">{shipment.pickupAddress}</InfoRow>
          </div>
          <div>
            <InfoRow label="Consignee">
              <PartyName name={shipment.consignee} customerId={shipment.consigneeId} />
            </InfoRow>
            <InfoRow label="Contact">
              {shipment.consigneeContact && shipment.consigneeId ? (
                <PartyContactLink name={shipment.consigneeContact} contactId={shipment.consigneeContactId} customerId={shipment.consigneeId} />
              ) : (
                shipment.consigneeContact
              )}
            </InfoRow>
            <InfoRow label="Delivery Address">{shipment.deliveryAddress}</InfoRow>
          </div>
        </div>
      </DetailCard>
      <DetailCard icon={<InboxOutlined />} title="Cargo" columns={[[]]} shipment={shipment} onCommit={noCommit}>
        <LinesTable
          head={["Cargo Description", "HS Code", "Pieces", "Package Type", "Gross Weight (kg)", "Invoice Value"]}
          rows={cargo}
          empty="No cargo lines yet — they are entered in the shipment's Cargo Details."
        />
      </DetailCard>
      {/* Container Number in the Customs Overview card links down to this card. */}
      <div id={CUSTOMS_CONTAINERS_ID} className="scroll-mt-4">
      <DetailCard icon={<ContainerOutlined />} title="Containers" columns={[[]]} shipment={shipment} onCommit={noCommit}>
        <LinesTable
          head={["Container Number", "Seal Number", "Type", "Packages", "Gross Weight (kg)", "Volume (m³)"]}
          rows={containers}
          empty="No containers yet — they are entered in the shipment's Container Details."
        />
      </DetailCard>
      </div>
      <DetailCard icon={<TruckOutlined />} title="Trucking" columns={[[]]} shipment={shipment} onCommit={noCommit}>
        {/* Not read (yet), the Pick-up tab says nothing: no "no truck yet", no office line without its plate. */}
        <LinesTable
          head={["Plate Number", "Haulier", "Customs Office"]}
          rows={pickupLoading || pickupFailed ? [] : truckingLines(pickup, shipment.customsOffice)}
          failed={pickupFailed}
          empty={
            pickupLoading
              ? "Loading…"
              : pickupFailed
                ? "The trucks could not be loaded — try again later."
                : "No truck yet — it is entered in the shipment's Warehouse tab, under Pick-up."
          }
        />
      </DetailCard>
    </>
  );
}
