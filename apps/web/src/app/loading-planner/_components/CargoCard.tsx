"use client";

import { useState, type ClipboardEvent } from "react";
import { Checkbox, Dropdown, Input, InputNumber } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, CopyOutlined, DeleteOutlined, EllipsisOutlined, FileSearchOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { DecimalInput } from "@/components/DecimalInput";
import { Pill } from "@/components/Pill";
import { PillTabs, SectionCard } from "@/components/SectionCard";
import { BTN, HINT, ICON_BTN_DANGER, LINK, TD, TH } from "@/styles/ui";
import { completeLine, isBlank, lineLabel, MAX_COLLI, missingFigures, type DraftLine } from "../_lib/cargoForm";
import { duplicateLine, moveLine, pastedLines, STANDARD_UNITS, withStandardUnit } from "../_lib/cargoTools";
import type { PlanRules } from "../_lib/containers";
import { standardLabel } from "../_lib/gauge";
import { dgWords, isDangerous } from "../_lib/dangerous";
import { lineColour } from "../_lib/loadStats";
import { LineNotesModal } from "./LineNotesModal";
import { DIM_DECIMALS, DIM_UNITS, fromMm, toMm, type DimUnit } from "../_lib/units";

interface CargoCardProps {
  lines: DraftLine[];
  unit: DimUnit;
  onUnitChange: (unit: DimUnit) => void;
  onChange: (lines: DraftLine[]) => void;
  onAdd: () => void;
  /** An id for a line made here: a copy, or a row pasted from a spreadsheet. */
  newId: () => string;
  /** Opens the reader: cargo lines out of a file or a pasted text. */
  onRead: () => void;
  /** The cargo is being read from a job: the table waits for it. */
  busy?: boolean;
  /** The company's rules: "Fits" is judged with them. */
  rules: PlanRules;
  /** A 45' is nominated: "Fits" is then judged against its length. */
  with45: boolean;
  /** The colour of a line's mark; by default its row's. A sailing's box is coloured by shipment. */
  colourOf?: (lineId: string) => { dot: string };
}

const UNIT_TABS = DIM_UNITS.map((unit) => ({ key: unit, label: unit }));

