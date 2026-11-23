"use client";

import { Checkbox, Input, InputNumber } from "antd";
import { DeleteOutlined, FileSearchOutlined, PlusOutlined } from "@ant-design/icons";
import { DecimalInput } from "@/components/DecimalInput";
import { Pill } from "@/components/Pill";
import { PillTabs, SectionCard } from "@/components/SectionCard";
import { BTN, HINT, ICON_BTN_DANGER, TD, TH } from "@/styles/ui";
import { completeLine, lineLabel, MAX_COLLI, missingFigures, type DraftLine } from "../_lib/cargoForm";
import { fitLabel, gaugeOf } from "../_lib/gauge";
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
  /** The cargo is being read from a job: the table waits for it. */
  busy?: boolean;
}

const UNIT_TABS = DIM_UNITS.map((unit) => ({ key: unit, label: unit }));

// The cargo list of a plan: one line per kind of piece, typed in place. Sizes are typed in the
// chosen unit and kept in millimetres. A line is planned as soon as all its figures are in; until
// then its last column says which figure is missing. Each line has a number, which every drawing
// and table of the plan uses for it.
export function CargoCard({ lines, unit, onUnitChange, onChange, onAdd, onRead, busy = false }: CargoCardProps) {
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
    <SectionCard title="Cargo" bodyClassName="p-0">
      {/* The card's tools wrap onto a second line on a narrow screen. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <span className={HINT}>Sizes in</span>
        <PillTabs tabs={UNIT_TABS} active={unit} onChange={onUnitChange} />
        <span className="flex-1" />
        <button type="button" className={BTN} onClick={onRead} disabled={busy}>
          <FileSearchOutlined />
          Read from a file or text
        </button>
        <button type="button" className={BTN} onClick={onAdd} disabled={busy}>
          <PlusOutlined />
          Add line
        </button>
      </div>
      <div className="overflow-x-auto" inert={busy}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${TH} !pl-4 w-[44px]`}>No.</th>
              <th className={TH}>Cargo</th>
              <th className={TH}>Length ({unit})</th>
              <th className={TH}>Width ({unit})</th>
              <th className={TH}>Height ({unit})</th>
              <th className={TH}>Weight / pc (kg)</th>
              <th className={TH}>Colli</th>
              <th className={TH}>May turn</th>
              <th className={TH}>Stackable</th>
              <th className={TH}>Standard container</th>
              <th className={`${TH} w-[44px]`} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const complete = completeLine(line);
              const gauge = complete ? gaugeOf(complete) : null;
              const fits = gauge && !gauge.overLength && !gauge.overWidth && !gauge.overHeight;
              const missing = missingFigures(line);
              return (
                <tr key={line.id}>
                  <td className={`${TD} !pl-4`}>
                    <span className="flex items-center gap-2 font-semibold tabular-nums text-slate-900">
                      <span className={`h-3 w-3 shrink-0 rounded-sm border border-slate-700 ${lineColour(index).dot}`} aria-hidden />
                      {index + 1}
                    </span>
                  </td>
                  <td className={TD}>
                    <span className="flex items-center gap-2">
                      <Input
                        aria-label={`Name of cargo line ${index + 1}`}
                        size="small"
                        placeholder={lineLabel(line, index)}
                        maxLength={120}
                        value={line.name}
                        onChange={(e) => patch(line.id, { name: e.target.value })}
                        className="!w-[200px]"
                      />
                      {line.dg && (
                        <Pill tone="red" title="Dangerous goods, as the job says. The planner does not plan by it.">
                          DG
                        </Pill>
                      )}
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
                      max={MAX_COLLI}
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
                  <td className={TD}>
                    {gauge && <Pill tone={fits ? "green" : "amber"}>{fitLabel(gauge)}</Pill>}
                    {missing.length > 0 && <span className="text-[12px] font-medium text-amber-700">Not planned: fill in {missing.join(", ")}</span>}
                  </td>
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
      <p className={`${HINT} m-0 px-4 py-2.5`}>
        A line is planned once its length, width, height, weight per piece and colli are filled in. <strong>May turn</strong>: the piece may also be loaded crosswise; without it,
        its long side goes along the container. <strong>Stackable</strong>: pieces of this line may stand on each other, two high. <strong>Standard container</strong>: “Fits” means
        the piece goes into a standard container through its doors; otherwise the plan takes an open top or a flat rack.
      </p>
    </SectionCard>
  );
}
