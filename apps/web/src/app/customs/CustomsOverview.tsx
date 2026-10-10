"use client";

import dayjs from "dayjs";
import Link from "next/link";
import { ContainerOutlined, EnvironmentOutlined, InboxOutlined, SwapOutlined } from "@ant-design/icons";
import { DetailCard } from "@/app/shipments/[jobNumber]/ShipmentDetailContent";
import { type ShipmentItem } from "@/hooks/useShipments";
import { formatDate, formatDateTime } from "@/lib/date";
import { CUSTOMS_DOCUMENT_TYPES } from "@/lib/documentTypes";
import { CUSTOMS_CONTAINERS_ID } from "@/app/shipments/[jobNumber]/tabs/CustomsTab";

// What a customs officer needs from the shipment itself, read-only: everything here is
// kept in Shipments and only shown in Customs.
const ro = (key: string, label: string) => ({ key, label, ro: true });

const ROUTE = [
  ro("pol", "POL"),
  ro("pod", "POD"),
  ro("destination", "Destination"),
  ro("shippingLine", "Shipping line / Coloader"),
  ro("vessel", "Vessel"),
  ro("voyage", "Voyage"),
];

const REFERENCES = [
  ro("masterBolNumber", "Master BoL Number"),
  ro("houseBolNumber", "House BoL Number"),
  ro("incotermOrigin", "Incoterm Origin"),
  ro("incotermDestination", "Incoterm Destination"),
  ro("insurance", "Insurance"),
  ro("cargoOrigin", "Cargo Origin"),
  ro("countryCode", "Country Code"),
  ro("personInCharge", "Person In Charge"),
];

const noCommit = () => {};

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

/** "in 1 day 4 h" / "3 h overdue" for an Urgent shipment's deadline. */
function deadlineDistance(deadline: string): { text: string; overdue: boolean } | null {
  const at = dayjs(deadline);
  if (!deadline || !at.isValid()) return null;
  const minutes = at.diff(dayjs(), "minute");
  const abs = Math.abs(minutes);
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const span = days > 0 ? `${days} day${days === 1 ? "" : "s"} ${hours} h` : hours > 0 ? `${hours} h` : `${abs} min`;
  return minutes < 0 ? { text: `${span} overdue`, overdue: true } : { text: `in ${span}`, overdue: false };
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

const TH = "text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide px-2 py-1.5 border-b border-slate-200";
const TD = "px-2 py-1.5 border-b border-slate-100 text-xs text-slate-900 font-medium";

function LinesTable({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <div className="py-3 text-xs text-slate-400">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={TD}>
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
  const distance = urgent ? deadlineDistance(shipment.customsDeadline) : null;
  const received = shipment.documentTypes ?? [];
  const missing = CUSTOMS_DOCUMENT_TYPES.filter((t) => !received.includes(t));

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
        note={
          distance && <span className={distance.overdue ? "text-red-600 font-semibold" : undefined}>{distance.text}</span>
        }
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
        note={(missing.length === 0 ? CUSTOMS_DOCUMENT_TYPES : missing).join(", ")}
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
      {/* The same card as in the shipment (party as a link to its customer page, contact, address), read-only. */}
      <DetailCard icon={<EnvironmentOutlined />} title="Commercial Parties" columns={[[]]} shipment={shipment} onCommit={noCommit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div>
            <InfoRow label="Shipper">
              <PartyName name={shipment.shipper} customerId={shipment.shipperId} />
            </InfoRow>
            <InfoRow label="Contact">{shipment.shipperContact}</InfoRow>
            <InfoRow label="Pick-up Address">{shipment.pickupAddress}</InfoRow>
          </div>
          <div>
            <InfoRow label="Consignee">
              <PartyName name={shipment.consignee} customerId={shipment.consigneeId} />
            </InfoRow>
            <InfoRow label="Contact">{shipment.consigneeContact}</InfoRow>
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
      <DetailCard icon={<SwapOutlined />} title="Transport" columns={[ROUTE, REFERENCES]} shipment={shipment} onCommit={noCommit} />
    </>
  );
}
