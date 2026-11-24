"use client";

import { PillTabs, SectionCard } from "@/components/SectionCard";
import { CHIP, CHIP_ON, HINT, LABEL_TEXT, LINK } from "@/styles/ui";
import { CONTAINERS, floorText, GROUP_ORDER, type Clearance, type ContainerGroup, type PlanRules } from "../_lib/containers";
import { formatDim, formatKg, type DimUnit } from "../_lib/units";

interface EquipmentCardProps {
  /** Ids of the nominated container types; null lets the planner choose. */
  nominated: string[] | null;
  unit: DimUnit;
  onChange: (nominated: string[] | null) => void;
  /** The company's rules the plan is worked out with, and the way to the screen that sets them. */
  rules: PlanRules;
  onSettings: () => void;
}

/** "50 mm on door width, 50 mm on door height and 100 mm on length" in the unit of the screen. */
export const clearanceText = (clearance: Clearance, unit: DimUnit): string =>
  `${formatDim(clearance.doorWidthMm, unit)} ${unit} on door width, ${formatDim(clearance.doorHeightMm, unit)} ${unit} on door height and ${formatDim(clearance.lengthMm, unit)} ${unit} on length`;

const MODE_TABS = [
  { key: "auto", label: "Planner chooses" },
  { key: "nominated", label: "Nominate equipment" },
] as const;

const GROUP_TITLE: Record<ContainerGroup, string> = { standard: "Standard", "open-top": "Open top and hard-top", "flat-rack": "Flat rack" };

// Which equipment the plan may use: the planner's own choice from all types, or only the types the
// user nominates.
export function EquipmentCard({ nominated, unit, onChange, rules, onSettings }: EquipmentCardProps) {
  const toggle = (id: string) => {
    const now = nominated ?? [];
    onChange(now.includes(id) ? now.filter((n) => n !== id) : [...now, id]);
  };

  return (
    <SectionCard
      title="Equipment"
      extra={<PillTabs tabs={MODE_TABS} active={nominated === null ? "auto" : "nominated"} onChange={(key) => onChange(key === "auto" ? null : [])} />}
    >
      {nominated === null ? (
        <p className={`${HINT} m-0`}>
          The planner loads into standard containers wherever it can, takes open tops for over-height cargo and flat racks last. A flat rack or open top in use is filled before
          another container is opened. A 45&apos; or a hard-top is used only when you nominate it.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {GROUP_ORDER.map((group) => (
            <div key={group}>
              <div className={`${LABEL_TEXT} mb-1.5`}>{GROUP_TITLE[group]}</div>
              <div className="flex flex-wrap gap-2">
                {CONTAINERS.filter((c) => c.group === group).map((c) => {
                  const on = nominated.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(c.id)}
                      className={`${CHIP} !h-auto flex-col !items-start !gap-0 py-1 ${on ? CHIP_ON : ""}`}
                    >
                      <span>{c.name}</span>
                      {/* What the type takes, readable without a mouse: inside size, payload and floor strength. */}
                      <span className="text-[11px] font-normal text-slate-500">
                        {formatDim(c.internalL, unit)} × {formatDim(c.internalW, unit)} × {formatDim(c.internalH, unit)} {unit} · {formatKg(c.payloadKg)} · {floorText(c)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className={`${HINT} m-0`}>
            {nominated.length === 0 ? "Choose the container types to load into. " : ""}Each type shows its inside size (length × width × height), its payload and what its floor carries. Cargo the chosen
            types cannot take is listed as not loaded, with what it needs.
          </p>
        </div>
      )}
      <p className={`${HINT} m-0 mt-3`}>
        Standard containers are planned with a clearance left free: {clearanceText(rules.clearance, unit)}. A single piece over {formatKg(rules.heavyPiece.moveKg)} is planned
        onto an open top or flat rack. A piece too heavy for the length of floor it rests on, even with 1 m of beams under each end, is not loaded.{" "}
        <button type="button" className={`${LINK} cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium`} onClick={onSettings}>
          Settings
        </button>
      </p>
    </SectionCard>
  );
}
