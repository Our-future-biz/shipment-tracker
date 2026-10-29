"use client";

import { useEffect, useState } from "react";
import { rowKey } from "@/app/shipments/_lib/rowKey";
import { Button, Input, Modal, Select, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { ShipmentItem } from "@/hooks/useShipments";
import { CheckPill } from "./CargoCheck";
import { ContainerTabs } from "./ContainerTabs";
import {
  PACK_TYPE_OPTIONS,
  STACKABLE_OPTIONS,
  checkConsistency,
  dimensionTotals,
  dimensionVolumePerPiece,
  lineInCm,
  lineInUnit,
  DIMENSION_UNITS,
  type DimensionUnit,
  dimensionLineIsEmpty,
  fmtFixed,
  numberInput,
  type CargoDimensionLine,
  type ContainerLine,
} from "@/lib/cargo";

// The Dimensions cell of a grid opens this: the shipment's dimension lines in a table that
// works like the Cargo Dimensions card of Cargo Details (same columns, same lines), but
// edited as a whole — nothing is written until Save.
//
// With one or more containers a row of container tabs sits above the table (number, type, a
// dot for whether its lines add up to what it declares); the table shows the lines of
// the chosen container, and a line belongs to the tab it is typed in, so no container is
// ever picked per line. The totals compare the chosen container with what it declares;
// with two or more, a line under them adds up all containers. Without containers there are
// no tabs.

// Looks like the app's other line tables (Quote LineTable, Costs tab): a framed table with a
// fixed column layout, 11px uppercase headers on a slate-50 band, read-only values as plain
// text, a quiet delete icon and a slate-50 totals band.
//
// The number columns are only as wide as their fields (which fit their most digits): the unit
// of a header goes on a second line, and header, field, volume and total are centred in the
// column, so they stand in one line under each other. Packages and Stackability are left-
// aligned; antd's Select text sits 11px inside the field, hence 17px on the header.
const TH =
  "py-2 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wide leading-tight align-bottom";
const TH_NUM = `${TH} text-center px-[4px]`;
const TH_TXT = `${TH} text-left pl-[17px] pr-[6px] whitespace-nowrap`;
const TD = "px-[6px] py-1.5 border-b border-slate-100 align-middle";
const TD_NUM = "px-[4px] py-1.5 border-b border-slate-100 align-middle";
const READ_NUM = "block text-center text-[13px] tabular-nums text-slate-500";
const TOTAL = "py-2 px-[4px] text-center text-[13px] font-bold tabular-nums text-slate-900";
// A total stays on one line; its unit sits under it, like the unit under each header.
const UNIT = "block text-[11px] font-semibold text-slate-500";
const DELETE_BTN =
  "w-[26px] h-[26px] rounded-md inline-grid place-items-center text-slate-400 hover:bg-danger-soft hover:text-danger " +
  "border-0 bg-transparent cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500";

// The most digits a number field takes before the decimal point: 9999 pcs or cm, 99999 kg.
const maxDigits = (key: string) => (key === "weightPerPcKg" ? 5 : 4);
// A number field as wide as its most digits plus antd's 11px padding and border on each side
// (important: antd sets width: 100% outside Tailwind's cascade layers).
const fieldWidth = (key: string) => (maxDigits(key) === 5 ? "!w-[calc(5ch+26px)]" : "!w-[calc(4ch+26px)]");

// Same test as Cargo Details: a line with only a pallet type or ADR data is kept.
const isEmpty = dimensionLineIsEmpty;

export function DimensionsModal({
  shipment,
  onClose,
  onSave,
}: {
  /** The shipment whose dimensions are shown; null keeps the dialog closed. */
  shipment: ShipmentItem | null;
  onClose: () => void;
  /** Saves the lines (empty ones already left out); the dialog closes when it resolves and
   * stays open with the lines as typed when it rejects (the caller says what went wrong). */
  onSave: (shipment: ShipmentItem, lines: CargoDimensionLine[]) => Promise<unknown>;
}) {
  const [lines, setLines] = useState<CargoDimensionLine[]>([]);
  const [saving, setSaving] = useState(false);

  // The shipment's saved containers, in their order. With one, every line belongs to it
  // (also a line typed before the container existed).
  const containers = (shipment?.containers ?? []).filter((c): c is ContainerLine & { id: string } => !!c.id);
  const containerIds = containers.map((c) => c.id);
  const only = containers.length === 1 ? containers[0]!.id : null;

  const emptyLine = (containerId: string | null, dimensionUnit: DimensionUnit = "cm"): CargoDimensionLine => ({
    containerId,
    pieces: "",
    lengthCm: "",
    widthCm: "",
    heightCm: "",
    dimensionUnit,
    weightPerPcKg: "",
    packageType: "",
    stackable: "",
  });

  const shipmentId = shipment?.id;
  useEffect(() => {
    if (!shipment) return;
    // Each line in its own unit (cm or inches); sent back in cm (lineInCm on save).
    const saved = (shipment.cargoDimensions ?? []).map((l) => lineInUnit(only && l.containerId !== only ? { ...l, containerId: only } : l));
    // Every container gets a line to type into (an untouched one is never saved).
    const targets: (string | null)[] = containerIds.length ? containerIds : [null];
    const missing = targets.filter((id) => !saved.some((l) => (l.containerId ?? null) === id));
    setLines([...saved, ...missing.map((id) => emptyLine(id))]);
    // Only when another shipment is opened: a refetch must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId]);

  // One tab per container, in their order; lines of no (or a removed) container get a tab
  // of their own - only when there are any, or when the shipment has no containers.
  const groupOf = (l: CargoDimensionLine) => (l.containerId && containerIds.includes(l.containerId) ? l.containerId : null);
  const indexed = lines.map((l, idx) => ({ l, idx }));
  const loose = indexed.filter(({ l }) => groupOf(l) === null);
  const tabs = [
    ...containers.map((c, i) => ({ key: c.id, container: c, label: c.containerNumber || `Container #${i + 1}`, rows: indexed.filter(({ l }) => groupOf(l) === c.id) })),
    ...(containers.length === 0 || loose.length > 0 ? [{ key: "none", container: null, label: "No container", rows: loose }] : []),
  ];
  const [activeKey, setActiveKey] = useState<string | null>(null);
  useEffect(() => setActiveKey(null), [shipmentId]);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0]!;
  // A tab's filled lines in cm, for its totals and the check against the container.
  const filledOf = (t: (typeof tabs)[number]) => t.rows.map(({ l }) => l).filter((l) => !isEmpty(l)).map(lineInCm);

  const patch = (idx: number, p: Partial<CargoDimensionLine>) =>
    setLines((r) => r.map((l, j) => (j === idx ? { ...l, ...p } : l)));
  // The last line of a tab is cleared rather than removed, so the tab keeps a line.
  const remove = (idx: number, tabSize: number) =>
    setLines((r) => (tabSize > 1 ? r.filter((_, j) => j !== idx) : r.map((l, j) => (j === idx ? emptyLine(l.containerId ?? null, l.dimensionUnit === "in" ? "in" : "cm") : l))));
  const totals = dimensionTotals(lines.filter((l) => !isEmpty(l)).map(lineInCm));

  const save = async () => {
    if (!shipment || saving) return;
    setSaving(true);
    try {
      await onSave(shipment, lines.filter((l) => !isEmpty(l)).map(lineInCm));
      onClose();
    } catch {
      // Nothing more to do here: the dialog stays open and the caller has said what went wrong.
    } finally {
      setSaving(false);
    }
  };

  const field = (
    idx: number,
    key: "pieces" | "lengthCm" | "widthCm" | "heightCm" | "weightPerPcKg",
  ) => (
    // Numbers only, at most 4 digits (the weight 5): Pcs takes whole numbers, the measures and
    // the weight a decimal point too.
    // As wide as its most digits (fieldWidth), centred in its column under the header.
    <div className="flex justify-center">
      <Input
        className={`text-center tabular-nums ${fieldWidth(key)}`}
        inputMode={key === "pieces" ? "numeric" : "decimal"}
        value={lines[idx]![key]}
        onChange={(e) =>
          patch(idx, { [key]: numberInput(e.target.value, key !== "pieces", maxDigits(key)) })
        }
      />
    </div>
  );

  // A total under the column it sums, its unit beneath.
  const total = (sum: number, decimals: number, unit: string) => (
    <td className={TOTAL}>
      <span className="whitespace-nowrap">{fmtFixed(sum, decimals)}</span>
      <span className={UNIT}>{unit}</span>
    </td>
  );
  const activeFilled = filledOf(active);
  const activeCheck = active.container ? checkConsistency(active.container, activeFilled) : null;
  const activeSum = dimensionTotals(activeFilled);

  return (
    <Modal
      open={!!shipment}
      title={
        <span className="text-sm">
          Dimensions · <span className="font-mono text-slate-500">{shipment?.jobNumber ?? ""}</span>
        </span>
      }
      width={1108}
      centered
      destroyOnHidden
      onCancel={onClose}
      footer={
        <div className="-mx-6 px-6 pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="pt-2 pb-2">
        {/* Framed like the Cargo Dimensions card of Cargo Details. */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          {containers.length > 0 && (
            // The containers as tabs on the card's top edge (also a single one, so the dialog
            // always says whose lines these are). A container's dot shows once it has lines.
            <ContainerTabs
              className="px-2"
              activeKey={active.key}
              onChange={setActiveKey}
              tabs={tabs.map((t) => {
                const filled = filledOf(t);
                return {
                  key: t.key,
                  label: t.label,
                  type: t.container?.type,
                  isContainer: !!t.container,
                  matched: t.container && filled.length ? checkConsistency(t.container, filled).matched : null,
                };
              })}
            />
          )}
          <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
            {/* Every column just fits its content: at 1108px Stackability gets about 258px, enough for "Not stackable / Not overstowable". */}
            <table className="w-full min-w-[1058px] table-fixed border-collapse [&_tbody>tr:last-child>td]:border-b-0">
              <colgroup>
                <col className="w-[72px]" />
                <col className="w-[144px]" />
                <col className="w-[76px]" />
                <col className="w-[76px]" />
                <col className="w-[76px]" />
                <col className="w-[92px]" />
                <col className="w-[112px]" />
                <col className="w-[112px]" />
                <col />
                <col className="w-[40px]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50">
                  <th scope="col" className={TH_NUM}>
                    Pcs
                  </th>
                  <th scope="col" className={TH_TXT}>
                    Packages
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Length
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Width
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Height
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Unit
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Weight / pc <br />
                    (kg)
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Volume / pc <br />
                    (m³)
                  </th>
                  <th scope="col" className={TH_TXT}>
                    Stackability
                  </th>
                  <th scope="col" className={TH} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {active.rows.map(({ l, idx }) => {
                  const vpc = dimensionVolumePerPiece(lineInCm(l));
                  return (
                    <tr key={rowKey(l)} className="hover:bg-slate-50/60">
                      <td className={TD_NUM}>{field(idx, "pieces")}</td>
                      <td className={TD}>
                        <Select
                          className="w-full"
                          value={l.packageType || undefined}
                          allowClear
                          placeholder="—"
                          options={PACK_TYPE_OPTIONS}
                          onChange={(v) => patch(idx, { packageType: v ?? "" })}
                        />
                      </td>
                      <td className={TD_NUM}>{field(idx, "lengthCm")}</td>
                      <td className={TD_NUM}>{field(idx, "widthCm")}</td>
                      <td className={TD_NUM}>{field(idx, "heightCm")}</td>
                      <td className={TD}>
                        {/* The unit of the three sizes: the numbers stay as typed, only their unit changes. */}
                        <Select
                          className="w-full"
                          aria-label="Size unit"
                          value={l.dimensionUnit === "in" ? "in" : "cm"}
                          options={DIMENSION_UNITS}
                          onChange={(v: DimensionUnit) => patch(idx, { dimensionUnit: v })}
                        />
                      </td>
                      <td className={TD_NUM}>{field(idx, "weightPerPcKg")}</td>
                      <td className={TD_NUM}>
                        {/* Computed, so shown as text rather than a read-only field. */}
                        <span className={READ_NUM}>
                          {vpc ? vpc.toFixed(3) : <span className="text-slate-300">—</span>}
                        </span>
                      </td>
                      <td className={TD}>
                        <Select
                          className="w-full"
                          value={l.stackable || undefined}
                          allowClear
                          placeholder="—"
                          popupMatchSelectWidth={false}
                          options={STACKABLE_OPTIONS.map((s) => ({ value: s }))}
                          onChange={(v) => patch(idx, { stackable: v ?? "" })}
                        />
                      </td>
                      <td className={`${TD} text-center`}>
                        <Tooltip title="Delete row">
                          <button
                            type="button"
                            aria-label="Delete row"
                            className={DELETE_BTN}
                            onClick={() => remove(idx, active.rows.length)}
                          >
                            <DeleteOutlined />
                          </button>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={10} className="px-2 py-1.5 border-b border-slate-100">
                    <Button
                      type="link"
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() =>
                        // A new line takes the unit of the tab's last line.
                        setLines((r) => [...r, emptyLine(active.container?.id ?? null, active.rows[active.rows.length - 1]?.l.dimensionUnit === "in" ? "in" : "cm")])
                      }
                    >
                      Add row
                    </Button>
                  </td>
                </tr>
              </tbody>
              {/* The chosen container's figures under the columns they sum. */}
              <tfoot>
                <tr className="bg-slate-50 [&>td]:border-t [&>td]:border-slate-200">
                  {total(activeSum.pcs, 0, "PCS")}
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                  {total(activeSum.kg, 2, "KG")}
                  {total(activeSum.m3, 3, "M³")}
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        {(activeCheck || tabs.length > 1) && (
          // Under the card: the chosen container against what it declares, and with two or
          // more containers what all of them add up to.
          <div className="mt-3 flex items-center justify-between gap-4 flex-wrap">
            {activeCheck ? (
              <div className="flex items-center gap-2 flex-wrap">
                <CheckPill label="Pcs" m={activeCheck.pcs} decimals={0} />
                <CheckPill label="Weight" m={activeCheck.kg} decimals={2} unit="kg" />
                <CheckPill label="Volume" m={activeCheck.m3} decimals={3} unit="m³" />
              </div>
            ) : (
              <span />
            )}
            {tabs.length > 1 && (
              <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
                All containers <span className="font-semibold text-slate-700">{fmtFixed(totals.pcs, 0)} pcs</span> ·{" "}
                <span className="font-semibold text-slate-700">{fmtFixed(totals.kg, 2)} kg</span> ·{" "}
                <span className="font-semibold text-slate-700">{fmtFixed(totals.m3, 3)} m³</span>
              </span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
