"use client";

import type { interfaces } from "@/lib/api/client";
import { columnHeadings } from "../_lib/railLayoutForm";

interface TariffSheetPreviewProps {
  preview: interfaces.SheetPreview | null;
  headerRow: number;
  firstDataRow: number;
  /** Columns read as prices, tinted so the price block stands out. */
  priceColumns: string[];
}

// The first rows of the sheet as uploaded, with row numbers and column letters, so the layout's
// letters and rows can be checked against the file: the headings row and the first price row are marked.
export const TariffSheetPreview = ({ preview, headerRow, firstDataRow, priceColumns }: TariffSheetPreviewProps) => {
  if (!preview) return <p className="m-0 text-[13px] text-slate-500">The file has no sheet of this name.</p>;
  const letters = [...columnHeadings(preview, headerRow).keys()];
  const prices = new Set(priceColumns);

  const rowClass = (rowNo: number) => (rowNo === headerRow ? "bg-indigo-50 font-semibold text-slate-800" : rowNo === firstDataRow ? "bg-emerald-50" : "");

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-80">
        <table className="text-[11.5px] border-collapse w-max min-w-full">
          <thead className="sticky top-0 bg-slate-100 z-10">
            <tr>
              <th className="px-2 py-1 text-slate-400 font-normal text-right border-b border-slate-200">#</th>
              {letters.map((l) => (
                <th key={l} className={`px-2 py-1 font-semibold border-b border-l border-slate-200 ${prices.has(l) ? "text-indigo-600" : "text-slate-500"}`}>
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.rowNo} className={rowClass(row.rowNo)}>
                <td className="px-2 py-0.5 text-right text-slate-400 tabular-nums border-b border-slate-100">{row.rowNo}</td>
                {letters.map((l) => (
                  <td
                    key={l}
                    title={row.cells[l]}
                    className={`px-2 py-0.5 border-b border-l border-slate-100 max-w-[220px] truncate ${prices.has(l) && row.rowNo >= firstDataRow ? "text-right tabular-nums" : ""}`}
                  >
                    {row.cells[l] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[11.5px] text-slate-500">
        <span>
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-100 border border-indigo-200 mr-1 align-middle" />
          Headings row {headerRow}
        </span>
        <span>
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-200 mr-1 align-middle" />
          First price row {firstDataRow}
        </span>
        <span>
          First {preview.rows.length} rows of {preview.rowCount}
        </span>
      </div>
    </div>
  );
};
