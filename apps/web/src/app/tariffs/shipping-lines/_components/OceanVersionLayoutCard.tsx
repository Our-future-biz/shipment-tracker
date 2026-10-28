"use client";

import { useState, type ReactNode } from "react";
import { Button, Select } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import type { OceanLayout, OceanTariffVersionDetail } from "@/hooks/useOceanTariffs";
import type { interfaces } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import { formatQty } from "@/lib/number";
import { cleanOceanLayout, oceanLayoutProblems } from "../../_lib/oceanLayoutForm";
import { equipmentLabel } from "../../_lib/oceanTariffs";
import { LAYOUT_SOURCE_LABEL } from "../../_lib/railTariffs";
import { previewSheet } from "../../_lib/railLayoutForm";
import { RailVersionSheetPreview } from "../../rail-operators/_components/RailVersionSheetPreview";
import { OceanVersionLayoutForm } from "./OceanVersionLayoutForm";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
    <div className="text-[13px] text-slate-800 mt-0.5">{children}</div>
  </div>
);

interface OceanVersionLayoutCardProps {
  version: OceanTariffVersionDetail;
  /** A manager on a draft: the layout can be corrected and the file read again. */
  editable: boolean;
  isRelayouting: boolean;
  /** Reads the file again with the layout; resolves with the version as read, rejects after telling the user why. */
  onRelayout: (layout: OceanLayout) => Promise<OceanTariffVersionDetail>;
}

// Where each part of the file was read from: the rate tables and their columns, what the file's
// port codes stand for, the surcharges and terms. A manager corrects a draft's layout here and has
// the file read again; everyone else sees it as text. Any sheet's first rows can be shown below.
export const OceanVersionLayoutCard = ({ version, editable, isRelayouting, onRelayout }: OceanVersionLayoutCardProps) => {
  const [form, setForm] = useState<OceanLayout>(version.layout);
  const [sheet, setSheet] = useState<string | null>(null);

  // The version as read (set while rendering): a newer one replaces the form only while nothing is edited here.
  const [seen, setSeen] = useState(version);
  if (version !== seen) {
    setSeen(version);
    if (same(form, seen.layout)) setForm(version.layout);
  }

  const shown = editable ? form : version.layout;
  const dirty = editable && !same(form, version.layout);
  const problems = dirty ? oceanLayoutProblems(form) : [];

  // The sheet shown below: chosen, else the first rate table's; the table's rows are marked on its own sheet.
  const shownSheet = sheet ?? shown.tables[0]?.sheet ?? version.preview[0]?.name ?? "";
  const tableOfSheet = shown.tables.find((t) => t.sheet === shownSheet);

  const handleRelayout = async () => {
    try {
      const read = await onRelayout(cleanOceanLayout(form));
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
            The AI worked out where the file keeps its rate tables and surcharges; the code then read every rate with this and matched the ports. If something is
            read wrongly — a sheet, a column, a container, a surcharge, the dates — correct it here and read the file again. The rates and checks are replaced, and
            the ports picked by hand stay picked; nothing prices until the draft is approved.
          </p>
          <OceanVersionLayoutForm form={form} onChange={setForm} preview={version.preview} disabled={isRelayouting} />
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
          headerRow={tableOfSheet?.headerRow ?? 0}
          firstDataRow={tableOfSheet?.firstDataRow ?? 0}
          priceColumns={tableOfSheet?.prices.map((p) => p.column) ?? []}
        />
      </div>
    </SectionCard>
  );
};

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
