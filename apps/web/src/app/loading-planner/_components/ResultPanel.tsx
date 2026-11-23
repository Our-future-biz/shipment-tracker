"use client";

import { useState } from "react";
import { WarningOutlined } from "@ant-design/icons";
import { KpiTile } from "@/components/KpiTile";
import { Pill } from "@/components/Pill";
import { SectionCard } from "@/components/SectionCard";
import { BTN_BAR, CARD, EMPTY_STATE, HINT, LABEL_TEXT, TD, TH } from "@/styles/ui";
import { BALANCE_TOLERANCE_PCT } from "../_lib/balance";
import { END_WALLS_NOTE, floorOverloadText, hasDoors, loadStats, planTotals, type PieceGroup } from "../_lib/loadStats";
import type { ContainerLoad, LoadPlan } from "../_lib/plan";
import { formatDim, formatKg, formatSize, type DimUnit } from "../_lib/units";
import { FloorPlan } from "./FloorPlan";
import { LoadView3D } from "./LoadView3D";

interface ResultPanelProps {
  plan: LoadPlan;
  unit: DimUnit;
  /** The colour of a cargo line: Tailwind classes for the screen, a hex value for the 3D view. */
  colourOf: (lineId: string) => { fill: string; dot: string; hex: string };
  /** The number a cargo line carries in the cargo table. */
  numberOf: (lineId: string) => number;
  /** Typed cargo lines that are not planned because a figure is missing. */
  unplanned: number;
  /** Why the cargo is too much for one plan; nothing is planned then. */
  tooMuch: string | null;
  /** "Nominate equipment" is on and no type is chosen yet. */
  nothingNominated: boolean;
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

/** What is worth saying about a row of the container's table. */
function notesOf(group: PieceGroup, unit: DimUnit): string {
  return [
    group.crosswise && "crosswise",
    group.stacked > 0 && `${group.stacked} stacked, top at ${formatDim(group.topMm, unit)} ${unit}`,
    group.count === 1 && `${formatDim(group.at.fromFront, unit)} ${unit} from the front wall`,
    overText(group, unit),
  ]
    .filter(Boolean)
    .join(" · ");
}

interface LoadCardProps {
  load: ContainerLoad;
  number: number;
  unit: DimUnit;
  colourOf: ResultPanelProps["colourOf"];
  numberOf: ResultPanelProps["numberOf"];
  onShow3D: () => void;
}

function LoadCard({ load, number, unit, colourOf, numberOf, onShow3D }: LoadCardProps) {
  const stats = loadStats(load);
  const { balance } = stats;
  const { container } = load;
  const along = Math.abs(balance.cogZ - container.internalL / 2);
  const across = Math.abs(balance.cogX - container.internalW / 2);
  return (
    <SectionCard
      title={`#${number} · ${container.name}`}
      bodyClassName="p-4 flex flex-col gap-3"
      extra={
        <>
          {stats.outOfGauge && <Pill tone="amber">Out of gauge</Pill>}
          <Pill tone={balance.ok ? "green" : "red"}>{balance.ok ? "Balanced" : "Out of balance"}</Pill>
          <button type="button" className={BTN_BAR} onClick={onShow3D}>
            Show in 3D
          </button>
        </>
      }
    >
      <FloorPlan load={load} fillOf={(lineId) => colourOf(lineId).fill} numberOf={numberOf} />

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] text-slate-700 sm:grid-cols-4">
        <span>
          <span className={`${LABEL_TEXT} block`}>Colli</span>
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
          <span className={`${LABEL_TEXT} block`}>Highest point</span>
          {formatDim(stats.topMm, unit)} {unit}
        </span>
        <span className="col-span-2 sm:col-span-4">
          <span className={`${LABEL_TEXT} block`}>Centre of gravity</span>
          <span className={balance.ok ? "" : "text-red-600 font-medium"}>
            {offText(balance.alongPct)} off lengthwise ({formatDim(along, unit)} {unit}), {offText(balance.acrossPct)} off sideways ({formatDim(across, unit)} {unit})
          </span>
          <span className="text-slate-500"> · limit {BALANCE_TOLERANCE_PCT}%</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${TH} w-[36px]`}>No.</th>
              <th className={TH}>Cargo</th>
              <th className={`${TH} !text-right`}>Colli</th>
              <th className={TH}>Loaded as (L × W × H)</th>
              <th className={`${TH} !text-right`}>Weight / pc</th>
              <th className={TH}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {stats.groups.map((group, index) => (
              <tr key={index}>
                <td className={`${TD} tabular-nums font-semibold`}>{numberOf(group.lineId)}</td>
                <td className={TD}>
                  <span className="flex items-center gap-2">
                    <span className={`h-3 w-3 shrink-0 rounded-sm border border-slate-700 ${colourOf(group.lineId).dot}`} aria-hidden />
                    {group.name || "Cargo"}
                  </span>
                </td>
                <td className={`${TD} text-right tabular-nums`}>{group.count}</td>
                <td className={`${TD} tabular-nums`}>{formatSize(group.length, group.width, group.height, unit)}</td>
                <td className={`${TD} text-right tabular-nums`}>{formatKg(group.weightKg)}</td>
                <td className={TD}>{notesOf(group, unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stats.endWallsFolded && (
        <p className="m-0 flex items-start gap-2 text-[13px] text-amber-700">
          <WarningOutlined className="mt-0.5" />
          <span>{END_WALLS_NOTE}</span>
        </p>
      )}
      {stats.floorOverloads.map((overload, index) => (
        <p key={index} className="m-0 flex items-start gap-2 text-[13px] text-amber-700">
          <WarningOutlined className="mt-0.5" />
          <span>{floorOverloadText(overload, container, unit)}</span>
        </p>
      ))}
      {!balance.ok && (
        <p className="m-0 flex items-start gap-2 text-[13px] text-red-600">
          <WarningOutlined className="mt-0.5" />
          <span>
            The centre of gravity is more than {BALANCE_TOLERANCE_PCT}% off the middle of the floor, and the planner found no better arrangement. Spread the weight over
            more containers or change the equipment.
          </span>
        </p>
      )}
      {!hasDoors(container) && <p className={`${HINT} m-0`}>A flat rack has no doors: positions are measured from the end wall on the left.</p>}
    </SectionCard>
  );
}

// What the planner made of the cargo: the totals, the pieces it could not load with the reason, the
// containers in 3D, and every container with its floor drawn from above, its figures and its pieces.
export function ResultPanel({ plan, unit, colourOf, numberOf, unplanned, tooMuch, nothingNominated }: ResultPanelProps) {
  const [shown, setShown] = useState(0);
  // A plan worked out again may have fewer containers than the one being looked at.
  const inView = Math.min(shown, Math.max(0, plan.loads.length - 1));

  const unplannedNote = unplanned > 0 && (
    <p className="m-0 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800" role="status">
      <WarningOutlined className="mt-0.5" />
      <span>
        {unplanned === 1 ? "1 cargo line is" : `${unplanned} cargo lines are`} not in the plan yet: a figure is missing. The line says which under “Standard container”.
      </span>
    </p>
  );

  if (tooMuch) {
    return (
      <p className="m-0 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800" role="status">
        <WarningOutlined className="mt-0.5" />
        <span>{tooMuch}</span>
      </p>
    );
  }
  if (nothingNominated) return <div className={`${CARD} ${EMPTY_STATE}`}>Choose the container types to load into.</div>;
  if (plan.loads.length === 0 && plan.notLoaded.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {unplannedNote}
        <div className={`${CARD} ${EMPTY_STATE}`}>Fill in a cargo line (length, width, height, weight, colli) to see the loading plan.</div>
      </div>
    );
  }
  const totals = planTotals(plan);
  const colliHint = totals.notLoaded > 0 ? `${totals.notLoaded} not loaded` : unplanned > 0 ? `${unplanned} ${unplanned === 1 ? "line" : "lines"} not planned` : "all of the cargo";

  return (
    <div className="flex flex-col gap-4">
      {unplannedNote}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile label="Containers" value={plan.loads.length} hint={totals.equipment.map((e) => `${e.count} × ${e.name}`).join(", ") || "none"} />
        <KpiTile label="Colli loaded" value={totals.pieces} hint={colliHint} hintTone={totals.notLoaded > 0 ? "red" : unplanned > 0 ? "amber" : undefined} />
        <KpiTile label="Weight loaded" value={formatKg(totals.weightKg)} />
        <KpiTile
          label="Balanced containers"
          value={`${totals.balanced} of ${plan.loads.length}`}
          tone={totals.balanced < plan.loads.length ? "red" : undefined}
          hint={`centre of gravity within ${BALANCE_TOLERANCE_PCT}% of the middle`}
        />
      </div>

      {plan.notLoaded.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="status">
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

      {plan.loads.length > 0 && (
        <p className={`${HINT} m-0`}>
          Each drawing shows a container from above, to scale, with the front wall on the left and the doors on the right. A piece carries the number of its cargo line; “×2” means
          two high. The cross is the middle of the floor, the dot the centre of gravity. Floor used is the share of the floor under cargo.
        </p>
      )}

      <div id="loading-plan-3d">
        <LoadView3D plan={plan} unit={unit} hexOf={(lineId) => colourOf(lineId).hex} numberOf={numberOf} shown={inView} onShow={setShown} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {plan.loads.map((load, index) => (
          <LoadCard
            key={index}
            load={load}
            number={index + 1}
            unit={unit}
            colourOf={colourOf}
            numberOf={numberOf}
            onShow3D={() => {
              setShown(index);
              document.getElementById("loading-plan-3d")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        ))}
      </div>
    </div>
  );
}
