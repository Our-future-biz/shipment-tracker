"use client";

import { Checkbox } from "antd";
import type { interfaces } from "@/lib/api/client";
import { DIRECTIONS, TARIFF_PORTS } from "../../_lib/railTariffs";

export interface PortsAndDirections {
  ports: interfaces.TariffPortCode[];
  directions: interfaces.RailDirection[];
}

export const NO_PORTS_AND_DIRECTIONS: PortsAndDirections = { ports: [], directions: [] };

const PORT_OPTIONS = TARIFF_PORTS.map((p) => ({
  value: p.code,
  label: (
    <>
      {p.name} <span className="text-[11.5px] text-slate-400">{p.code}</span>
    </>
  ),
}));

const DIRECTION_OPTIONS = DIRECTIONS.map((d) => ({
  value: d.value,
  label: (
    <>
      {d.label} <span className="text-[11.5px] text-slate-400">{d.hint}</span>
    </>
  ),
}));

const LEGEND = "text-[12px] font-semibold text-slate-600 mb-1.5 p-0";

interface RailTariffPortsFieldsProps {
  value: PortsAndDirections;
  onChange: (value: PortsAndDirections) => void;
  disabled?: boolean;
}

// What a tariff is for: the sea ports it runs from or to and whether it is import, export or both.
// Two checklists; several ticks are allowed in each.
export const RailTariffPortsFields = ({ value, onChange, disabled }: RailTariffPortsFieldsProps) => (
  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-8 gap-y-4 text-[13px]">
    <fieldset className="min-w-0 m-0 p-0 border-0">
      <legend className={LEGEND}>Ports</legend>
      <Checkbox.Group
        aria-label="Ports"
        options={PORT_OPTIONS}
        value={value.ports}
        disabled={disabled}
        onChange={(ports) => onChange({ ...value, ports })}
        className="!grid grid-cols-2 gap-x-4 gap-y-1.5"
      />
    </fieldset>
    <fieldset className="m-0 p-0 border-0">
      <legend className={LEGEND}>Direction</legend>
      <Checkbox.Group
        aria-label="Direction"
        options={DIRECTION_OPTIONS}
        value={value.directions}
        disabled={disabled}
        onChange={(directions) => onChange({ ...value, directions })}
        className="!flex flex-col gap-1.5"
      />
    </fieldset>
  </div>
);
