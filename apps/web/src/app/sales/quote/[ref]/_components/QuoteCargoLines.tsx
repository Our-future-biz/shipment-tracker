"use client";

import { useState, type ReactNode } from "react";
import { Checkbox, InputNumber, Select } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { RowActionsMenu } from "@/app/shipments/_components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { useListKeys } from "@/hooks/useListKeys";
import { useOpenRows } from "@/hooks/useOpenRows";
import { CONTAINER_KINDS, CONTAINER_KINDS_BY_SIZE, CONTAINER_SIZES, containerType, teuForType } from "@/lib/cargo";
import { moneyInputParser } from "@/lib/money";
import { checkContainerWeight, type WeightCheck } from "../../../_lib/containerWeight";
import { PACKING_TYPES, type PackageLine, type QuoteContainerLine } from "../../../_lib/types";
import { containerLineName, lineFigure, packageLineName, withLineCopied, withoutLine } from "../_lib/cargoLines";
import { fmtQuantity } from "../_lib/fmtQuantity";
import { LINE_TD_CLASS, LINE_TH_CLASS, LINE_TH_RIGHT_CLASS, LineBlock, LineBlockEmpty, LineTable } from "./LineBlock";
import { MiniButton } from "./QuoteButtons";

// The container and package lines of a quote's Cargo details, as a shipment's Container Details
// lists its containers: a line reads as text, a double-click opens it for editing (focus leaving
// it, Enter or a click outside closes it again), and its "⋯" menu edits, copies or deletes it -
// Delete one click further away, and asked first. What a line holds and how the quote saves it
// is the caller's: every change hands it the whole list (onChange).

// A new package has no dimensions and no weight: made-up ones would print as real cargo and drive
// the chargeable weight.
const emptyPackage: PackageLine = { qty: 1, type: "Pallets", stackable: true };
// A new container is the most quoted box; its cargo weight is left for somebody to enter.
const emptyContainer: QuoteContainerLine = { qty: 1, type: "40' HC" };
// The container types a line can be, as the shipment's Container Details offer them: grouped by
// size, each group saying what one box of it counts in TEU.
const CONTAINER_TYPE_OPTIONS = CONTAINER_SIZES.map((size) => ({
  label: `${size} containers · ${teuForType(size)} TEU`,
  options: (CONTAINER_KINDS_BY_SIZE[size] ?? CONTAINER_KINDS).map((kind) => ({ value: `${size} ${kind}`, label: `${size} ${kind}` })),
}));

// The KG / CONTAINER field by where the cargo weight stands: no colour within the standard limit,
// amber when it needs a heavy-tested box (or the shipping line's confirmation), red when too heavy.
const WEIGHT_FIELD_CLASS: Record<WeightCheck["level"], string> = {
  standard: "",
  heavyTested: "!bg-amber-100 !border-amber-400",
  confirm: "!bg-amber-100 !border-amber-400",
  tooHeavy: "!bg-red-100 !border-red-400",
};
// The same weight as a line reads it.
const WEIGHT_TEXT_CLASS: Record<WeightCheck["level"], string> = {
  standard: "",
  heavyTested: "!text-amber-700",
  confirm: "!text-amber-700",
  tooHeavy: "!text-red-600 font-semibold",
};

// Beside a container line: the type's weight limits, and what the cargo weight on it needs.
function ContainerWeightNote({ check }: { check: WeightCheck }) {
  const kg = (n: number) => `${n.toLocaleString("en-US")} kg`;
  return (
    <div className="text-[12px] leading-4 text-slate-500">
      Standard up to {kg(check.standard)} · {check.heavyTested ? "Heavy tested up to" : "Max"} {kg(check.max)}
      {check.level === "heavyTested" && <span className="block text-amber-700">Heavy-tested box needed</span>}
      {check.level === "confirm" && (
        <span className="block text-amber-700">
          {check.heavyTested && "Heavy-tested box needed. "}
          <strong>You need to have it confirmed by shipping line</strong>
        </span>
      )}
      {check.level === "tooHeavy" && <span className="block font-semibold text-red-600">Too heavy for this box</span>}
    </div>
  );
}