// The cargo list of a plan: one line per kind of piece, typed in place. Sizes are typed in the
// chosen unit and kept in millimetres. A line is planned as soon as all its figures are in; until
// then its last column says which figure is missing. Each line has a number, which every drawing
// and table of the plan uses for it.
export function CargoCard({ lines, unit, onUnitChange, onChange, onAdd, newId, onRead, busy = false, rules, with45, colourOf }: CargoCardProps) {
  // The line whose dangerous goods and lashing note are being edited.
  const [notesOf, setNotesOf] = useState<string | null>(null);
  const patch = (id: string, change: Partial<DraftLine>) => onChange(lines.map((line) => (line.id === id ? { ...line, ...change } : line)));

  // The line last removed, with its place: one click puts it back (Council Outlay 14, P5). Forgotten once the list changes otherwise.
  const [removed, setRemoved] = useState<{ line: DraftLine; at: number; label: string } | null>(null);
  // What a paste brought in, said under the table until the list changes again.
  const [pasted, setPasted] = useState<string | null>(null);
  const change = (next: DraftLine[]) => {
    setRemoved(null);
    setPasted(null);
    onChange(next);
  };
  const remove = (line: DraftLine, at: number) => {
    setPasted(null);
    onChange(lines.filter((l) => l.id !== line.id));
    // A blank line is nothing to bring back.
    setRemoved(isBlank(line) ? null : { line, at, label: lineLabel(line, at) });
  };
  const undo = () => {
    if (!removed) return;
    onChange([...lines.slice(0, removed.at), removed.line, ...lines.slice(removed.at)]);
    setRemoved(null);
  };
  // Rows copied from a spreadsheet become cargo lines; anything else is a plain paste into the cell under the cursor.
  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const read = pastedLines(e.clipboardData.getData("text/plain"), unit, newId);
    if (!read) return;
    e.preventDefault();
    change([...lines.filter((line) => !isBlank(line)), ...read]);
    const unfinished = read.filter((line) => missingFigures(line).length > 0).length;
    setPasted(`${read.length === 1 ? "1 line" : `${read.length} lines`} pasted, sizes read in ${unit}${unfinished > 0 ? `; ${unfinished} still ${unfinished === 1 ? "lacks" : "lack"} a figure` : ""}.`);
  };

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
      <div className="overflow-x-auto" inert={busy} onPaste={handlePaste}>
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
              <th className={`${TH} w-[76px]`} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const complete = completeLine(line);
              const standard = complete ? standardLabel(complete, rules, with45) : null;
              const missing = missingFigures(line);
              return (
                <tr key={line.id}>
                  <td className={`${TD} !pl-4`}>
                    <span className="flex items-center gap-2 font-semibold tabular-nums text-slate-900">
                      <span className={`h-3 w-3 shrink-0 rounded-sm border border-slate-700 ${(colourOf ? colourOf(line.id) : lineColour(index)).dot}`} aria-hidden />
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
                      {isDangerous(line) && (
                        <Pill tone="red" title="Dangerous goods. The planner does not plan by it: it warns when two classes share a container.">
                          {dgWords(line)}
                        </Pill>
                      )}
                    </span>
                    {/* How the line is to be lashed, as typed in its "Dangerous goods and lashing" dialog (Council Outlay 14, P11). */}
                    {line.lashing?.trim() && <span className="mt-0.5 block max-w-[320px] truncate text-[11px] text-slate-500" title={line.lashing}>Lashing: {line.lashing}</span>}
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
                    {standard && <Pill tone={standard === "Fits" ? "green" : "amber"}>{standard}</Pill>}
                    {missing.length > 0 && <span className="text-[12px] font-medium text-amber-700">Not planned: fill in {missing.join(", ")}</span>}
                  </td>
                  <td className={TD}>
                    <span className="flex items-center gap-1">
                      <Dropdown
                        trigger={["click"]}
                        placement="bottomRight"
                        menu={{
                          items: [
                            { key: "copy", icon: <CopyOutlined />, label: "Duplicate line" },
                            { key: "up", icon: <ArrowUpOutlined />, label: "Move up", disabled: index === 0 },
                            { key: "down", icon: <ArrowDownOutlined />, label: "Move down", disabled: index === lines.length - 1 },
                            { key: "notes", icon: <WarningOutlined />, label: "Dangerous goods and lashing…" },
                            { type: "divider" },
                            { key: "units", type: "group", label: "Standard unit: fills the sizes", children: STANDARD_UNITS.map((u) => ({ key: `unit:${u.key}`, label: u.label })) },
                          ],
                          onClick: ({ key }) => {
                            if (key === "copy") change(duplicateLine(lines, line.id, newId));
                            else if (key === "up") change(moveLine(lines, line.id, -1));
                            else if (key === "down") change(moveLine(lines, line.id, 1));
                            else if (key === "notes") setNotesOf(line.id);
                            else {
                              const standard = STANDARD_UNITS.find((u) => `unit:${u.key}` === key);
                              if (standard) change(lines.map((l) => (l.id === line.id ? withStandardUnit(l, standard) : l)));
                            }
                          },
                        }}
                      >
                        <button type="button" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={`More for ${lineLabel(line, index)}: duplicate, move, dangerous goods and lashing, standard unit`}>
                          <EllipsisOutlined />
                        </button>
                      </Dropdown>
                      <button type="button" className={ICON_BTN_DANGER} aria-label={`Remove ${lineLabel(line, index)}`} onClick={() => remove(line, index)}>
                        <DeleteOutlined />
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(removed || pasted) && (
        <p className="m-0 flex flex-wrap items-center gap-x-3 border-t border-slate-100 px-4 py-2 text-[13px] text-slate-700" role="status">
          {removed && (
            <span>
              {removed.label} removed.{" "}
              <button type="button" className={`${LINK} cursor-pointer border-0 bg-transparent p-0 font-medium`} onClick={undo}>
                Undo
              </button>
            </span>
          )}
          {pasted && <span>{pasted}</span>}
        </p>
      )}
      <p className={`${HINT} m-0 px-4 py-2.5`}>
        Rows copied from a spreadsheet can be pasted straight into the table: name, length, width, height, weight per piece, colli, in that order (the name may be left out). A line is planned once its length, width, height, weight per piece and colli are filled in. <strong>May turn</strong>: the piece may also be loaded crosswise; without it,
        its long side goes along the container. <strong>Stackable</strong>: pieces of this line may stand on each other, two high. <strong>Standard container</strong>: “Fits” means
        the piece goes into a standard container through its doors and its floor carries it; otherwise the plan takes an open top or a flat rack. “Too heavy” is a piece
        whose weight is too much for the length of floor it rests on, or over the weight set for standard containers.
      </p>
      <LineNotesModal
        line={lines.find((l) => l.id === notesOf) ?? null}
        label={lineLabel(lines.find((l) => l.id === notesOf) ?? { name: "" }, lines.findIndex((l) => l.id === notesOf))}
        onClose={() => setNotesOf(null)}
        onSave={(notes) => notesOf && patch(notesOf, notes)}
      />
    </SectionCard>
  );
}
