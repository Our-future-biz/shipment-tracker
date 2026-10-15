"use client";

import { Alert, Spin } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { useTariffVersionDiff, type TariffSide } from "@/hooks/useTrucking";
import { DIFF_CELL_LIMIT, diffStructureLines, diffTiles, isSameAsAgainst } from "../../_lib/tariffUpload";
import { validityLabel, versionLabel } from "../../_lib/tariffs";
import { TariffDiffCellsTable, diffToneClass } from "./TariffDiffCellsTable";

interface TariffDiffPanelProps {
  versionId: string;
  currency: string;
  side: TariffSide;
  levelLabel: (code: string) => string;
}

// What a version changes against the tariff's active one: counts and the size of the changes, new
// or dropped zones, levels and surcharges, then every price that differs. Used by the upload wizard
// and the version page.
export const TariffDiffPanel = ({ versionId, currency, side, levelLabel }: TariffDiffPanelProps) => {
  const { diff, isLoading, error } = useTariffVersionDiff(versionId);

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spin />
      </div>
    );
  }
  if (!diff) return <Alert type="error" showIcon message={`Could not compare the versions: ${apiErrorMessage(error)}.`} />;
  if (!diff.against) {
    return <p className="m-0 text-[13px] text-slate-500">Nothing to compare with: the tariff has no active version. Every price of this version is new.</p>;
  }

  const lines = diffStructureLines(diff, levelLabel);
  const affected = [
    diff.affectedOpenQuotes != null ? `${diff.affectedOpenQuotes} open quotes` : null,
    diff.affectedOpenConsignments != null ? `${diff.affectedOpenConsignments} open consignments` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[13px] text-slate-600">
        Against the active version <b>{versionLabel(diff.against)}</b> (valid {validityLabel(diff.against.validFrom, diff.against.validTo)}).
        {isSameAsAgainst(diff) && " The prices are the same."}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {diffTiles(diff).map((t) => (
          <div key={t.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{t.label}</div>
            <div className={`text-lg font-bold tabular-nums ${t.tone === "same" ? "text-slate-800" : diffToneClass(t.tone, side)}`}>{t.value}</div>
          </div>
        ))}
      </div>

      {lines.length > 0 && (
        <ul className="m-0 pl-5 list-disc text-[13px] text-slate-700">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {affected.length > 0 && <p className="m-0 text-[13px] text-slate-600">Affects {affected.join(" and ")}.</p>}

      {diff.cells.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white">
          <TariffDiffCellsTable cells={diff.cells} currency={currency} side={side} levelLabel={levelLabel} />
          {diff.cells.length >= DIFF_CELL_LIMIT && (
            <p className="m-0 px-3 py-2 text-[11px] text-slate-400">Only the {DIFF_CELL_LIMIT} largest changes are listed.</p>
          )}
        </div>
      )}
    </div>
  );
};