// A line as it reads: double-click opens it. A cell clicked twice inside the "⋯" menu does not
// (RowActionsMenu stops it).
const READ_ROW = "cursor-pointer hover:bg-slate-50 select-none";
const figure = (n: number | undefined) => lineFigure(n) || EMPTY_CELL;

/** One table of lines with the row lock, the "⋯" menu and the delete confirmation. */
function useLines<T extends object>(table: string, lines: readonly T[], onChange: (lines: T[]) => void) {
  const keys = useListKeys(lines.length);
  const open = useOpenRows(table);
  // The line whose Delete waits for a yes.
  const [deleting, setDeleting] = useState<number | null>(null);

  const patch = (i: number, change: Partial<T>) => onChange(lines.map((x, j) => (j === i ? { ...x, ...change } : x)));
  const add = (line: T) => {
    onChange([...lines, { ...line }]);
    // A new line is there to be filled in: it opens at once.
    open.open(lines.length);
  };
  // Rows are told apart by their place, so the open ones are closed when a line comes or goes.
  const copy = (i: number) => {
    keys.insert(i + 1);
    open.reset();
    onChange(withLineCopied(lines, i));
  };
  const remove = (i: number) => {
    keys.remove(i);
    open.reset();
    onChange(withoutLine(lines, i));
  };
  return { keys: keys.keys, open, deleting, setDeleting, patch, add, copy, remove };
}

interface LinesProps<T> {
  lines: T[];
  /** Every change of the lines: the whole list as it is to be saved. */
  onChange: (lines: T[]) => void;
  /** A closed quote: the lines are shown, with no editing and no menu. */
  readOnly: boolean;
}

