"use client";

import { chargeBasis } from "@/lib/chargeBasis";
import { TD_CELL, TH_CELL, rowLine } from "./warehouseUi";

// The shipment's cargo figures against the warehouse's remeasured ones, figure by figure, with the
// difference: the same table on the Warehouse tab and on Cargo Details. The last column is what the
// freight is charged by (lib/chargeBasis): chargeable weight for air, W/M for the other modes.

export interface CargoFigures {
  colli: number;
  weightKg: number;
  volumeCbm: number;
}

/** Two figures both known that are not the same (to 0.001). */
export const differs = (a: number, b: number) => a > 0 && b > 0 && Math.abs(a - b) > 0.001;

/** Whether the remeasured pieces, weight or volume differ from the shipment's. */
export const figuresDiffer = (ship: CargoFigures, re: CargoFigures) =>
  differs(ship.colli, re.colli) || differs(ship.weightKg, re.weightKg) || differs(ship.volumeCbm, re.volumeCbm);

/** At least one figure known on both sides: only then can they be said to match. */
export const figuresCompared = (ship: CargoFigures, re: CargoFigures) =>
  (ship.colli > 0 && re.colli > 0) || (ship.weightKg > 0 && re.weightKg > 0) || (ship.volumeCbm > 0 && re.volumeCbm > 0);

const fmt = (digits: number) => (v: number) => (v > 0 ? v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—");

// The remeasured figure less the shipment's, where both are known.
export function diffText(a: number, b: number, digits: number): string {
  if (!(a > 0 && b > 0)) return "—";
  // the same (within the rounding the figures are compared with): no difference
  if (Math.abs(a - b) <= 0.001) return "0";
  const d = a - b;
  const abs = Math.abs(d);
  // a gap too small for the column's decimals still shows (up to 4 decimals), never as "0.0"
  const shown = Number(abs.toFixed(digits)) > 0 ? fmt(digits)(abs) : String(Number(abs.toFixed(Math.max(digits, 4))));
  return `${d > 0 ? "+" : "−"}${shown}`;
}

export function RemeasureCompare({
  ship,
  re,
  freightMode,
  shipLabel = "Shipment values",
  reLabel = "Remeasured values",
}: {
  ship: CargoFigures;
  re: CargoFigures;
  freightMode: string | null | undefined;
  shipLabel?: string;
  reLabel?: string;
}) {
  const shipCharge = chargeBasis(freightMode, ship.weightKg, ship.volumeCbm);
  const reCharge = chargeBasis(freightMode, re.weightKg, re.volumeCbm);
  const columns = [
    { key: "colli", label: "Colli", ship: ship.colli, re: re.colli, digits: 0 },
    { key: "weight", label: "Weight (kg)", ship: ship.weightKg, re: re.weightKg, digits: 1 },
    { key: "volume", label: "Volume (CBM)", ship: ship.volumeCbm, re: re.volumeCbm, digits: 3 },
    { key: "charge", label: shipCharge.label, ship: shipCharge.value, re: reCharge.value, digits: shipCharge.digits },
  ];
  const rows = [
    { key: "ship", label: shipLabel, pick: (c: (typeof columns)[number]) => fmt(c.digits)(c.ship) },
    { key: "re", label: reLabel, pick: (c: (typeof columns)[number]) => fmt(c.digits)(c.re) },
    { key: "diff", label: "Difference", pick: (c: (typeof columns)[number]) => diffText(c.re, c.ship, c.digits) },
  ];
  return (
    <div className="rounded-xl border border-slate-200 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse table-fixed text-[13px]">
        <thead>
          <tr className="bg-slate-50">
            <th className={`${TH_CELL} pt-2 text-left w-[28%]`}>Compared</th>
            {columns.map((c) => (
              <th key={c.key} className={`${TH_CELL} pt-2 text-center`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className={rowLine(i, rows.length)}>
              <td className={`${TD_CELL} ${r.key === "diff" ? "text-slate-500" : "text-slate-700"}`}>{r.label}</td>
              {columns.map((c) => (
                <td key={c.key} className={`${TD_CELL} text-center tabular-nums`}>
                  {/* Only the difference is coloured: green when the figures match, red when they don't. */}
                  <span
                    className={`font-semibold ${
                      r.key !== "diff" || !(c.ship > 0 && c.re > 0) ? "text-slate-900" : differs(c.ship, c.re) ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {r.pick(c)}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
