"use client";

import { useState, useMemo } from "react";
import { Modal, Button } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";

interface DimensionRow {
  colli: string;
  length: string;
  width: string;
  height: string;
  weightPerPiece: string;
  volumePerPiece: string;
}

interface DimensionsPopupProps {
  shipment: ShipmentItem;
  open: boolean;
  onClose: () => void;
  onSave: (dimensions: DimensionRow[] | null) => void;
}

const EMPTY_ROW: DimensionRow = { colli: "", length: "", width: "", height: "", weightPerPiece: "", volumePerPiece: "" };

export const DimensionsPopup = ({ shipment, open, onClose, onSave }: DimensionsPopupProps) => {
  const initial = useMemo(() => {
    const dims = shipment.dimensions;
    if (!dims) return [{ ...EMPTY_ROW }];
    const arr: DimensionRow[] = Array.isArray(dims) ? dims : (() => { try { return JSON.parse(String(dims)); } catch { return []; } })();
    return arr.length > 0 ? arr : [{ ...EMPTY_ROW }];
  }, [shipment]);

  const [rows, setRows] = useState<DimensionRow[]>(initial);

  const updateRow = (idx: number, field: keyof DimensionRow, value: string) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  const deleteRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  // Computed totals
  const totals = useMemo(() => {
    let totalColli = 0, totalWeightKg = 0, totalVolumeCbm = 0;
    for (const r of rows) {
      const colli = parseFloat(r.colli) || 0;
      const L = parseFloat(r.length) || 0;
      const W = parseFloat(r.width) || 0;
      const H = parseFloat(r.height) || 0;
      const wPiece = parseFloat(r.weightPerPiece) || 0;
      const vPiece = r.volumePerPiece ? parseFloat(r.volumePerPiece) : (L * W * H) / 1_000_000;
      totalColli += colli;
      totalWeightKg += colli * wPiece;
      totalVolumeCbm += colli * (isNaN(vPiece) ? 0 : vPiece);
    }
    return { totalColli, totalWeightKg, totalVolumeCbm };
  }, [rows]);

  const handleSave = () => {
    const filtered = rows.filter((r) => r.colli || r.length || r.width || r.height || r.weightPerPiece);
    onSave(filtered.length > 0 ? filtered : null);
  };

  return (
    <Modal
      title={`Dimensions — ${shipment.jobNumber}`}
      open={open}
      onCancel={onClose}
      width={700}
      footer={
        <div className="flex justify-between">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" onClick={handleSave}>Save</Button>
        </div>
      }
      destroyOnClose
    >
      <div className="space-y-3">
        {/* Table */}
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="text-left px-2 py-1">Qty</th>
              <th className="text-left px-2 py-1">L (cm)</th>
              <th className="text-left px-2 py-1">W (cm)</th>
              <th className="text-left px-2 py-1">H (cm)</th>
              <th className="text-left px-2 py-1">Weight/pc (kg)</th>
              <th className="text-left px-2 py-1">Vol/pc (CBM)</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-gray-100">
                {(["colli", "length", "width", "height", "weightPerPiece", "volumePerPiece"] as const).map((field) => (
                  <td key={field} className="px-1 py-1">
                    <input
                      type="text"
                      value={row[field]}
                      onChange={(e) => updateRow(idx, field, e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-transparent border border-gray-200 rounded focus:border-teal-500 focus:outline-none"
                      placeholder="0"
                    />
                  </td>
                ))}
                <td className="px-1">
                  {rows.length > 1 && (
                    <button
                      onClick={() => deleteRow(idx)}
                      className="text-gray-300 hover:text-red-500"
                    >
                      <DeleteOutlined style={{ fontSize: 11 }} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Button size="small" icon={<PlusOutlined />} onClick={addRow}>Add Row</Button>

        {/* Totals */}
        <div className="flex gap-6 pt-2 border-t border-gray-200">
          <div>
            <span className="text-[10px] text-gray-500 uppercase">Total Colli</span>
            <p className="text-sm font-semibold">{totals.totalColli || "—"}</p>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 uppercase">Total Weight</span>
            <p className="text-sm font-semibold">{totals.totalWeightKg > 0 ? `${totals.totalWeightKg.toFixed(1)} kg` : "—"}</p>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 uppercase">Total Volume</span>
            <p className="text-sm font-semibold">{totals.totalVolumeCbm > 0 ? `${totals.totalVolumeCbm.toFixed(3)} CBM` : "—"}</p>
          </div>
        </div>
      </div>
    </Modal>
  );
};
