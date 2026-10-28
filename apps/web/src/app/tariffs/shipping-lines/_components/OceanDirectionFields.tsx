"use client";

import { Checkbox } from "antd";
import type { interfaces } from "@/lib/api/client";
import { DIRECTIONS } from "../../_lib/railTariffs";

const DIRECTION_CHIP = "inline-block rounded-full border px-2 py-0.5 text-[11.5px] font-medium bg-slate-100 text-slate-600 border-slate-200";

const DIRECTION_OPTIONS = DIRECTIONS.map((d) => ({ value: d.value, label: d.label }));

interface OceanDirectionFieldsProps {
  value: interfaces.RailDirection[];
  onChange: (value: interfaces.RailDirection[]) => void;
  disabled?: boolean;
}

// Whether a shipping line's tariff is for import, export or both: a checklist, both may be ticked.
export const OceanDirectionFields = ({ value, onChange, disabled }: OceanDirectionFieldsProps) => (
  <fieldset className="m-0 p-0 border-0 text-[13px]">
    <legend className="text-[12px] font-semibold text-slate-600 mb-1.5 p-0">Direction</legend>
    <Checkbox.Group aria-label="Direction" options={DIRECTION_OPTIONS} value={value} disabled={disabled} onChange={onChange} className="!flex gap-4" />
  </fieldset>
);

/** A tariff's directions, as chips. */
export const DirectionChips = ({ directions }: { directions: readonly interfaces.RailDirection[] }) => (
  <>
    {DIRECTIONS.filter((d) => directions.includes(d.value)).map((d) => (
      <span key={d.value} className={DIRECTION_CHIP}>
        {d.label}
      </span>
    ))}
  </>
);
