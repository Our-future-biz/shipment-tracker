"use client";

import { PillTabs, SectionCard } from "@/components/SectionCard";
import { CHIP, CHIP_ON, HINT, LABEL_TEXT } from "@/styles/ui";
import { CONTAINERS, GROUP_ORDER, type ContainerGroup } from "../_lib/containers";
import { formatDim, formatKg, type DimUnit } from "../_lib/units";

interface EquipmentCardProps {
  /** Ids of the nominated container types; null lets the planner choose. */
  nominated: string[] | null;
  unit: DimUnit;
  onChange: (nominated: string[] | null) => void;
}

const MODE_TABS = [
  { key: "auto", label: "Planner chooses" },
  { key: "nominated", label: "Nominate equipment" },
] as const;

const GROUP_TITLE: Record<ContainerGroup, string> = { standard: "Standard", "open-top": "Open top and hard-top", "flat-rack": "Flat rack" };

// Which equipment the plan may use: the planner's own choice from all types, or only the types the
// user nominates.
export function EquipmentCard({ nominated, unit, onChange }: EquipmentCardProps) {
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
          another container is opened.
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
                      {/* What the type takes, readable without a mouse: inside size and payload. */}
                      <span className="text-[11px] font-normal text-slate-500">
                        {formatDim(c.internalL, unit)} × {formatDim(c.internalW, unit)} × {formatDim(c.internalH, unit)} {unit} · {formatKg(c.payloadKg)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className={`${HINT} m-0`}>
            {nominated.length === 0 ? "Choose the container types to load into. " : ""}Each type shows its inside size (length × width × height) and its payload. Cargo the chosen
            types cannot take is listed as not loaded, with what it needs.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