interface RowMenuProps {
  label: string;
  locked: boolean;
  readOnly: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

// The "⋯" of a line: Edit while it reads as text, Copy, Delete. Nothing on a closed quote.
function RowMenu({ label, locked, readOnly, onEdit, onCopy, onDelete }: RowMenuProps) {
  if (readOnly) return null;
  return <RowActionsMenu label={label} onEdit={locked ? onEdit : undefined} onCopy={onCopy} onDelete={onDelete} />;
}

// The cell of the "⋯" column, centred under nothing (the column has no heading of its own).
const MenuCell = ({ children }: { children: ReactNode }) => <td className={`${LINE_TD_CLASS} !px-0 text-center`}>{children}</td>;

/** The equipment of a full-container quote. */
export function QuoteContainerLines({ lines, onChange, readOnly }: LinesProps<QuoteContainerLine>) {
  const { keys, open, deleting, setDeleting, patch, add, copy, remove } = useLines("quote-containers", lines, onChange);
  const asked = deleting !== null ? lines[deleting] : undefined;

  return (
    <LineBlock
      title="Containers"
      actions={
        <MiniButton icon={<PlusOutlined />} onClick={() => add(emptyContainer)}>
          Add container
        </MiniButton>
      }
    >
      {lines.length === 0 ? (
        <LineBlockEmpty>No containers yet.</LineBlockEmpty>
      ) : (
        <LineTable minWidthClass="min-w-[760px]">
          <colgroup>
            <col className="w-[76px]" />
            <col className="w-[200px]" />
            <col className="w-16" />
            <col className="w-[140px]" />
            <col />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={LINE_TH_CLASS}>Qty</th>
              <th scope="col" className={LINE_TH_CLASS}>Container type</th>
              <th scope="col" className={LINE_TH_RIGHT_CLASS}>TEU</th>
              <th scope="col" className={LINE_TH_CLASS}>Kg / container</th>
              <th scope="col" className={LINE_TH_CLASS}>Weight limit</th>
              <th scope="col" aria-label="Container line actions" className={LINE_TH_CLASS} />
            </tr>
          </thead>
          <tbody>
            {lines.map((c, i) => {
              const weightCheck = checkContainerWeight(c.type, c.weight);
              const teu = <td className={`${LINE_TD_CLASS} text-right tabular-nums`}>{fmtQuantity((Number(c.qty) || 0) * teuForType(c.type))}</td>;
              const note = <td className={LINE_TD_CLASS}>{weightCheck ? <ContainerWeightNote check={weightCheck} /> : EMPTY_CELL}</td>;
              const menu = (locked: boolean) => (
                <MenuCell>
                  <RowMenu label={`Container line ${i + 1} actions`} locked={locked} readOnly={readOnly} onEdit={() => open.open(i)} onCopy={() => copy(i)} onDelete={() => setDeleting(i)} />
                </MenuCell>
              );
              if (readOnly || !open.isOpen(i)) {
                return (
                  <tr key={keys[i]} className={readOnly ? undefined : READ_ROW} title={readOnly ? undefined : "Double-click to edit"} onDoubleClick={readOnly ? undefined : () => open.open(i)}>
                    <td className={`${LINE_TD_CLASS} tabular-nums`}>{figure(c.qty)}</td>
                    <td className={`${LINE_TD_CLASS} truncate`}>{containerType(c.type) || EMPTY_CELL}</td>
                    {teu}
                    <td className={`${LINE_TD_CLASS} tabular-nums ${WEIGHT_TEXT_CLASS[weightCheck?.level ?? "standard"]}`}>{lineFigure(c.weight) ? `${lineFigure(c.weight)} kg` : EMPTY_CELL}</td>
                    {note}
                    {menu(true)}
                  </tr>
                );
              }
              return (
                <tr key={keys[i]} data-edit-row="quote-containers" onBlur={open.onRowBlur(i)} onKeyDown={open.onRowKeyDown(i)}>
                  <td className={LINE_TD_CLASS}>
                    <InputNumber size="small" className="!w-full" aria-label="Number of containers" min={1} precision={0} parser={moneyInputParser} value={c.qty} onChange={(v) => patch(i, { qty: v ?? 1 })} />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <Select
                      size="small"
                      className="w-full"
                      aria-label="Container type"
                      // A box saved as "40' GP" shows as the "40' DC" it is today.
                      value={containerType(c.type) || undefined}
                      onChange={(v) => patch(i, { type: v })}
                      options={CONTAINER_TYPE_OPTIONS}
                    />
                  </td>
                  {teu}
                  <td className={LINE_TD_CLASS}>
                    <InputNumber
                      size="small"
                      className={`!w-full ${WEIGHT_FIELD_CLASS[weightCheck?.level ?? "standard"]}`}
                      aria-label="Cargo weight per container in kg"
                      min={0}
                      parser={moneyInputParser}
                      value={c.weight}
                      placeholder="Cargo"
                      onChange={(v) => patch(i, { weight: v ?? undefined })}
                    />
                  </td>
                  {note}
                  {menu(false)}
                </tr>
              );
            })}
          </tbody>
        </LineTable>
      )}
      <ConfirmModal
        open={!!asked}
        danger
        title="Delete container line?"
        description={asked ? `The line ${containerLineName(asked)} will be removed from the quote.` : ""}
        confirmLabel="Delete"
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting !== null) remove(deleting);
          setDeleting(null);
        }}
      />
    </LineBlock>
  );
}

