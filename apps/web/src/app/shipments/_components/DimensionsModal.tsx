"use client";

import { useEffect, useRef, useState } from "react";
import { rowKey } from "@/app/shipments/_lib/rowKey";
import { Alert, Button, Input, Modal, Select, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { ShipmentItem } from "@/hooks/useShipments";
import { CheckPill } from "./CargoCheck";
import { ContainerTabs } from "./ContainerTabs";
import {
  PACK_TYPE_OPTIONS,
  STACKABLE_OPTIONS,
  checkConsistency,
  shipmentDeclaredFigures,
  cargoContainers,
  dimensionTotals,
  dimensionVolumePerPiece,
  hasAllSizes,
  lineInCm,
  lineInUnit,
  DIMENSION_UNITS,
  type DimensionUnit,
  dimensionLineIsEmpty,
  fmtFixed,
  numberInput,
  withoutTypedVolumeWhenSized,
  type CargoDimensionLine,
  type ContainerLine,
} from "@/lib/cargo";
import { CARD, EMPTY, EMPTY_STATE, HINT, ICON_BTN_GHOST, MODAL_TITLE, REF, TD as APP_TD, TD_TOTAL, TH } from "@/styles/ui";

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
// fixed column layout, the app's table heads (TH) on a slate-50 band, read-only values as plain
// text, a quiet delete icon and a slate-50 totals band. Paddings narrower than a plain table's
// ("!": the same property as in TH / TD, which Tailwind's own order would otherwise decide).
//
// The number columns are only as wide as their fields (which fit their most digits): the unit
// of a header goes on a second line, and header, field, volume and total are centred in the
// column, so they stand in one line under each other. Packages and Stackability are left-
// aligned; antd's Select text sits 11px inside the field, hence 17px on the header.
const TH_NUM = `${TH} !text-center !px-[4px]`;
const TH_TXT = `${TH} pl-[17px] pr-[6px]`;
const TD = `${APP_TD} !px-[6px] !py-1.5`;
const TD_NUM = `${APP_TD} !px-[4px] !py-1.5`;
const READ_NUM = "block text-center text-[13px] tabular-nums text-slate-500";
const TOTAL = `${TD_TOTAL} !px-[4px] text-center tabular-nums`;
// A total stays on one line; its unit sits under it, like the unit under each header.
const UNIT = "block text-[10px] font-semibold text-slate-500";
const DELETE_BTN = `${ICON_BTN_GHOST} hover:!bg-red-50 hover:!text-red-600`;

// The most digits a number field takes before the decimal point: 9999 pcs or cm, 99999 kg.
const maxDigits = (key: string) => (key === "weightPerPcKg" ? 5 : 4);
// A number field as wide as its most digits plus antd's 11px padding and border on each side
// (important: antd sets width: 100% outside Tailwind's cascade layers).
// The volume gets room for its decimals ("0.125").
const fieldWidth = (key: string) =>
  key === "volumePerPcM3" ? "!w-[calc(6ch+26px)]" : maxDigits(key) === 5 ? "!w-[calc(5ch+26px)]" : "!w-[calc(4ch+26px)]";

// Same test as Cargo Details: a line with only a pallet type or ADR data is kept.
const isEmpty = dimensionLineIsEmpty;

// Why a read-only dialog has no Save.
export const DIMENSIONS_READ_ONLY_HINT = "Only the user in Handled By or Holiday Cover, or a manager, can change its dimensions.";

/** Said in the dialog after a save refused because the lines were changed meanwhile, once it shows them as saved. */
export const LINES_RELOADED = "Cargo Details changed meanwhile: the dialog now shows the lines as saved - make your change again.";
/** The same refusal, when the saved lines could not be read again. */
export const LINES_NOT_RELOADED = "Cargo Details changed meanwhile, and the saved lines could not be read again: close the dialog and open it again.";

const emptyLine = (containerId: string | null, dimensionUnit: DimensionUnit = "cm"): CargoDimensionLine => ({
  containerId,
  pieces: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  dimensionUnit,
  weightPerPcKg: "",
  volumePerPcM3: "",
  packageType: "",
  stackable: "",
});

/**
 * The lines the dialog shows for `shipment`: its saved lines, each in its own unit (cm or inches;
 * sent back in cm, lineInCm on save) - with one container all of them on it - and, to type
 * into, an empty line for each container that has none (an untouched one is never saved).
 * Read-only, only the saved lines.
 */
export function dialogLines(shipment: ShipmentItem, readOnly: boolean): CargoDimensionLine[] {
  const ids = cargoContainers(shipment).map((c) => c.id);
  const only = ids.length === 1 ? ids[0]! : null;
  const saved = (shipment.cargoDimensions ?? []).map((l) => lineInUnit(only && l.containerId !== only ? { ...l, containerId: only } : l));
  const targets: (string | null)[] = ids.length ? ids : [null];
  const missing = readOnly ? [] : targets.filter((id) => !saved.some((l) => (l.containerId ?? null) === id));
  return [...saved, ...missing.map((id) => emptyLine(id))];
}

/**
 * Whether a save was refused because the shipment's lines are no longer those the dialog opened
 * with (the server's "Cargo Details changed meanwhile", code aborted): nothing was written.
 */
export const linesChangedMeanwhile = (err: unknown): boolean => !!err && typeof err === "object" && (err as { code?: unknown }).code === "aborted";

/**
 * One Save of the dialog: the lines sent with the lines it opened with (`expected`), so the server
 * writes them only while it still holds those - a dialog opened before a colleague's save or an
 * accepted remeasurement would else write its old lines back over theirs (Y10, as Cargo Details).
 * Refused for that, the shipment is read again: "reloaded" with it, to show its lines; "unread"
 * when it could not be read. Any other failure is thrown on (the caller has said what went wrong).
 */
export async function saveDialogLines(
  shipment: ShipmentItem,
  lines: CargoDimensionLine[],
  expected: CargoDimensionLine[],
  onSave: (shipment: ShipmentItem, lines: CargoDimensionLine[], expected: CargoDimensionLine[]) => Promise<unknown>,
  reload: ((shipment: ShipmentItem) => Promise<ShipmentItem>) | undefined,
): Promise<{ outcome: "saved" } | { outcome: "reloaded"; shipment: ShipmentItem } | { outcome: "unread" }> {
  try {
    await onSave(shipment, lines, expected);
    return { outcome: "saved" };
  } catch (err) {
    if (!linesChangedMeanwhile(err) || !reload) throw err;
    try {
      return { outcome: "reloaded", shipment: await reload(shipment) };
    } catch {
      return { outcome: "unread" };
    }
  }
}

export function DimensionsModal({
  shipment,
  onClose,
  onSave,
  reload,
  readOnly = false,
}: {
  /** The shipment whose dimensions are shown; null keeps the dialog closed. */
  shipment: ShipmentItem | null;
  /** The user may not change the shipment's details: the lines are shown, with no Save. */
  readOnly?: boolean;
  onClose: () => void;
  /** Saves the lines (empty ones already left out), held to `expected` - the lines the dialog
   * opened with (expectedCargoDimensions); the dialog closes when it resolves and stays open with
   * the lines as typed when it rejects (the caller says what went wrong) - but for a refusal
   * because the lines changed meanwhile, which the dialog answers itself (saveDialogLines). */
  onSave: (shipment: ShipmentItem, lines: CargoDimensionLine[], expected: CargoDimensionLine[]) => Promise<unknown>;
  /** Reads the shipment again, after a save refused because its lines changed meanwhile. */
  reload?: (shipment: ShipmentItem) => Promise<ShipmentItem>;
}) {
  const [lines, setLines] = useState<CargoDimensionLine[]>([]);
  const [saving, setSaving] = useState(false);
  // The saved lines the dialog shows were loaded from: every save is held to them. Taken when the
  // dialog opens, not from the row as it is at Save - a refetch meanwhile would else hide a change.
  const openedWith = useRef<CargoDimensionLine[]>([]);
  // What the dialog says after a refused save it answered itself.
  const [notice, setNotice] = useState<string | null>(null);

  // The shipment's saved containers, in their order. With one, every line belongs to it
  // (also a line typed before the container existed). On an air job none (lib/cargo
  // cargoContainers): its lines are one table, checked against the shipment's own figures, and a
  // line keeps the container it names.
  const containers: (ContainerLine & { id: string })[] = shipment ? cargoContainers(shipment) : [];
  const containerIds = containers.map((c) => c.id);

  const shipmentId = shipment?.id;
  useEffect(() => {
    if (!shipment) return;
    openedWith.current = shipment.cargoDimensions ?? [];
    setNotice(null);
    setLines(dialogLines(shipment, readOnly));
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

  // Once a line has all three sizes its typed volume goes, so it cannot come back when a size is cleared.
  const patch = (idx: number, p: Partial<CargoDimensionLine>) =>
    setLines((r) => r.map((l, j) => (j === idx ? withoutTypedVolumeWhenSized({ ...l, ...p }) : l)));
  // The last line of a tab is cleared rather than removed, so the tab keeps a line.
  const remove = (idx: number, tabSize: number) =>
    setLines((r) => (tabSize > 1 ? r.filter((_, j) => j !== idx) : r.map((l, j) => (j === idx ? emptyLine(l.containerId ?? null, l.dimensionUnit === "in" ? "in" : "cm") : l))));
  const totals = dimensionTotals(lines.filter((l) => !isEmpty(l)).map(lineInCm));

  const save = async () => {
    if (!shipment || saving || readOnly) return;
    setSaving(true);
    try {
      const done = await saveDialogLines(shipment, lines.filter((l) => !isEmpty(l)).map(lineInCm), openedWith.current, onSave, reload);
      if (done.outcome === "saved") return onClose();
      if (done.outcome === "reloaded") {
        // The lines as saved now, and the next save held to them.
        openedWith.current = done.shipment.cargoDimensions ?? [];
        setLines(dialogLines(done.shipment, readOnly));
        setActiveKey(null);
      }
      setNotice(done.outcome === "reloaded" ? LINES_RELOADED : LINES_NOT_RELOADED);
    } catch {
      // Nothing more to do here: the dialog stays open and the caller has said what went wrong.
    } finally {
      setSaving(false);
    }
  };

  const field = (
    idx: number,
    key: "pieces" | "lengthCm" | "widthCm" | "heightCm" | "weightPerPcKg" | "volumePerPcM3",
  ) =>
    readOnly ? (
      <span className={`${READ_NUM} !text-slate-700`}>{lines[idx]![key] || <span className={EMPTY}>—</span>}</span>
    ) : (
    // Numbers only, at most 4 digits (the weight 5): Pcs takes whole numbers, the measures and
    // the weight a decimal point too.
    // As wide as its most digits (fieldWidth), centred in its column under the header.
    <div className="flex justify-center">
      <Input
        className={`text-center tabular-nums ${fieldWidth(key)}`}
        inputMode={key === "pieces" ? "numeric" : "decimal"}
        aria-label={key === "volumePerPcM3" ? "Volume per piece (m³)" : undefined}
        value={lines[idx]![key] ?? ""}
        onChange={(e) =>
          patch(idx, { [key]: numberInput(e.target.value, key !== "pieces", maxDigits(key)) })
        }
      />
    </div>
    );
  // A picked value as text, in a read-only dialog.
  const readText = (value: string | null | undefined) => <span className="block truncate pl-[11px] text-[13px] text-slate-700">{value || <span className={EMPTY}>—</span>}</span>;

  // A total under the column it sums, its unit beneath.
  const total = (sum: number, decimals: number, unit: string) => (
    <td className={TOTAL}>
      <span className="whitespace-nowrap">{fmtFixed(sum, decimals)}</span>
      <span className={UNIT}>{unit}</span>
    </td>
  );
  const activeFilled = filledOf(active);
  // The chosen container against what it declares; a shipment with no container against its own
  // Pcs, Total Weight and Total Volume, as Cargo Details checks it.
  const activeDeclared = active.container ?? (containers.length === 0 && shipment ? shipmentDeclaredFigures(shipment) : null);
  const activeCheck = activeDeclared ? checkConsistency(activeDeclared, activeFilled) : null;
  const against = active.container ? "Container" : "Shipment";
  const activeSum = dimensionTotals(activeFilled);

  return (
    <Modal
      open={!!shipment}
      title={
        <span className={MODAL_TITLE}>
          Dimensions · <span className={`${REF} font-normal text-slate-500`}>{shipment?.jobNumber ?? ""}</span>
        </span>
      }
      width={1108}
      centered
      destroyOnHidden
      onCancel={onClose}
      footer={
        readOnly ? (
          <div className="-mx-6 px-6 pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
            <span className={`${HINT} text-left`}>{DIMENSIONS_READ_ONLY_HINT}</span>
            <Button onClick={onClose}>Close</Button>
          </div>
        ) : (
          <div className="-mx-6 px-6 pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={save}>
              Save
            </Button>
          </div>
        )
      }
    >
      <div className="pt-2 pb-2">
        {notice && <Alert className="!mb-3" type="warning" showIcon message={<span className="text-xs">{notice}</span>} />}
        {/* Framed like the Cargo Dimensions card of Cargo Details. */}
        <div className={`${CARD} overflow-hidden`}>
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
                    Cargo Stackability
                  </th>
                  <th scope="col" className={TH} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {readOnly && active.rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className={EMPTY_STATE}>
                      No dimension lines yet.
                    </td>
                  </tr>
                )}
                {active.rows.map(({ l, idx }) => {
                  const vpc = dimensionVolumePerPiece(lineInCm(l));
                  if (readOnly) {
                    return (
                      <tr key={rowKey(l)}>
                        <td className={TD_NUM}>{field(idx, "pieces")}</td>
                        <td className={TD}>{readText(l.packageType)}</td>
                        <td className={TD_NUM}>{field(idx, "lengthCm")}</td>
                        <td className={TD_NUM}>{field(idx, "widthCm")}</td>
                        <td className={TD_NUM}>{field(idx, "heightCm")}</td>
                        <td className={TD}>{readText(l.dimensionUnit === "in" ? "inch" : "cm")}</td>
                        <td className={TD_NUM}>{field(idx, "weightPerPcKg")}</td>
                        <td className={TD_NUM}>
                          {/* Worked out from the sizes, else as typed. */}
                          <span className={READ_NUM}>
                            {vpc ? vpc.toFixed(3) : <span className={EMPTY}>—</span>}
                          </span>
                        </td>
                        <td className={TD}>{readText(l.stackable)}</td>
                        <td className={TD} />
                      </tr>
                    );
                  }
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
                        {/* Worked out from the sizes, so shown as text; without all three it is typed. */}
                        {hasAllSizes(lineInCm(l)) ? (
                          <span className={READ_NUM}>
                            {vpc ? vpc.toFixed(3) : <span className={EMPTY}>—</span>}
                          </span>
                        ) : (
                          field(idx, "volumePerPcM3")
                        )}
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
                {!readOnly && (
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
                )}
              </tbody>
              {/* The chosen container's figures under the columns they sum. */}
              <tfoot>
                <tr className="bg-slate-50 [&>td]:border-t-2 [&>td]:border-slate-200">
                  {total(activeSum.pcs, 0, "COLLI")}
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
                <CheckPill against={against} label="Colli" m={activeCheck.pcs} decimals={0} />
                <CheckPill against={against} label="Weight" m={activeCheck.kg} decimals={activeCheck.kg.decimals} unit="kg" />
                <CheckPill against={against} label="Volume" m={activeCheck.m3} decimals={3} unit="m³" />
              </div>
            ) : (
              <span />
            )}
            {tabs.length > 1 && (
              <span className={`${HINT} tabular-nums whitespace-nowrap`}>
                All containers <span className="font-semibold text-slate-900">{fmtFixed(totals.pcs, 0)} colli</span> ·{" "}
                <span className="font-semibold text-slate-900">{fmtFixed(totals.kg, 2)} kg</span> ·{" "}
                <span className="font-semibold text-slate-900">{fmtFixed(totals.m3, 3)} m³</span>
              </span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
