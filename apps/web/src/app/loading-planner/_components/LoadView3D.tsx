"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { PillTabs, SectionCard } from "@/components/SectionCard";
import { HINT, ICON_BTN, LABEL_TEXT } from "@/styles/ui";
import { hasDoors } from "../_lib/loadStats";
import type { LoadPlan, PlacedPiece } from "../_lib/plan";
import { pieceKey, type CameraView } from "../_lib/scene";
import { formatDim, formatKg, formatSize, type DimUnit } from "../_lib/units";

const Unavailable = () => (
  <p className={`${HINT} m-0 rounded-lg bg-slate-50 px-4 py-6 text-center`}>The 3D view could not be loaded. Reload the page to try again; the floor plans below show the same loads.</p>
);

// The 3D library is large and draws only in a browser: it is fetched when a plan has a load to show.
// If it cannot be fetched (a new version went live while the page was open), the page carries on without it.
const Viewer3D = dynamic(
  () =>
    import("./Viewer3D").then(
      (m) => m.Viewer3D,
      () => Unavailable,
    ),
  {
    ssr: false,
    loading: () => <div className={`h-[460px] w-full rounded-lg bg-slate-50 flex items-center justify-center ${HINT}`}>Loading the 3D view…</div>,
  },
);

interface LoadView3DProps {
  plan: LoadPlan;
  unit: DimUnit;
  hexOf: (lineId: string) => string;
  numberOf: (lineId: string) => number;
  /** The container shown, from 0, and how the user steps to another. */
  shown: number;
  onShow: (index: number) => void;
}

const VIEW_TABS = [
  { key: "perspective", label: "3D" },
  { key: "top", label: "Top" },
  { key: "side", label: "Side" },
  { key: "front", label: "Front end" },
] as const;

// The plan's containers in 3D, one at a time: the arrows (or "Show in 3D" on a container's card)
// step through them, the tabs move the camera, and a click on a piece shows what it is and where
// it stands.
export function LoadView3D({ plan, unit, hexOf, numberOf, shown, onShow }: LoadView3DProps) {
  const [view, setView] = useState<CameraView>("perspective");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = plan.loads[shown];
  if (!load) return null;
  // The picked piece is known by its line and place, so it stays picked while other cargo changes.
  const picked: PlacedPiece | null = load.pieces.find((piece) => pieceKey(piece) === selectedKey) ?? null;

  const step = (by: number) => {
    onShow((shown + by + plan.loads.length) % plan.loads.length);
    setSelectedKey(null);
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
      <Viewer3D
        load={load}
        view={view}
        containerKey={`${shown}|${load.container.id}`}
        hexOf={hexOf}
        selectedKey={picked ? selectedKey : null}
        onSelect={(piece) => setSelectedKey(piece ? pieceKey(piece) : null)}
        label={`3D view of container ${shown + 1}, a ${load.container.name} with ${load.pieces.length} colli. The floor plan and table of this container below say the same in text.`}
      />
      {picked ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] text-slate-700 sm:grid-cols-4">
          <span>
            <span className={`${LABEL_TEXT} block`}>Cargo</span>
            {numberOf(picked.lineId)} · {picked.name || "Cargo"}
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
            <span className={`${LABEL_TEXT} block`}>Position</span>
            {formatDim(Math.max(0, picked.z), unit)} {unit} from the front wall, {picked.y > 0 ? `stacked at ${formatDim(picked.y, unit)} ${unit}` : "on the floor"}
            {picked.crosswise ? ", crosswise" : ""}
          </span>
        </div>
      ) : (
        <p className={`${HINT} m-0`}>
          Drag to turn, hold Ctrl or ⌘ and scroll to zoom, click a piece to see what it is.{" "}
          {hasDoors(load.container) ? "The blue frame is the door end. " : ""}The green frame on the floor is the area the centre of gravity must stay in; the post marks where it
          is.
        </p>
      )}
    </SectionCard>
  );
}
