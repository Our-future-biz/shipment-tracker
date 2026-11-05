"use client";

import { Checkbox } from "antd";
import { Badge } from "@/components/Badge";
import type { interfaces } from "@/lib/api/client";
import { LABEL_TEXT } from "@/styles/ui";
import { DIRECTIONS } from "../../_lib/railTariffs";

const DIRECTION_OPTIONS = DIRECTIONS.map((d) => ({ value: d.value, label: d.label }));

interface OceanDirectionFieldsProps {
  value: interfaces.RailDirection[];
  onChange: (value: interfaces.RailDirection[]) => void;
  disabled?: boolean;
}

// Whether a shipping line's tariff is for import, export or both: a checklist, both may be ticked.
export const OceanDirectionFields = ({ value, onChange, disabled }: OceanDirectionFieldsProps) => (
  <fieldset className="m-0 p-0 border-0 text-[13px]">
    <legend className={`${LABEL_TEXT} mb-1.5 p-0`}>Direction</legend>
    <Checkbox.Group aria-label="Direction" options={DIRECTION_OPTIONS} value={value} disabled={disabled} onChange={onChange} className="!flex gap-4" />
  </fieldset>
);

/** A tariff's directions, as chips. */
export const DirectionChips = ({ directions }: { directions: readonly interfaces.RailDirection[] }) => (
  <>
    {DIRECTIONS.filter((d) => directions.includes(d.value)).map((d) => (
      <Badge key={d.value}>
        {d.label}
      </Badge>
    ))}
  </>
);
