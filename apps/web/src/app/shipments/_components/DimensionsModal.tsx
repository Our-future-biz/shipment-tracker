"use client";

import { useEffect, useState } from "react";
import { rowKey } from "@/app/shipments/_lib/rowKey";
import { Button, Input, Modal, Select, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { ShipmentItem } from "@/hooks/useShipments";
import {
  PACK_TYPES,
  STACKABLE_OPTIONS,
  dimensionTotals,
  dimensionVolumePerPiece,
  fmtFixed,
  numberInput,
  type CargoDimensionLine,
} from "@/lib/cargo";

// The Dimensions cell of a grid opens this: the shipment's dimension lines in a table that
// works like the Cargo Dimensions card of Cargo Details (same columns, same lines), but
// edited as a whole — nothing is written until Save.

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

const isEmpty = (l: CargoDimensionLine) =>
  !l.pieces &&
  !l.lengthCm &&
  !l.widthCm &&
  !l.heightCm &&
  !l.weightPerPcKg &&
  !l.packageType &&
  !l.stackable;

export function DimensionsModal({
  shipment,
  onClose,
  onSave,
}: {
  /** The shipment whose dimensions are shown; null keeps the dialog closed. */
  shipment: ShipmentItem | null;
  onClose: () => void;
  /** Saves the lines (empty ones already left out); the dialog closes when it resolves. */
  onSave: (shipment: ShipmentItem, lines: CargoDimensionLine[]) => Promise<unknown>;
}) {
  const [lines, setLines] = useState<CargoDimensionLine[]>([]);
  const [saving, setSaving] = useState(false);

  // A new line goes to the container of the line above it, else to the shipment's first
  // container, else to the shipment itself (LCL / air) — where Cargo Details would list it.
  const emptyLine = (after?: CargoDimensionLine): CargoDimensionLine => ({
    containerId: after?.containerId ?? shipment?.containers?.find((c) => c.id)?.id ?? null,
    pieces: "",
    lengthCm: "",
    widthCm: "",
    heightCm: "",
    weightPerPcKg: "",
    packageType: "",
    stackable: "",
  });

  const shipmentId = shipment?.id;
  useEffect(() => {
    if (!shipment) return;
    const saved = shipment.cargoDimensions ?? [];
    setLines(saved.length ? saved : [emptyLine()]);
    // Only when another shipment is opened: a refetch must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId]);

  const patch = (idx: number, p: Partial<CargoDimensionLine>) =>
    setLines((r) => r.map((l, j) => (j === idx ? { ...l, ...p } : l)));
  const remove = (idx: number) =>
    setLines((r) => (r.length > 1 ? r.filter((_, j) => j !== idx) : [emptyLine()]));
  const totals = dimensionTotals(lines);

  const save = async () => {
    if (!shipment || saving) return;
    setSaving(true);
    try {
      await onSave(
        shipment,
        lines.filter((l) => !isEmpty(l)),
      );
      onClose();
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
    // As wide as its most digits (plus antd's 11px padding and border on each side), centred
    // in its column under the header.
    <div className="flex justify-center">
      <Input
        className="text-center tabular-nums"
        style={{ width: `calc(${maxDigits(key)}ch + 26px)` }}
        inputMode={key === "pieces" ? "numeric" : "decimal"}
        value={lines[idx]![key]}
        onChange={(e) =>
          patch(idx, { [key]: numberInput(e.target.value, key !== "pieces", maxDigits(key)) })
        }
      />
    </div>
  );

  return (
    <Modal
      open={!!shipment}
      title={
        <span className="text-sm">
          Dimensions · <span className="font-mono text-slate-500">{shipment?.jobNumber ?? ""}</span>
        </span>
      }
      width={1016}
      centered
      destroyOnHidden
      onCancel={onClose}
      footer={
        <div className="-mx-6 px-6 pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
          <Button
            icon={<PlusOutlined />}
            onClick={() => setLines((r) => [...r, emptyLine(r[r.length - 1])])}
          >
            Add row
          </Button>
          <div className="flex items-center gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="pt-2 pb-2">
        {/* Framed like the Cargo Dimensions card of Cargo Details. */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            {/* Every column just fits its content: at 1016px Stackability gets about 258px, enough for "Not stackable / Not overstowable". */}
            <table className="w-full min-w-[966px] table-fixed border-collapse [&_tbody>tr:last-child>td]:border-b-0">
              <colgroup>
                <col className="w-[72px]" />
                <col className="w-[76px]" />
                <col className="w-[76px]" />
                <col className="w-[76px]" />
                <col className="w-[112px]" />
                <col className="w-[112px]" />
                <col className="w-[144px]" />
                <col />
                <col className="w-[40px]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50">
                  <th scope="col" className={TH_NUM}>
                    Pcs
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Length <br />
                    (cm)
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Width <br />
                    (cm)
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Height <br />
                    (cm)
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
                    Packages
                  </th>
                  <th scope="col" className={TH_TXT}>
                    Stackability
                  </th>
                  <th scope="col" className={TH} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const vpc = dimensionVolumePerPiece(l);
                  return (
                    <tr key={rowKey(l)} className="hover:bg-slate-50/60">
                      <td className={TD_NUM}>{field(idx, "pieces")}</td>
                      <td className={TD_NUM}>{field(idx, "lengthCm")}</td>
                      <td className={TD_NUM}>{field(idx, "widthCm")}</td>
                      <td className={TD_NUM}>{field(idx, "heightCm")}</td>
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
                          value={l.packageType || undefined}
                          allowClear
                          placeholder="—"
                          options={PACK_TYPES.map((p) => ({ value: p }))}
                          onChange={(v) => patch(idx, { packageType: v ?? "" })}
                        />
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
                            onClick={() => remove(idx)}
                          >
                            <DeleteOutlined />
                          </button>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Each figure sits under the column it sums. */}
              <tfoot>
                <tr className="bg-slate-50 [&>td]:border-t [&>td]:border-slate-200">
                  <td className={TOTAL}>
                    <span className="whitespace-nowrap">{fmtFixed(totals.pcs, 0)}</span>
                    <span className={UNIT}>PCS</span>
                  </td>
                  <td />
                  <td />
                  <td />
                  <td className={TOTAL}>
                    <span className="whitespace-nowrap">{fmtFixed(totals.kg, 2)}</span>
                    <span className={UNIT}>KG</span>
                  </td>
                  <td className={TOTAL}>
                    <span className="whitespace-nowrap">{fmtFixed(totals.m3, 3)}</span>
                    <span className={UNIT}>M³</span>
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}
