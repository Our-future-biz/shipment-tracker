"use client";

import Link from "next/link";
import { ContainerOutlined, EnvironmentOutlined, InboxOutlined, SwapOutlined } from "@ant-design/icons";
import { PartyContactLink } from "@/app/shipments/[jobNumber]/_components/PartyContactLink";
import { DetailCard } from "@/app/shipments/[jobNumber]/ShipmentDetailContent";
import { type ShipmentItem } from "@/hooks/useShipments";
import { formatDate, formatDateTime } from "@/lib/date";
import { CUSTOMS_DOCUMENT_TYPES } from "@/lib/documentTypes";
import { customsDeadlineAt } from "@/lib/customsDeadline";
import { RECEIVED_TICKS } from "@/lib/customsReceived";
import { CUSTOMS_CONTAINERS_ID } from "@/app/shipments/[jobNumber]/tabs/CustomsTab";

// What a customs officer needs from the shipment itself, read-only: everything here is
// kept in Shipments and only shown in Customs.
const ro = (key: string, label: string) => ({ key, label, ro: true });

const ROUTE = [
  ro("pol", "POL"),
  ro("origin", "Origin"),
  ro("shippingLine", "Shipping line / Coloader"),
  ro("vessel", "Vessel"),
  ro("voyage", "Voyage"),
];

const REFERENCES = [
  ro("pod", "POD"),
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
    <div className="flex gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0">
      <span className="w-[140px] shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
      <div className="flex-1 min-w-0 text-slate-900 font-medium">{children || <span className="text-slate-300">—</span>}</div>
    </div>
  );
}

/** A party's name, linked to its customer page when the shipment has it linked. */
function PartyName({ name, customerId }: { name: string; customerId?: string | null }) {
  if (!name) return null;
  return customerId ? (
    <Link href={`/customers/${customerId}`} className="text-indigo-600 hover:underline font-medium">
      {name}
    </Link>
  ) : (
    <>{name}</>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "red" | "green" }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm min-w-0">
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</div>
      <div
        className={`mt-1 text-sm font-semibold truncate ${
          tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-700" : "text-slate-900"
        }`}
      >
        {value || <span className="text-slate-300">—</span>}
      </div>
      {note && <div className="mt-0.5 text-xs text-slate-500 truncate">{note}</div>}
    </div>
  );
}

const TH = "text-[11px] font-bold text-slate-500 uppercase tracking-wide px-2 py-1.5 border-b border-slate-200";
const TD = "px-2 py-1.5 border-b border-slate-100 text-xs text-slate-900 font-medium";

// The first column (what the line is) reads from the left; the figures after it are centred
// under their headings, like the cargo table in the shipment.
function LinesTable({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <div className="py-3 text-xs text-slate-400">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`${TH} ${i === 0 ? "text-left" : "text-center"}`}>
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
                  {cell || <span className="text-slate-300">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The top strip: what is to be cleared and by when. */
export function CustomsSummary({ shipment }: { shipment: ShipmentItem }) {
  const urgent = shipment.customsPriority === "Urgent";
  // A deadline that has passed is shown in red until customs has released the shipment.
  const deadlineAt = customsDeadlineAt(shipment.customsDeadline);
  const overdue =
    urgent && shipment.customsStatus !== "Customs Cleared/Released" && !!deadlineAt && deadlineAt.isBefore(Date.now());
  const received = shipment.documentTypes ?? [];
  const missing = CUSTOMS_DOCUMENT_TYPES.filter((t) => !received.includes(t));
  // The tile follows the uploads: a paper copy ticked as received by hand still has to be
  // uploaded before customs can review it, and the note says so.
  const tickedOnPaper = (type: string) =>
    Object.entries(RECEIVED_TICKS).some(([field, ticked]) => ticked === type && shipment[field as keyof ShipmentItem] === "yes");
  const missingNote = missing.map((t) => (tickedOnPaper(t) ? `${t} (on paper, to upload)` : t)).join(", ");

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      <Tile
        label="Priority"
        value={shipment.customsPriority || "Standard"}
        tone={urgent ? "red" : "green"}
      />
      <Tile
        label="Deadline"
        value={urgent ? formatDateTime(shipment.customsDeadline) : ""}
        tone={overdue ? "red" : undefined}
      />
      <Tile label="Direction" value={shipment.tradeDirection} />
      <Tile
        label="ETA Warehouse/HUB"
        value={formatDate(shipment.etaWarehouse)}
        note={shipment.warehouseReceivedDate && `Received ${formatDate(shipment.warehouseReceivedDate)}`}
      />
      <Tile label="Load Type" value={shipment.loadType} />
      <Tile
        label="Documents"
        value={missing.length === 0 ? "Received" : "Missing"}
        tone={missing.length === 0 ? "green" : "red"}
        note={missingNote}
      />
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

  return (
    <>
      <DetailCard
        icon={<SwapOutlined />}
        title="Transport"
        columns={[ROUTE, REFERENCES]}
        shipment={shipment}
        onCommit={noCommit}
        renderAfter={{ houseBolNumber: <InfoRow label="Incoterm">{customsIncoterm(shipment)}</InfoRow> }}
      />
      {/* The same card as in the shipment (party as a link to its customer page, contact, address), read-only. */}
      <DetailCard icon={<EnvironmentOutlined />} title="Commercial Parties" columns={[[]]} shipment={shipment} onCommit={noCommit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div>
            <InfoRow label="Shipper">
              <PartyName name={shipment.shipper} customerId={shipment.shipperId} />
            </InfoRow>
            <InfoRow label="Contact">
              {shipment.shipperContact && shipment.shipperId ? (
                <PartyContactLink name={shipment.shipperContact} customerId={shipment.shipperId} />
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
                <PartyContactLink name={shipment.consigneeContact} customerId={shipment.consigneeId} />
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
    </>
  );
}
