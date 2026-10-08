"use client";

import { useEffect, useState } from "react";
import { Button, Input, Modal, Select } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { ShipmentItem } from "@/hooks/useShipments";
import { PACK_TYPES, STACKABLE_OPTIONS, dimensionTotals, dimensionVolumePerPiece, fmtFixed, type CargoDimensionLine } from "@/lib/cargo";

// The Dimensions cell of a grid opens this: the shipment's dimension lines in a table that
// works like the Cargo Dimensions card of Cargo Details (same columns, same lines), but
// edited as a whole — nothing is written until Save.

const COLS = "grid grid-cols-[0.7fr_0.8fr_0.8fr_0.8fr_1fr_1fr_1.1fr_1.2fr_32px] gap-3 items-center";
const CENTERED_SELECT = "w-full [&_.ant-select-selection-item]:!text-center [&_.ant-select-selection-placeholder]:!text-center";

const isEmpty = (l: CargoDimensionLine) =>
  !l.pieces && !l.lengthCm && !l.widthCm && !l.heightCm && !l.weightPerPcKg && !l.packageType && !l.stackable;

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

  const patch = (idx: number, p: Partial<CargoDimensionLine>) => setLines((r) => r.map((l, j) => (j === idx ? { ...l, ...p } : l)));
  const remove = (idx: number) => setLines((r) => (r.length > 1 ? r.filter((_, j) => j !== idx) : [emptyLine()]));
  const totals = dimensionTotals(lines);

  const save = async () => {
    if (!shipment || saving) return;
    setSaving(true);
    try {
      await onSave(shipment, lines.filter((l) => !isEmpty(l)));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const field = (idx: number, key: "pieces" | "lengthCm" | "widthCm" | "heightCm" | "weightPerPcKg") => (
    <Input size="small" className="text-center" inputMode="decimal" value={lines[idx]![key]} onChange={(e) => patch(idx, { [key]: e.target.value })} />
  );

  return (
    <Modal
      open={!!shipment}
      title={`Dimensions — ${shipment?.jobNumber ?? ""}`}
      width={980}
      centered
      destroyOnHidden
      onCancel={onClose}
      footer={
        <div className="flex items-center justify-between">
          <Button icon={<PlusOutlined />} onClick={() => setLines((r) => [...r, emptyLine(r[r.length - 1])])}>
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
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          <div className={`${COLS} px-1 pb-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200`}>
            <span className="text-center truncate">Pcs</span>
            <span className="text-center truncate">Length (cm)</span>
            <span className="text-center truncate">Width (cm)</span>
            <span className="text-center truncate">Height (cm)</span>
            <span className="text-center truncate">Weight / pc (kg)</span>
            <span className="text-center truncate">Volume / pc (m³)</span>
            <span className="text-center truncate">Packages</span>
            <span className="text-center truncate">Stackable</span>
            <span />
          </div>

          {lines.map((l, idx) => {
            const vpc = dimensionVolumePerPiece(l);
            return (
              <div key={idx} className={`${COLS} px-1 py-1 border-b border-slate-100`}>
                {field(idx, "pieces")}
                {field(idx, "lengthCm")}
                {field(idx, "widthCm")}
                {field(idx, "heightCm")}
                {field(idx, "weightPerPcKg")}
                <Input size="small" className="text-center !bg-slate-50 !text-slate-500" readOnly tabIndex={-1} value={vpc ? vpc.toFixed(3) : ""} />
                <Select
                  size="small"
                  className={CENTERED_SELECT}
                  value={l.packageType || undefined}
                  allowClear
                  placeholder={"—"}
                  options={PACK_TYPES.map((p) => ({ value: p }))}
                  onChange={(v) => patch(idx, { packageType: v ?? "" })}
                />
                <Select
                  size="small"
                  className={CENTERED_SELECT}
                  value={l.stackable || undefined}
                  allowClear
                  placeholder={"—"}
                  options={STACKABLE_OPTIONS.map((s) => ({ value: s }))}
                  onChange={(v) => patch(idx, { stackable: v ?? "" })}
                />
                <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Delete row" onClick={() => remove(idx)} />
              </div>
            );
          })}

          {/* Each figure sits under the column it sums. */}
          <div className={`${COLS} px-1 pt-2.5 mt-1 border-t border-slate-200 text-[11px] font-bold text-slate-700`}>
            <span className="text-center tabular-nums">{fmtFixed(totals.pcs, 0)} PCS</span>
            <span />
            <span />
            <span />
            <span className="text-center tabular-nums">{fmtFixed(totals.kg, 2)} KG</span>
            <span className="text-center tabular-nums">{fmtFixed(totals.m3, 3)} M³</span>
            <span className="col-span-3" />
          </div>
        </div>
      </div>
    </Modal>
  );
}
