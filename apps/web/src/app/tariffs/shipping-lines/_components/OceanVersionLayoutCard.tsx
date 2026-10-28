"use client";

import type { OceanLayout, OceanTariffVersionDetail } from "@/hooks/useOceanTariffs";
import type { interfaces } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import { cleanOceanLayout, oceanLayoutProblems } from "../../_lib/oceanLayoutForm";
import { equipmentLabel } from "../../_lib/oceanTariffs";
import { TariffLayoutCard } from "../../_components/TariffLayoutCard";
import { TariffSheetPicker } from "../../_components/TariffSheetPicker";
import { Fact, LayoutTerms } from "../../_components/TariffText";
import { OceanVersionLayoutForm } from "./OceanVersionLayoutForm";

interface OceanVersionLayoutCardProps {
  version: OceanTariffVersionDetail;
  /** A manager on a draft: the layout can be corrected and the file read again. */
  editable: boolean;
  isRelayouting: boolean;
  /** Reads the file again with the layout; resolves with the version as read, rejects after telling the user why. */
  onRelayout: (layout: OceanLayout) => Promise<OceanTariffVersionDetail>;
}

// Where each part of the file was read from: the rate tables and their columns, what the file's
// port codes stand for, the surcharges and terms. Any sheet's first rows can be shown below; a
// rate table's rows are marked on its own sheet.
export const OceanVersionLayoutCard = ({ version, editable, isRelayouting, onRelayout }: OceanVersionLayoutCardProps) => (
  <TariffLayoutCard<OceanLayout>
    version={version}
    editable={editable}
    isRelayouting={isRelayouting}
    onRelayout={onRelayout}
    intro="The AI worked out where the file keeps its rate tables and surcharges; the code then read every rate with this and matched the ports. If something is read wrongly — a sheet, a column, a container, a surcharge, the dates — correct it here and read the file again. The rates and checks are replaced, and the ports picked by hand stay picked; nothing prices until the draft is approved."
    clean={cleanOceanLayout}
    problemsOf={oceanLayoutProblems}
    renderForm={(form, onChange) => <OceanVersionLayoutForm form={form} onChange={onChange} preview={version.preview} disabled={isRelayouting} />}
    readOnly={<ReadOnlyLayout layout={version.layout} />}
    renderSheet={(shown) => (
      <TariffSheetPicker
        preview={version.preview}
        defaultSheet={shown.tables[0]?.sheet ?? ""}
        marksOf={(sheet) => {
          const table = shown.tables.find((t) => t.sheet === sheet);
          return table ? { headerRow: table.headerRow, firstDataRow: table.firstDataRow, priceColumns: table.prices.map((pc) => pc.column) } : null;
        }}
      />
    )}
  />
);

// "sheet Far East, rows 11–24, POL column B, POD column C, via D, currency USD"
function tableText(t: interfaces.OceanTable): string {
  return [
    `sheet ${t.sheet}`,
    `rows ${t.firstDataRow}–${t.lastDataRow ?? "end"}`,
    t.pol ? `POL column ${t.pol}` : `POL ${t.polFixed ?? "—"}`,
    `POD column ${t.pod}`,
    t.via && `via column ${t.via}`,
    t.currency ? `currency column ${t.currency}` : `currency ${t.currencyFixed ?? "—"}`,
    t.note && `note column ${t.note}`,
    t.podCountries.length > 0 && `PODs in ${t.podCountries.join(", ")}`,
  ]
    .filter(Boolean)
    .join(", ");
}

// The layout as text, for those who cannot change it. The surcharges have their own card above.
const ReadOnlyLayout = ({ layout }: { layout: OceanLayout }) => {
  const validity = layout.validFrom || layout.validTo ? `${formatDate(layout.validFrom) || "…"} – ${formatDate(layout.validTo) || "open"}` : "Not given";
  const portCodes = Object.entries(layout.portCodes);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Fact label="Validity">{validity}</Fact>
        <Fact label="Rate tables">{layout.tables.length}</Fact>
        <Fact label="Surcharges">{layout.surcharges.length || "None"}</Fact>
      </div>
      <Fact label="Rate tables">
        <ul className="m-0 pl-0 list-none flex flex-col gap-0.5">
          {layout.tables.map((t, i) => (
            <li key={i}>
              <span className="font-medium">{t.label}</span> <span className="text-slate-500">({tableText(t)})</span> —{" "}
              {t.prices.map((p) => `${equipmentLabel(p.equipment)} (${p.column})`).join(", ")}
            </li>
          ))}
        </ul>
      </Fact>
      {portCodes.length > 0 && (
        <Fact label="Port codes">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {portCodes.map(([written, code]) => (
              <span key={written} className="whitespace-nowrap">
                {written} → <span className="tabular-nums">{code}</span>
              </span>
            ))}
          </div>
        </Fact>
      )}
      <LayoutTerms conditions={layout.conditions} links={layout.links} />
    </div>
  );
};
