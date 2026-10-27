"use client";

import { Fragment } from "react";
import type { ReactNode } from "react";
import type { ShipmentItem } from "@/hooks/useShipments";
import { dimensionTotals, num } from "@/lib/cargo";
import { HoverCard } from "./HoverCard";

// ── Pure summary helpers (unit-tested in ShipmentHoverCard.test.ts) ──

interface CargoTotals {
  pcs: number;
  kg: number;
  m3: number;
}

const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((t, r) => t + f(r), 0);
// The stored count and the API totals come as en-US text ("1,353"): commas are thousands here.
const enUs = (v: string | null | undefined) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Pieces, weight and volume, in the API's order (cargoProjection.projectCargo):
 * containers, then cargo items, then dimension lines; items carry no volume. A shipment without
 * rows falls back to its stored pcs / tons / cbm.
 */
export function cargoTotals(s: ShipmentItem): CargoTotals {
  const containers = s.containers ?? [];
  const items = s.cargoItems ?? [];
  const dims = s.cargoDimensions ?? [];
  if (!containers.length && !items.length && !dims.length) {
    return {
      pcs: enUs(s.pcs),
      kg: num(s.totalWeightTons) * 1000, // stored free text: a comma is a decimal point ("4,2" t)
      m3: num(s.totalVolumeCbm),
    };
  }
  const d = dimensionTotals(dims);
  const contPcs = sum(containers, (c) => num(c.packages));
  const itemPcs = sum(items, (i) => num(i.pieces));
  const pcs = contPcs || itemPcs || d.pcs;
  return {
    pcs,
    kg: sum(containers, (c) => num(c.grossWeight)) || sum(items, (i) => num(i.grossWeight)) || d.kg,
    m3: sum(containers, (c) => num(c.volume)) || d.m3,
  };
}

// No thousands separator, so the ", " between the parts stays unambiguous ("2644 kg").
const plain = (n: number, decimals: number) => n.toLocaleString("en-US", { maximumFractionDigits: decimals, useGrouping: false });

/** "10 pcs", "" for no pieces. */
export function piecesText(pcs: number): string {
  return pcs > 0 ? `${plain(pcs, 2)} pcs` : "";
}

/** "2644 kg" (whole kg; below 10 kg up to 2 decimals), "" for none. */
export function weightText(kg: number): string {
  if (!(kg > 0)) return "";
  return `${kg >= 10 ? plain(Math.round(kg), 0) : plain(kg, 2)} kg`;
}

/** "3.45 cbm" (up to 2 decimals; "<0.01 cbm" for a crumb), "" for none. */
export function volumeText(m3: number): string {
  if (!(m3 > 0)) return "";
  return m3 < 0.01 ? "<0.01 cbm" : `${plain(m3, 2)} cbm`;
}

/** The cargo in short: "10 pcs, 2644 kg, 3.45 cbm"; parts without a value are left out, "" when none has one. */
export function cargoLine(s: ShipmentItem): string {
  const t = cargoTotals(s);
  return [piecesText(t.pcs), weightText(t.kg), volumeText(t.m3)].filter(Boolean).join(", ");
}

// ── The card ──

interface ShipmentHoverCardProps {
  shipment: ShipmentItem;
  /** The job number's colour in the grid (its row's conditional formatting); the app's indigo without one. */
  jobNumberColor?: string;
  children: ReactNode;
}

// A small card of a shipment that appears when the pointer rests on its job number for a moment,
// like the customer and contact cards: the job number, then Customer, Load Type, Freight Mode,
// Trade Direction and the cargo in short. Everything comes from the grid row, so nothing is loaded; an empty value shows "—".
export function ShipmentHoverCard({ shipment, jobNumberColor, children }: ShipmentHoverCardProps) {
  const rows: [string, string][] = [
    ["Customer", (shipment.customer ?? "").trim()],
    ["Load Type", (shipment.loadType ?? "").trim()],
    ["Freight Mode", (shipment.freightMode ?? "").trim()],
    ["Trade Direction", (shipment.tradeDirection ?? "").trim()],
    ["Cargo", cargoLine(shipment)],
  ];

  const content = (
    // As wide as its content, between 240 and 420px.
    <div className="w-max min-w-[240px] max-w-[420px]">
      <div className={`font-mono text-[13px] font-bold ${jobNumberColor ? "" : "text-indigo-500"}`} style={{ color: jobNumberColor }}>
        {shipment.jobNumber || "—"}
      </div>
      <dl className="mt-2.5 mb-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2.5 text-xs">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-slate-500">{label}</dt>
            <dd className="m-0 text-slate-800 tabular-nums">{value || <span className="text-slate-300">—</span>}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );

  return <HoverCard content={content}>{children}</HoverCard>;
}
