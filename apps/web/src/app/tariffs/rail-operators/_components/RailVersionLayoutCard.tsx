"use client";

import { useState, type ReactNode } from "react";
import { Button } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import type { RailLayout, RailTariffVersionDetail } from "@/hooks/useRailTariffs";
import { formatDate } from "@/lib/date";
import { COLUMN_FIELDS, cleanLayout, columnHeadings, columnLabel, layoutProblems, previewSheet } from "../../_lib/railLayoutForm";
import { LAYOUT_SOURCE_LABEL, bandText } from "../../_lib/railTariffs";
import { RailVersionLayoutForm } from "./RailVersionLayoutForm";
import { RailVersionSheetPreview } from "./RailVersionSheetPreview";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
    <div className="text-[13px] text-slate-800 mt-0.5">{children}</div>
  </div>
);

interface RailVersionLayoutCardProps {
  version: RailTariffVersionDetail;
  /** A manager on a draft: the layout can be corrected and the file read again. */
  editable: boolean;
  isRelayouting: boolean;
  /** Reads the file again with the layout; resolves with the version as read, rejects after telling the user why. */
  onRelayout: (layout: RailLayout) => Promise<RailTariffVersionDetail>;
}

// How the file was read: the sheet and rows, what each column holds, the price columns with their
// container lengths and weights, and the tariff's facts. A manager corrects a draft's layout here
// and has the file read again; everyone else sees it as text. The sheet's first rows sit below.
export const RailVersionLayoutCard = ({ version, editable, isRelayouting, onRelayout }: RailVersionLayoutCardProps) => {
  const [form, setForm] = useState<RailLayout>(version.layout);
  const [showSheet, setShowSheet] = useState(false);

  // The version as read (set while rendering): a newer one replaces the form only while nothing is edited here.
  const [seen, setSeen] = useState(version);
  if (version !== seen) {
    setSeen(version);
    if (same(form, seen.layout)) setForm(version.layout);
  }

  const shown = editable ? form : version.layout;
  const preview = previewSheet(version.preview, shown.sheet);
  const headings = columnHeadings(preview, shown.headerRow);
  const dirty = editable && !same(form, version.layout);
  const problems = dirty ? layoutProblems(form) : [];

  const handleRelayout = async () => {
    try {
      const read = await onRelayout(cleanLayout(form));
      setForm(read.layout);
    } catch {
      // onRelayout has told the user why; the form keeps their changes.
    }
  };

  return (
    <SectionCard title="How the file was read" extra={<span className="text-xs text-slate-500">{LAYOUT_SOURCE_LABEL[version.layoutSource]}</span>}>
      {editable ? (
        <>
          <p className="mt-0 mb-4 text-[13px] text-slate-600">
            The AI worked out what each column of the file holds; the code then read every row with this. If something is read wrongly — a column, a weight, the
            dates — correct it here and read the file again. The rows and checks are replaced; nothing prices until the draft is approved.
          </p>
          <RailVersionLayoutForm form={form} onChange={setForm} sheetNames={version.preview.map((p) => p.name)} headings={headings} disabled={isRelayouting} />
          <div className="flex flex-wrap items-center gap-3 mt-5">
            <Button type="primary" icon={<ReloadOutlined />} loading={isRelayouting} disabled={!dirty || problems.length > 0} onClick={handleRelayout}>
              Read the file again with this layout
            </Button>
            <Button onClick={() => setForm(version.layout)} disabled={!dirty || isRelayouting}>
              Reset
            </Button>
            {dirty && !problems.length && <span className="text-xs text-amber-700">Unsaved changes</span>}
            {problems.length > 0 && <span className="text-xs text-red-600">{problems.join(" · ")}</span>}
          </div>
        </>
      ) : (
        <ReadOnlyLayout layout={version.layout} headings={headings} />
      )}

      <div className="mt-5 pt-4 border-t border-slate-100">
        <Button size="small" type="link" className="!px-0" onClick={() => setShowSheet((s) => !s)}>
          {showSheet ? "Hide the file's first rows" : "Show the file's first rows"}
        </Button>
        {showSheet && (
          <div className="mt-2">
            <RailVersionSheetPreview
              preview={preview}
              headerRow={shown.headerRow}
              firstDataRow={shown.firstDataRow}
              priceColumns={shown.bands.map((b) => b.column)}
            />
          </div>
        )}
      </div>
    </SectionCard>
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
            {COLUMN_FIELDS.filter(({ key }) => layout.columns[key]).map(({ key, label }) => (
              <li key={key}>
                <span className="text-slate-500">{label}:</span> {columnLabel(layout.columns[key]!, headings.get(layout.columns[key]!))}
              </li>
            ))}
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

      {layout.conditions.length > 0 && (
        <Fact label="Conditions">
          <ul className="m-0 pl-4 flex flex-col gap-0.5">
            {layout.conditions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </Fact>
      )}
      {layout.links.length > 0 && (
        <Fact label="Links">
          <ul className="m-0 pl-0 list-none flex flex-col gap-0.5">
            {layout.links.map((l, i) => (
              <li key={i}>
                <a href={l.url} target="_blank" rel="noreferrer" className="!text-indigo-600 hover:underline">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </Fact>
      )}
    </div>
  );
};