/** The packages of a quote of loose cargo (and those a full-container quote still has). */
export function QuotePackageLines({ lines, onChange, readOnly }: LinesProps<PackageLine>) {
  const { keys, open, deleting, setDeleting, patch, add, copy, remove } = useLines("quote-packages", lines, onChange);
  const asked = deleting !== null ? lines[deleting] : undefined;

  return (
    <LineBlock
      title="Packages"
      actions={
        <MiniButton icon={<PlusOutlined />} onClick={() => add(emptyPackage)}>
          Add package
        </MiniButton>
      }
    >
      {lines.length === 0 ? (
        <LineBlockEmpty>No packages yet.</LineBlockEmpty>
      ) : (
        <LineTable minWidthClass="min-w-[700px]">
          <colgroup>
            <col className="w-[76px]" />
            <col />
            <col className="w-[84px]" />
            <col className="w-[84px]" />
            <col className="w-[84px]" />
            <col className="w-[92px]" />
            <col className="w-[144px]" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={LINE_TH_CLASS}>Qty</th>
              <th scope="col" className={LINE_TH_CLASS}>Packing</th>
              <th scope="col" className={LINE_TH_CLASS}>L (cm)</th>
              <th scope="col" className={LINE_TH_CLASS}>W (cm)</th>
              <th scope="col" className={LINE_TH_CLASS}>H (cm)</th>
              <th scope="col" className={LINE_TH_CLASS}>Kg/each</th>
              <th scope="col" className={LINE_TH_CLASS}>Cargo Stackability</th>
              <th scope="col" aria-label="Package line actions" className={LINE_TH_CLASS} />
            </tr>
          </thead>
          <tbody>
            {lines.map((p, i) => {
              const menu = (locked: boolean) => (
                <MenuCell>
                  <RowMenu label={`Package line ${i + 1} actions`} locked={locked} readOnly={readOnly} onEdit={() => open.open(i)} onCopy={() => copy(i)} onDelete={() => setDeleting(i)} />
                </MenuCell>
              );
              if (readOnly || !open.isOpen(i)) {
                return (
                  <tr key={keys[i]} className={readOnly ? undefined : READ_ROW} title={readOnly ? undefined : "Double-click to edit"} onDoubleClick={readOnly ? undefined : () => open.open(i)}>
                    <td className={`${LINE_TD_CLASS} tabular-nums`}>{figure(p.qty)}</td>
                    <td className={`${LINE_TD_CLASS} truncate`}>{p.type || EMPTY_CELL}</td>
                    <td className={`${LINE_TD_CLASS} tabular-nums`}>{figure(p.length)}</td>
                    <td className={`${LINE_TD_CLASS} tabular-nums`}>{figure(p.width)}</td>
                    <td className={`${LINE_TD_CLASS} tabular-nums`}>{figure(p.height)}</td>
                    <td className={`${LINE_TD_CLASS} tabular-nums`}>{figure(p.weight)}</td>
                    <td className={LINE_TD_CLASS}>{p.stackable !== false ? "Stackable" : "Not stackable"}</td>
                    {menu(true)}
                  </tr>
                );
              }
              return (
                <tr key={keys[i]} data-edit-row="quote-packages" onBlur={open.onRowBlur(i)} onKeyDown={open.onRowKeyDown(i)}>
                  {/* Width needs "!": antd's own input-number width is unlayered CSS and would win over a plain utility. */}
                  <td className={LINE_TD_CLASS}>
                    <InputNumber size="small" className="!w-full" aria-label="Quantity" min={1} precision={0} parser={moneyInputParser} value={p.qty} onChange={(v) => patch(i, { qty: v ?? 1 })} />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <Select
                      size="small"
                      className="w-full"
                      aria-label="Packing"
                      value={p.type}
                      onChange={(v) => patch(i, { type: v })}
                      options={PACKING_TYPES.map((t) => ({ value: t, label: t }))}
                    />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <InputNumber size="small" className="!w-full" aria-label="Length in cm" min={0} parser={moneyInputParser} value={p.length} onChange={(v) => patch(i, { length: v ?? undefined })} />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <InputNumber size="small" className="!w-full" aria-label="Width in cm" min={0} parser={moneyInputParser} value={p.width} onChange={(v) => patch(i, { width: v ?? undefined })} />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <InputNumber size="small" className="!w-full" aria-label="Height in cm" min={0} parser={moneyInputParser} value={p.height} onChange={(v) => patch(i, { height: v ?? undefined })} />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <InputNumber size="small" className="!w-full" aria-label="Weight per piece in kg" min={0} parser={moneyInputParser} value={p.weight} onChange={(v) => patch(i, { weight: v ?? undefined })} />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <Checkbox aria-label="Stackable" checked={p.stackable !== false} onChange={(e) => patch(i, { stackable: e.target.checked })} />
                  </td>
                  {menu(false)}
                </tr>
              );
            })}
          </tbody>
        </LineTable>
      )}
      <ConfirmModal
        open={!!asked}
        danger
        title="Delete package line?"
        description={asked ? `The line ${packageLineName(asked)} will be removed from the quote.` : ""}
        confirmLabel="Delete"
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting !== null) remove(deleting);
          setDeleting(null);
        }}
      />
    </LineBlock>
  );
}
