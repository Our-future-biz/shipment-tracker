"use client";

import { Checkbox, Input, InputNumber } from "antd";
import { DeleteOutlined, FileSearchOutlined, PlusOutlined } from "@ant-design/icons";
import { DecimalInput } from "@/components/DecimalInput";
import { Pill } from "@/components/Pill";
import { PillTabs, SectionCard } from "@/components/SectionCard";
import { BTN_BAR, EMPTY, HINT, ICON_BTN_DANGER, TD, TH } from "@/styles/ui";
import { completeLine, lineLabel, type DraftLine } from "../_lib/cargoForm";
import { gaugeLabel, gaugeOf } from "../_lib/gauge";
import { lineColour } from "../_lib/loadStats";
import { DIM_DECIMALS, DIM_UNITS, fromMm, toMm, type DimUnit } from "../_lib/units";

interface CargoCardProps {
  lines: DraftLine[];
  unit: DimUnit;
  onUnitChange: (unit: DimUnit) => void;
  onChange: (lines: DraftLine[]) => void;
  onAdd: () => void;
  /** Opens the reader: cargo lines out of a file or a pasted text. */
  onRead: () => void;
}

const UNIT_TABS = DIM_UNITS.map((unit) => ({ key: unit, label: unit, title: `Type and show sizes in ${unit}` }));

// The cargo list of a plan: one line per kind of piece, typed in place. Sizes are typed in the
// chosen unit and kept in millimetres. A line is planned as soon as all its figures are in; its
// pill says where it is out of gauge.
export function CargoCard({ lines, unit, onUnitChange, onChange, onAdd, onRead }: CargoCardProps) {
  const patch = (id: string, change: Partial<DraftLine>) => onChange(lines.map((line) => (line.id === id ? { ...line, ...change } : line)));

  const sizeCell = (line: DraftLine, field: "lengthMm" | "widthMm" | "heightMm", label: string) => {
    const mm = line[field];
    return (
      <td className={TD}>
        <DecimalInput
          aria-label={`${label} of ${line.name || "the line"} in ${unit}`}
          size="small"
          controls={false}
          min={0}
          precision={DIM_DECIMALS[unit]}
          value={mm === null ? null : fromMm(mm, unit)}
          onChange={(value) => patch(line.id, { [field]: value === null ? null : toMm(value, unit) })}
          className="!w-[84px]"
        />
      </td>
    );
  };

  return (
    <SectionCard
      title="Cargo"
      bodyClassName="p-0"
      extra={
        <>
          <PillTabs tabs={UNIT_TABS} active={unit} onChange={onUnitChange} />
          <button type="button" className={BTN_BAR} onClick={onRead}>
            <FileSearchOutlined />
            Read from file or text
          </button>
          <button type="button" className={BTN_BAR} onClick={onAdd}>
            <PlusOutlined />
            Add line
          </button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${TH} !pl-4`}>Cargo</th>
              <th className={TH}>Length ({unit})</th>
              <th className={TH}>Width ({unit})</th>
              <th className={TH}>Height ({unit})</th>
              <th className={TH}>Weight / pc (kg)</th>
              <th className={TH}>Colli</th>
              <th className={TH} title="The piece may also be loaded crosswise. Without it, it goes long side along the container.">
                May turn
              </th>
              <th className={TH} title="Pieces of this line may stand on each other.">
                Stackable
              </th>
              <th className={TH}>Gauge</th>
              <th className={`${TH} w-[44px]`} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const complete = completeLine(line);
              const gauge = complete ? gaugeOf(complete) : null;
              const inGauge = gauge && !gauge.overLength && !gauge.overWidth && !gauge.overHeight;
              return (
                <tr key={line.id}>
                  <td className={`${TD} !pl-4`}>
                    <span className="flex items-center gap-2">
                      <span className={`h-3 w-3 shrink-0 rounded-sm ${lineColour(index).dot}`} aria-hidden />
                      <Input
                        aria-label={`Name of cargo line ${index + 1}`}
                        size="small"
                        placeholder={lineLabel(line, index)}
                        maxLength={120}
                        value={line.name}
                        onChange={(e) => patch(line.id, { name: e.target.value })}
                        className="!w-[200px]"
                      />
                    </span>
                  </td>
                  {sizeCell(line, "lengthMm", "Length")}
                  {sizeCell(line, "widthMm", "Width")}
                  {sizeCell(line, "heightMm", "Height")}
                  <td className={TD}>
                    <DecimalInput
                      aria-label={`Weight per piece of ${line.name || "the line"} in kg`}
                      size="small"
                      controls={false}
                      min={0}
                      precision={1}
                      value={line.weightKg}
                      onChange={(value) => patch(line.id, { weightKg: value })}
                      className="!w-[96px]"
                    />
                  </td>
                  <td className={TD}>
                    <InputNumber<number>
                      aria-label={`Colli of ${line.name || "the line"}`}
                      size="small"
                      min={1}
                      max={2000}
                      precision={0}
                      value={line.colli}
                      onChange={(value) => patch(line.id, { colli: value })}
                      className="!w-[72px]"
                    />
                  </td>
                  <td className={TD}>
                    <Checkbox aria-label={`${line.name || "The line"} may turn`} checked={line.canTurn} onChange={(e) => patch(line.id, { canTurn: e.target.checked })} />
                  </td>
                  <td className={TD}>
                    <Checkbox aria-label={`${line.name || "The line"} is stackable`} checked={line.stackable} onChange={(e) => patch(line.id, { stackable: e.target.checked })} />
                  </td>
                  <td className={TD}>{gauge ? <Pill tone={inGauge ? "green" : "amber"}>{gaugeLabel(gauge)}</Pill> : <span className={EMPTY}>—</span>}</td>
                  <td className={TD}>
                    <button type="button" className={ICON_BTN_DANGER} aria-label={`Remove ${lineLabel(line, index)}`} onClick={() => onChange(lines.filter((l) => l.id !== line.id))}>
                      <DeleteOutlined />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={`${HINT} m-0 px-4 py-2.5`}>A line is planned once its sizes, weight and colli are filled in. Weight is per piece.</p>
    </SectionCard>
  );
}
