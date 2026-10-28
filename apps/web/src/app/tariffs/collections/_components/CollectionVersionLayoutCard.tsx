"use client";

import { useState, type ReactNode } from "react";
import { Button, Select } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import type { CollectionLayout, CollectionTariffVersionDetail } from "@/hooks/useCollectionTariffs";
import { formatDate } from "@/lib/date";
import { formatQty } from "@/lib/number";
import { cleanCollectionLayout, collectionLayoutProblems } from "../../_lib/collectionLayoutForm";
import { ZONE_BY_TEXT, surchargeText } from "../../_lib/collectionTariffs";
import { LAYOUT_SOURCE_LABEL } from "../../_lib/railTariffs";
import { previewSheet } from "../../_lib/railLayoutForm";
import { RailVersionSheetPreview } from "../../rail-operators/_components/RailVersionSheetPreview";
import { CollectionVersionLayoutForm } from "./CollectionVersionLayoutForm";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
    <div className="text-[13px] text-slate-800 mt-0.5">{children}</div>
  </div>
);

interface CollectionVersionLayoutCardProps {
  version: CollectionTariffVersionDetail;
  /** A manager on a draft: the layout can be corrected and the file read again. */
  editable: boolean;
  isRelayouting: boolean;
  /** Reads the file again with the layout; resolves with the version as read, rejects after telling the user why. */
  onRelayout: (layout: CollectionLayout) => Promise<CollectionTariffVersionDetail>;
}

// Where each part of the file was read from: the price tables and their columns, how a price
// column is found, the lists that come with it, the surcharges and terms. A manager corrects a
// draft's layout here and has the file read again; everyone else sees it as text. Any sheet's
// first rows can be shown below.
export const CollectionVersionLayoutCard = ({ version, editable, isRelayouting, onRelayout }: CollectionVersionLayoutCardProps) => {
  const [form, setForm] = useState<CollectionLayout>(version.layout);
  const [sheet, setSheet] = useState<string | null>(null);

  // The version as read (set while rendering): a newer one replaces the form only while nothing is edited here.
  const [seen, setSeen] = useState(version);
  if (version !== seen) {
    setSeen(version);
    if (same(form, seen.layout)) setForm(version.layout);
  }

  const shown = editable ? form : version.layout;
  const dirty = editable && !same(form, version.layout);
  const problems = dirty ? collectionLayoutProblems(form) : [];

  // The sheet shown below: chosen, else the first price table's; the table's rows are marked on its own sheet.
  const shownSheet = sheet ?? shown.matrices[0]?.sheet ?? version.preview[0]?.name ?? "";
  const matrixOfSheet = shown.matrices.find((m) => m.sheet === shownSheet);

  const handleRelayout = async () => {
    try {
      const read = await onRelayout(cleanCollectionLayout(form));
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
            The AI worked out where the file keeps its prices, postcodes and distances; the code then read every figure with this. If something is read wrongly — a
            sheet, a column, a km limit, the dates — correct it here and read the file again. The rows and checks are replaced; nothing prices until the draft is
            approved.
          </p>
          <CollectionVersionLayoutForm form={form} onChange={setForm} preview={version.preview} disabled={isRelayouting} />
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
        <ReadOnlyLayout layout={version.layout} />
      )}

      <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-slate-600">The file&apos;s first rows</span>
          <Select
            size="small"
            aria-label="Sheet shown"
            value={shownSheet}
            onChange={setSheet}
            popupMatchSelectWidth={false}
            options={version.preview.map((p) => ({ value: p.name, label: `${p.name} (${formatQty(p.rowCount)} rows)` }))}
            className="min-w-[200px]"
          />
        </div>
        <RailVersionSheetPreview
          preview={previewSheet(version.preview, shownSheet)}
          headerRow={matrixOfSheet?.headerRow ?? 0}
          firstDataRow={matrixOfSheet?.firstDataRow ?? 0}
          priceColumns={matrixOfSheet?.zones.map((z) => z.column) ?? []}
        />
      </div>
    </SectionCard>
  );
};

// The layout as text, for those who cannot change it.
const ReadOnlyLayout = ({ layout }: { layout: CollectionLayout }) => {
  const validity = layout.validFrom || layout.validTo ? `${formatDate(layout.validFrom) || "…"} – ${formatDate(layout.validTo) || "open"}` : "Not given";
  const volume = layout.matrices.some((m) => m.volumeTo)
    ? "By the tables' volume column"
    : layout.kgPerCbm
      ? `${formatQty(layout.kgPerCbm)} kg per m³`
      : "Not counted";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Fact label="Currency">{layout.currency}</Fact>
        <Fact label="Validity">{validity}</Fact>
        <Fact label="Volume as weight">{volume}</Fact>
        {layout.zoneBy === "distance" && <Fact label="Within one region">{layout.sameRegionKm !== null ? `${formatQty(layout.sameRegionKm)} km` : "—"}</Fact>}
      </div>
      <Fact label="Price column found">{ZONE_BY_TEXT[layout.zoneBy]}</Fact>
      <Fact label="Price tables">
        <ul className="m-0 pl-0 list-none flex flex-col gap-0.5">
          {layout.matrices.map((m, i) => (
            <li key={i}>
              <span className="font-medium">{m.label}</span>{" "}
              <span className="text-slate-500">
                (sheet {m.sheet}, rows {m.firstDataRow}–{m.lastDataRow ?? "end"}, weight column {m.weightTo}
                {m.volumeTo ? `, volume column ${m.volumeTo}` : ""})
              </span>{" "}
              — {m.zones.map((z) => z.label).join(", ")}
            </li>
          ))}
        </ul>
      </Fact>
      {layout.regions && (
        <Fact label="Postcode → region list">
          Sheet {layout.regions.sheet} from row {layout.regions.firstDataRow}: postcode {layout.regions.postcode}, region {layout.regions.region}
          {layout.regions.country ? `, country ${layout.regions.country}` : ""}
          {layout.regions.place ? `, place ${layout.regions.place}` : ""}
        </Fact>
      )}
      {layout.distances && (
        <Fact label="Distance list">
          Sheet {layout.distances.sheet} from row {layout.distances.firstDataRow}: regions {layout.distances.fromRegion} and {layout.distances.toRegion}, km {layout.distances.km}
        </Fact>
      )}
      {layout.areas && (
        <Fact label="Postcode areas">
          Sheet {layout.areas.sheet} from row {layout.areas.firstDataRow}: postcode {layout.areas.postcodeFrom}
          {layout.areas.postcodeTo ? `–${layout.areas.postcodeTo}` : ""}, zone {layout.areas.zone}
        </Fact>
      )}
      <Fact label="Surcharges">
        {layout.surcharges.length ? (
          <ul className="m-0 pl-4 flex flex-col gap-0.5">
            {layout.surcharges.map((s, i) => (
              <li key={i}>{surchargeText(s, layout.currency)}</li>
            ))}
          </ul>
        ) : (
          "None"
        )}
      </Fact>
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
