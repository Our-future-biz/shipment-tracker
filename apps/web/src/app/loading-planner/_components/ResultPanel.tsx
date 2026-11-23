"use client";

import { WarningOutlined } from "@ant-design/icons";
import { KpiTile } from "@/components/KpiTile";
import { Pill } from "@/components/Pill";
import { SectionCard } from "@/components/SectionCard";
import { CARD, EMPTY_STATE, HINT, LABEL_TEXT, TD, TH } from "@/styles/ui";
import { BALANCE_TOLERANCE_PCT } from "../_lib/balance";
import { loadStats, planTotals, type PieceGroup } from "../_lib/loadStats";
import type { ContainerLoad, LoadPlan } from "../_lib/plan";
import { formatDim, formatKg, formatSize, type DimUnit } from "../_lib/units";
import { FloorPlan } from "./FloorPlan";
import { LoadView3D } from "./LoadView3D";

interface ResultPanelProps {
  plan: LoadPlan;
  unit: DimUnit;
  /** The Tailwind classes of a cargo line's colour. */
  colourOf: (lineId: string) => { fill: string; dot: string; hex: string };
}

const pctText = (value: number) => `${Math.round(value)}%`;
const offText = (value: number) => `${Math.abs(value) < 0.5 ? "0" : Math.abs(value).toFixed(0)}%`;

/** "1,200 mm over the ends, 300 mm over the top" for a row whose pieces stick out. */
function overText(group: PieceGroup, unit: DimUnit): string {
  const parts = [
    group.over.length > 0 && `${formatDim(group.over.length, unit)} ${unit} over the ends`,
    group.over.width > 0 && `${formatDim(group.over.width, unit)} ${unit} over the sides`,
    group.over.height > 0 && `${formatDim(group.over.height, unit)} ${unit} over the top`,
  ].filter(Boolean);
  return parts.join(", ");
}

function LoadCard({ load, number, unit, colourOf }: { load: ContainerLoad; number: number; unit: DimUnit; colourOf: ResultPanelProps["colourOf"] }) {
  const stats = loadStats(load);
  const { balance } = stats;
  return (
    <SectionCard
      title={`#${number} · ${load.container.name}`}
      bodyClassName="p-4 flex flex-col gap-3"
      extra={
        <>
          {stats.outOfGauge && <Pill tone="amber">Out of gauge</Pill>}
          <Pill tone={balance.ok ? "green" : "red"}>{balance.ok ? "Balanced" : "Out of balance"}</Pill>
        </>
      }
    >
      <FloorPlan load={load} fillOf={(lineId) => colourOf(lineId).fill} />

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] text-slate-700 sm:grid-cols-4">
        <span>
          <span className={`${LABEL_TEXT} block`}>Pieces</span>
          {stats.pieceCount}
        </span>
        <span>
          <span className={`${LABEL_TEXT} block`}>Weight</span>
          {formatKg(load.totalWeightKg)} <span className="text-slate-500">· {pctText(stats.payloadPct)} of payload</span>
        </span>
        <span>
          <span className={`${LABEL_TEXT} block`}>Floor used</span>
          {pctText(stats.floorPct)}
        </span>
        <span>
          <span className={`${LABEL_TEXT} block`}>Centre of gravity</span>
          <span className={balance.ok ? "" : "text-red-600 font-medium"}>
            {offText(balance.alongPct)} off along, {offText(balance.acrossPct)} off across
          </span>
        </span>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>Cargo</th>
            <th className={`${TH} !text-right`}>Pieces</th>
            <th className={TH}>Loaded as (L × W × H)</th>
            <th className={`${TH} !text-right`}>Weight / pc</th>
            <th className={TH}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {stats.groups.map((group, index) => (
            <tr key={index}>
              <td className={TD}>
                <span className="flex items-center gap-2">
                  <span className={`h-3 w-3 shrink-0 rounded-sm ${colourOf(group.lineId).dot}`} aria-hidden />
                  {group.name || "Cargo"}
                </span>
              </td>
              <td className={`${TD} text-right tabular-nums`}>{group.count}</td>
              <td className={`${TD} tabular-nums`}>{formatSize(group.length, group.width, group.height, unit)}</td>
              <td className={`${TD} text-right tabular-nums`}>{formatKg(group.weightKg)}</td>
              <td className={TD}>{[group.crosswise && "crosswise", group.stacked > 0 && `${group.stacked} stacked`, overText(group, unit)].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {stats.bedding.map((need, index) => (
        <p key={index} className="m-0 flex items-start gap-2 text-[13px] text-amber-700">
          <WarningOutlined className="mt-0.5" />
          <span>
            {need.name || "Cargo"} puts {need.tonnesPerMetre.toFixed(1)} t per metre on the floor (limit {load.container.maxTonnesPerMetre} t/m): it needs bedding at least{" "}
            {formatDim(need.beddingMm, unit)} {unit} long.
          </span>
        </p>
      ))}
      {!balance.ok && (
        <p className="m-0 flex items-start gap-2 text-[13px] text-red-600">
          <WarningOutlined className="mt-0.5" />
          <span>
            The centre of gravity is more than {BALANCE_TOLERANCE_PCT}% off the middle of the floor and the cargo cannot be moved to correct it. Spread the weight over more
            containers or change the equipment.
          </span>
        </p>
      )}
    </SectionCard>
  );
}

// What the planner made of the cargo: the totals, the pieces it could not load with the reason, the
// containers in 3D, and every container with its floor drawn from above, its figures and its pieces.
export function ResultPanel({ plan, unit, colourOf }: ResultPanelProps) {
  if (plan.loads.length === 0 && plan.notLoaded.length === 0) {
    return <div className={`${CARD} ${EMPTY_STATE}`}>Fill in a cargo line to see its loading plan.</div>;
  }
  const totals = planTotals(plan);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile label="Containers" value={plan.loads.length} hint={totals.equipment.map((e) => `${e.count} × ${e.name}`).join(", ") || "none"} />
        <KpiTile
          label="Pieces loaded"
          value={totals.pieces}
          hint={totals.notLoaded > 0 ? `${totals.notLoaded} not loaded` : "all of the cargo"}
          hintTone={totals.notLoaded > 0 ? "red" : undefined}
        />
        <KpiTile label="Weight loaded" value={formatKg(totals.weightKg)} />
        <KpiTile
          label="Balanced"
          value={`${totals.balanced} / ${plan.loads.length}`}
          tone={totals.balanced < plan.loads.length ? "red" : undefined}
          hint={`within ${BALANCE_TOLERANCE_PCT}% of the middle`}
        />
      </div>

      {plan.notLoaded.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-red-700">
            <WarningOutlined />
            Not loaded
          </div>
          <ul className="m-0 mt-1.5 list-none p-0 text-[13px] text-red-700">
            {plan.notLoaded.map((entry) => (
              <li key={entry.lineId}>
                <span className="font-medium">
                  {entry.colli} × {entry.name || "Cargo"}
                </span>{" "}
                — {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <LoadView3D plan={plan} unit={unit} hexOf={(lineId) => colourOf(lineId).hex} />

      <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-2">
        {plan.loads.map((load, index) => (
          <LoadCard key={index} load={load} number={index + 1} unit={unit} colourOf={colourOf} />
        ))}
      </div>
      <p className={`${HINT} m-0`}>Floor plans are seen from above, to scale. The white cross is the middle of the floor, the dark dot the centre of gravity.</p>
    </div>
  );
}
