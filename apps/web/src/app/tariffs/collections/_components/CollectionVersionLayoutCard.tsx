"use client";

import type { CollectionLayout, CollectionTariffVersionDetail } from "@/hooks/useCollectionTariffs";
import { formatDate } from "@/lib/date";
import { formatQty } from "@/lib/number";
import { cleanCollectionLayout, collectionLayoutProblems } from "../../_lib/collectionLayoutForm";
import { ZONE_BY_TEXT, surchargeText } from "../../_lib/collectionTariffs";
import { TariffLayoutCard } from "../../_components/TariffLayoutCard";
import { TariffSheetPicker } from "../../_components/TariffSheetPicker";
import { Fact, LayoutTerms } from "../../_components/TariffText";
import { CollectionVersionLayoutForm } from "./CollectionVersionLayoutForm";

interface CollectionVersionLayoutCardProps {
  version: CollectionTariffVersionDetail;
  /** A manager on a draft: the layout can be corrected and the file read again. */
  editable: boolean;
  isRelayouting: boolean;
  /** Reads the file again with the layout; resolves with the version as read, rejects after telling the user why. */
  onRelayout: (layout: CollectionLayout) => Promise<CollectionTariffVersionDetail>;
}

// Where each part of the file was read from: the price tables and their columns, how a price
// column is found, the lists that come with it, the surcharges and terms. Any sheet's first rows
// can be shown below; a price table's rows are marked on its own sheet.
export const CollectionVersionLayoutCard = ({ version, editable, isRelayouting, onRelayout }: CollectionVersionLayoutCardProps) => (
  <TariffLayoutCard<CollectionLayout>
    version={version}
    editable={editable}
    isRelayouting={isRelayouting}
    onRelayout={onRelayout}
    intro="The AI worked out where the file keeps its prices, postcodes and distances; the code then read every figure with this. If something is read wrongly — a sheet, a column, a km limit, the dates — correct it here and read the file again. The rows and checks are replaced; nothing prices until the draft is approved."
    clean={cleanCollectionLayout}
    problemsOf={collectionLayoutProblems}
    renderForm={(form, onChange) => <CollectionVersionLayoutForm form={form} onChange={onChange} preview={version.preview} disabled={isRelayouting} />}
    readOnly={<ReadOnlyLayout layout={version.layout} />}
    renderSheet={(shown) => (
      <TariffSheetPicker
        preview={version.preview}
        defaultSheet={shown.matrices[0]?.sheet ?? ""}
        marksOf={(sheet) => {
          const matrix = shown.matrices.find((m) => m.sheet === sheet);
          return matrix ? { headerRow: matrix.headerRow, firstDataRow: matrix.firstDataRow, priceColumns: matrix.zones.map((z) => z.column) } : null;
        }}
      />
    )}
  />
);

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
      <LayoutTerms conditions={layout.conditions} links={layout.links} />
    </div>
  );
};
