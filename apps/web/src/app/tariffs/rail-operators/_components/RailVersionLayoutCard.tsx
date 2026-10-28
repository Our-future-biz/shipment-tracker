"use client";

import { useState } from "react";
import { Button } from "antd";
import type { RailLayout, RailTariffVersionDetail } from "@/hooks/useRailTariffs";
import { formatDate } from "@/lib/date";
import { COLUMN_FIELDS, cleanLayout, columnHeadings, columnLabel, layoutProblems, previewSheet } from "../../_lib/railLayoutForm";
import { bandText } from "../../_lib/railTariffs";
import { TariffLayoutCard } from "../../_components/TariffLayoutCard";
import { TariffSheetPreview } from "../../_components/TariffSheetPreview";
import { Fact, LayoutTerms } from "../../_components/TariffText";
import { RailVersionLayoutForm } from "./RailVersionLayoutForm";

interface RailVersionLayoutCardProps {
  version: RailTariffVersionDetail;
  /** A manager on a draft: the layout can be corrected and the file read again. */
  editable: boolean;
  isRelayouting: boolean;
  /** Reads the file again with the layout; resolves with the version as read, rejects after telling the user why. */
  onRelayout: (layout: RailLayout) => Promise<RailTariffVersionDetail>;
}

const headingsOf = (version: RailTariffVersionDetail, layout: RailLayout) => columnHeadings(previewSheet(version.preview, layout.sheet), layout.headerRow);

// How the file was read: the sheet and rows, what each column holds, the price columns with their
// container lengths and weights, and the tariff's facts. The sheet's first rows can be shown below.
export const RailVersionLayoutCard = ({ version, editable, isRelayouting, onRelayout }: RailVersionLayoutCardProps) => (
  <TariffLayoutCard<RailLayout>
    version={version}
    editable={editable}
    isRelayouting={isRelayouting}
    onRelayout={onRelayout}
    intro="The AI worked out what each column of the file holds; the code then read every row with this. If something is read wrongly — a column, a weight, the dates — correct it here and read the file again. The rows and checks are replaced; nothing prices until the draft is approved."
    clean={cleanLayout}
    problemsOf={layoutProblems}
    renderForm={(form, onChange) => (
      <RailVersionLayoutForm form={form} onChange={onChange} sheetNames={version.preview.map((p) => p.name)} headings={headingsOf(version, form)} disabled={isRelayouting} />
    )}
    readOnly={<ReadOnlyLayout layout={version.layout} headings={headingsOf(version, version.layout)} />}
    renderSheet={(shown) => <RailSheetRows version={version} shown={shown} />}
  />
);

// The sheet's first rows, folded until asked for.
const RailSheetRows = ({ version, shown }: { version: RailTariffVersionDetail; shown: RailLayout }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="small" type="link" className="!px-0" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide the file's first rows" : "Show the file's first rows"}
      </Button>
      {open && (
        <div className="mt-2">
          <TariffSheetPreview
            preview={previewSheet(version.preview, shown.sheet)}
            headerRow={shown.headerRow}
            firstDataRow={shown.firstDataRow}
            priceColumns={shown.bands.map((b) => b.column)}
          />
        </div>
      )}
    </>
  );
};

// The layout as text, for those who cannot change it.
const ReadOnlyLayout = ({ layout, headings }: { layout: RailLayout; headings: Map<string, string> }) => {
  const validity = layout.validFrom || layout.validTo ? `${formatDate(layout.validFrom) || "…"} – ${formatDate(layout.validTo) || "open"}` : "Not given";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Fact label="Sheet">{layout.sheet}</Fact>
        <Fact label="Rows">
          Headings in row {layout.headerRow}, prices from row {layout.firstDataRow} {layout.lastDataRow ? `to row ${layout.lastDataRow}` : "to the end"}
        </Fact>
        <Fact label="Currency">{layout.currency}</Fact>
        <Fact label="Validity">{validity}</Fact>
        <Fact label="Country of the places">{layout.defaultCountry}</Fact>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Fact label="Columns">
          <ul className="m-0 pl-0 list-none flex flex-col gap-0.5">
            {COLUMN_FIELDS.map(({ key, label }) => {
              const letter = layout.columns[key];
              return (
                letter && (
                  <li key={key}>
                    <span className="text-slate-500">{label}:</span> {columnLabel(letter, headings.get(letter))}
                  </li>
                )
              );
            })}
          </ul>
        </Fact>
        <Fact label="Price columns">
          <ul className="m-0 pl-0 list-none flex flex-col gap-0.5">
            {layout.bands.map((b) => (
              <li key={b.column}>
                <span className="font-medium">{b.label}</span> <span className="text-slate-500">(column {b.column})</span> — {bandText(b)}
              </li>
            ))}
          </ul>
        </Fact>
      </div>

      <LayoutTerms conditions={layout.conditions} links={layout.links} />
    </div>
  );
};
