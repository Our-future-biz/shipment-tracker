"use client";

import { useState } from "react";
import { Select } from "antd";
import type { interfaces } from "@/lib/api/client";
import { formatQty } from "@/lib/number";
import { previewSheet } from "../_lib/railLayoutForm";
import { TariffSheetPreview } from "./TariffSheetPreview";

/** What a sheet's preview marks: the headings row, the first data row and the price columns. */
interface SheetMarks {
  headerRow: number;
  firstDataRow: number;
  priceColumns: string[];
}

interface TariffSheetPickerProps {
  /** The first rows of every sheet of the file */
  preview: interfaces.SheetPreview[];
  /** Shown until another is chosen: the first table's sheet */
  defaultSheet: string;
  /** The marks of a sheet, from the table read from it; null for a sheet no table is read from */
  marksOf: (sheet: string) => SheetMarks | null;
}

// The first rows of any sheet of the file, for a layout of several tables: the sheet is chosen, and
// a table's rows and price columns are marked on its own sheet.
export const TariffSheetPicker = ({ preview, defaultSheet, marksOf }: TariffSheetPickerProps) => {
  const [sheet, setSheet] = useState<string | null>(null);
  const shownSheet = sheet ?? (defaultSheet || preview[0]?.name || "");
  const marks = marksOf(shownSheet);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-slate-600">The file&apos;s first rows</span>
        <Select
          size="small"
          aria-label="Sheet shown"
          value={shownSheet}
          onChange={setSheet}
          popupMatchSelectWidth={false}
          options={preview.map((p) => ({ value: p.name, label: `${p.name} (${formatQty(p.rowCount)} rows)` }))}
          className="min-w-[200px]"
        />
      </div>
      <TariffSheetPreview
        preview={previewSheet(preview, shownSheet)}
        headerRow={marks?.headerRow ?? 0}
        firstDataRow={marks?.firstDataRow ?? 0}
        priceColumns={marks?.priceColumns ?? []}
      />
    </div>
  );
};
