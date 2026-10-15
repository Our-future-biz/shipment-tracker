"use client";

import { Tooltip } from "antd";
import type { interfaces } from "@/lib/api/client";
import { formatQty, heatStep, pscRangeLabel, type LevelMatrix, type MatrixCell } from "../../_lib/tariffs";

// Cheapest to dearest within a price type; the number is always there, the tint only helps the eye.
const HEAT_CLASS = ["bg-white", "bg-indigo-50", "bg-indigo-100/70", "bg-indigo-100", "bg-indigo-200/70"];

const UNIT_SUFFIX: Record<interfaces.BandBasis, string> = { KG: "/kg", PALLET: "/pallet", LDM: "/LDM", TRIP: "/trip" };

const cellSuffix = (cell: MatrixCell, basis: interfaces.BandBasis) => {
  if (cell.priceType === "PER_UNIT") return UNIT_SUFFIX[basis];
  if (cell.priceType === "PER_100KG") return "/100 kg";
  return "";
};

interface TariffMatrixProps {
  matrix: LevelMatrix;
  currency: string;
}

// The rate sheet of one service level: a row per band, a column per zone, the minimum charge
// last. Amounts in the tariff currency; per-unit prices carry their unit.
export const TariffMatrix = ({ matrix, currency }: TariffMatrixProps) => {
  if (!matrix.rows.length) return <p className="m-0 p-4 text-[13px] text-slate-500">No prices for this service level.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px] tabular-nums">
        <caption className="sr-only">Prices in {currency}: bands down, zones across</caption>
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
            <th scope="col" className="sticky left-0 bg-white px-3 py-2 text-left font-semibold whitespace-nowrap">
              Band · {currency}
            </th>
            {matrix.zones.map((z) => (
              <th key={z.code} scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                <Tooltip title={`${z.label} · ${pscRangeLabel(z.postcodeFrom, z.postcodeTo)}${z.remote ? " · remote area" : ""}`}>
                  <span>
                    {z.code}
                    {z.remote && <span className="ml-0.5 text-amber-600">*</span>}
                  </span>
                </Tooltip>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.band.id} className="border-b border-slate-100">
              <th scope="row" className="sticky left-0 bg-white px-3 py-1.5 text-left font-medium text-slate-700 whitespace-nowrap">
                {row.label}
              </th>
              {row.cells.map((cell, i) => (
                <td key={matrix.zones[i]!.code} className={`px-3 py-1.5 text-right whitespace-nowrap ${cell ? HEAT_CLASS[heatStep(cell.amount, matrix.ranges[cell.priceType])] : ""}`}>
                  {cell ? (
                    <>
                      {formatQty(cell.amount)}
                      {cellSuffix(cell, row.band.basis) && <span className="ml-0.5 text-[10.5px] text-slate-500">{cellSuffix(cell, row.band.basis)}</span>}
                    </>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr className="bg-slate-50">
            <th scope="row" className="sticky left-0 bg-slate-50 px-3 py-1.5 text-left font-semibold text-slate-700">
              Minimum
            </th>
            {matrix.minRow.map((min, i) => (
              <td key={matrix.zones[i]!.code} className="px-3 py-1.5 text-right font-semibold text-slate-700">
                {min != null ? formatQty(min) : <span className="font-normal text-slate-300">—</span>}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
};
