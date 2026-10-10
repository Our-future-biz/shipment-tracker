"use client";

import dayjs from "dayjs";
import { ContainerOutlined, InboxOutlined, SwapOutlined, TeamOutlined } from "@ant-design/icons";
import { DetailCard } from "@/app/shipments/[jobNumber]/ShipmentDetailContent";
import { type ShipmentItem } from "@/hooks/useShipments";
import { formatDate, formatDateTime } from "@/lib/date";
import { CUSTOMS_DOCUMENT_TYPES } from "@/lib/documentTypes";

// What a customs officer needs from the shipment itself, read-only: everything here is
// kept in Shipments and only shown in Customs.
const ro = (key: string, label: string) => ({ key, label, ro: true });

const PARTIES = [
  ro("customer", "Customer"),
  ro("customerPic", "Customer's PIC"),
  ro("shipper", "Shipper"),
  ro("consignee", "Consignee"),
  ro("personInCharge", "Person In Charge"),
];

const TERMS = [
  ro("incotermOrigin", "Incoterm Origin"),
  ro("incotermDestination", "Incoterm Destination"),
  ro("insurance", "Insurance"),
  ro("cargoOrigin", "Cargo Origin"),
  ro("countryCode", "Country Code"),
];

const ROUTE = [
  ro("pol", "POL"),
  ro("pod", "POD"),
  ro("destination", "Destination"),
  ro("deliveryAddress", "Delivery Address"),
  ro("shippingLine", "Shipping line / Coloader"),
  ro("vessel", "Vessel"),
  ro("voyage", "Voyage"),
];

const REFERENCES = [
  ro("status", "Shipment Status"),
  ro("bookingNumber", "Booking Number"),
  ro("masterBolNumber", "Master BoL Number"),
  ro("masterBolType", "Master BoL Type"),
  ro("houseBolNumber", "House BoL Number"),
  ro("houseBolType", "House BoL Type"),
];

const noCommit = () => {};

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
  const isExport = (shipment.tradeDirection || "").toLowerCase() === "export";

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
      <Tile label="Direction" value={shipment.tradeDirection} note={shipment.freightMode} />
      <Tile
        label="Priority"
        value={shipment.customsPriority || "Standard"}
        tone={urgent ? "red" : undefined}
        note={
          urgent && shipment.customsDeadline ? (
            <span className={distance?.overdue ? "text-red-600 font-semibold" : undefined}>
              {formatDateTime(shipment.customsDeadline)}
              {distance ? ` · ${distance.text}` : ""}
            </span>
          ) : undefined
        }
      />
      <Tile
        label={isExport ? "Departure (ETD)" : "Arrival (ETA)"}
        value={formatDate(isExport ? shipment.estimatedDeparture : shipment.estimatedArrival)}
        note={
          isExport
            ? shipment.closingDate && `Closing ${formatDate(shipment.closingDate)}`
            : shipment.actualArrival && `Arrived ${formatDate(shipment.actualArrival)}`
        }
      />
      <Tile label="Load" value={shipment.loadType} note={shipment.containerTypeSummary} />
      <Tile
        label="Commercial documents"
        value={missing.length === 0 ? "Invoice and Packing list received" : `Missing: ${missing.join(", ")}`}
        tone={missing.length === 0 ? "green" : "red"}
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
      <DetailCard icon={<InboxOutlined />} title="Cargo" columns={[[]]} shipment={shipment} onCommit={noCommit}>
        <LinesTable
          head={["Cargo Description", "HS Code", "Pieces", "Package Type", "Gross Weight (kg)", "Invoice Value"]}
          rows={cargo}
          empty="No cargo lines yet — they are entered in the shipment's Cargo Details."
        />
      </DetailCard>
      <DetailCard icon={<ContainerOutlined />} title="Containers" columns={[[]]} shipment={shipment} onCommit={noCommit}>
        <LinesTable
          head={["Container Number", "Seal Number", "Type", "Packages", "Gross Weight (kg)", "Volume (m³)"]}
          rows={containers}
          empty="No containers yet — they are entered in the shipment's Container Details."
        />
      </DetailCard>
      <DetailCard icon={<TeamOutlined />} title="Parties & Terms" columns={[PARTIES, TERMS]} shipment={shipment} onCommit={noCommit} />
      <DetailCard icon={<SwapOutlined />} title="Transport" columns={[ROUTE, REFERENCES]} shipment={shipment} onCommit={noCommit} />
    </>
  );
}
