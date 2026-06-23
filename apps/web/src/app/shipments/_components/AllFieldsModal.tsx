"use client";

import { Modal } from "antd";
import { COLUMNS } from "@/lib/columnConfig";
import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";

export function AllFieldsModal({
  shipment,
  open,
  onClose,
}: {
  shipment: ShipmentItem;
  open: boolean;
  onClose: () => void;
}) {
  const fields = COLUMNS.filter((col) => col.type !== "popup")
    .map((col) => ({ label: col.title, value: getFieldValue(shipment, col.key) }))
    .filter((f) => f.value && f.value.trim() !== "");

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      title={
        <span className="text-sm">
          All fields · <span className="font-mono text-slate-500">{shipment.jobNumber ?? shipment.id}</span>
        </span>
      }
    >
      <div className="grid grid-cols-3 gap-x-6 gap-y-3 max-h-[70vh] overflow-y-auto pr-1">
        {fields.length === 0 && <div className="text-xs text-slate-400">No fields set.</div>}
        {fields.map((f) => (
          <div key={f.label}>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{f.label}</div>
            <div className="text-xs text-slate-700 break-words">{f.value}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
