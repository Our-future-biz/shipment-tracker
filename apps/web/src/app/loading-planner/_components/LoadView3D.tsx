"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { PillTabs, SectionCard } from "@/components/SectionCard";
import { HINT, ICON_BTN, LABEL_TEXT } from "@/styles/ui";
import type { LoadPlan, PlacedPiece } from "../_lib/plan";
import type { CameraView } from "../_lib/scene";
import { formatDim, formatKg, formatSize, type DimUnit } from "../_lib/units";

// The 3D library is large and draws only in a browser: it is fetched when a plan has a load to show.
const Viewer3D = dynamic(() => import("./Viewer3D").then((m) => m.Viewer3D), {
  ssr: false,
  loading: () => <div className={`h-[460px] w-full rounded-lg bg-slate-50 flex items-center justify-center ${HINT}`}>Loading the 3D view…</div>,
});

interface LoadView3DProps {
  plan: LoadPlan;
  unit: DimUnit;
  hexOf: (lineId: string) => string;
}

const VIEW_TABS = [
  { key: "perspective", label: "3D" },
  { key: "top", label: "Top" },
  { key: "side", label: "Side" },
  { key: "front", label: "End" },
] as const;

// The plan's containers in 3D, one at a time: the arrows step through them, the tabs move the
// camera, and a click on a piece shows what it is and where it stands.
export function LoadView3D({ plan, unit, hexOf }: LoadView3DProps) {
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<CameraView>("perspective");
  const [selected, setSelected] = useState<PlacedPiece | null>(null);

  // A plan worked out again may have fewer containers than the one being looked at.
  const shown = Math.min(index, plan.loads.length - 1);
  const load = plan.loads[shown];
  if (!load) return null;
  // The picked piece belongs to one load of one plan; in any other it is not picked.
  const picked = selected && load.pieces.includes(selected) ? selected : null;

  const step = (by: number) => {
    setIndex((shown + by + plan.loads.length) % plan.loads.length);
    setSelected(null);
  };

  return (
    <SectionCard
      title={`3D view · #${shown + 1} ${load.container.name}`}
      bodyClassName="p-4 flex flex-col gap-3"
      extra={
        <>
          <PillTabs tabs={VIEW_TABS} active={view} onChange={setView} />
          <button type="button" className={ICON_BTN} aria-label="Previous container" disabled={plan.loads.length < 2} onClick={() => step(-1)}>
            <LeftOutlined />
          </button>
          <span className="text-[13px] tabular-nums text-slate-700">
            {shown + 1} / {plan.loads.length}
          </span>
          <button type="button" className={ICON_BTN} aria-label="Next container" disabled={plan.loads.length < 2} onClick={() => step(1)}>
            <RightOutlined />
          </button>
        </>
      }
    >
      <Viewer3D load={load} view={view} hexOf={hexOf} selected={picked} onSelect={setSelected} />
      {picked ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] text-slate-700 sm:grid-cols-4">
          <span>
            <span className={`${LABEL_TEXT} block`}>Piece</span>
            {picked.name || "Cargo"}
          </span>
          <span>
            <span className={`${LABEL_TEXT} block`}>Loaded as (L × W × H)</span>
            {formatSize(picked.length, picked.width, picked.height, unit)}
          </span>
          <span>
            <span className={`${LABEL_TEXT} block`}>Weight</span>
            {formatKg(picked.weightKg)}
          </span>
          <span>
            <span className={`${LABEL_TEXT} block`}>Stands</span>
            {formatDim(Math.max(0, picked.z), unit)} {unit} from the end, {picked.y > 0 ? `stacked at ${formatDim(picked.y, unit)} ${unit}` : "on the floor"}
            {picked.crosswise ? ", crosswise" : ""}
          </span>
        </div>
      ) : (
        <p className={`${HINT} m-0`}>
          Drag to turn, hold Ctrl or ⌘ and scroll to zoom, click a piece to see what it is. The green frame on the floor is the area the centre of gravity must stay in; the post marks where it is.
        </p>
      )}
    </SectionCard>
  );
}
