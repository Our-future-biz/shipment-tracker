"use client";

import { useState } from "react";
import { Popconfirm } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { SpreadsheetCell } from "./SpreadsheetCell";
import type { ColumnDef } from "@/lib/columnConfig";
import type { interfaces } from "@/lib/api/client";

type ShipmentItem = interfaces.ShipmentItem;

const getFieldValue = (shipment: ShipmentItem, key: string): string => {
  return String(Object.getOwnPropertyDescriptor(shipment, key)?.value ?? "");
};

interface ShipmentsTableProps {
  shipments: ShipmentItem[];
  isLoading: boolean;
  columns: ColumnDef[];
  onCellEdit: (shipmentId: string, field: string, value: string) => void;
  onRowClick: (shipment: ShipmentItem) => void;
  onDelete: (shipmentId: string) => void;
}

interface EditingCell {
  rowId: string;
  colKey: string;
}

export const ShipmentsTable = ({ shipments, isLoading, columns, onCellEdit, onRowClick, onDelete }: ShipmentsTableProps) => {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const handleCommit = (rowId: string, colKey: string, value: string) => {
    setEditingCell(null);
    const shipment = shipments.find((s) => s.id === rowId);
    if (!shipment) return;
    if (getFieldValue(shipment, colKey) === value) return;
    onCellEdit(rowId, colKey, value);
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading...</div>;
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <table className="w-max border-collapse text-[11px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap border-r border-gray-100 dark:border-gray-700 select-none"
                style={{ width: col.width, minWidth: col.width }}
              >
                {col.title}
              </th>
            ))}
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {shipments.map((shipment) => (
            <tr key={shipment.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
              {columns.map((col) => (
                <SpreadsheetCell
                  key={col.key}
                  value={getFieldValue(shipment, col.key)}
                  col={col}
                  isEditing={editingCell?.rowId === shipment.id && editingCell?.colKey === col.key}
                  onStartEdit={() => {
                    if (col.key === "jobNumber") {
                      onRowClick(shipment);
                    } else {
                      setEditingCell({ rowId: shipment.id, colKey: col.key });
                    }
                  }}
                  onCommit={(value) => handleCommit(shipment.id, col.key, value)}
                  onCancel={() => setEditingCell(null)}
                />
              ))}
              <td className="px-1 text-center">
                <Popconfirm title="Delete?" onConfirm={() => onDelete(shipment.id)} okType="danger">
                  <button className="text-gray-300 hover:text-red-500 transition-colors">
                    <DeleteOutlined style={{ fontSize: 10 }} />
                  </button>
                </Popconfirm>
              </td>
            </tr>
          ))}
          {shipments.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="text-center py-8 text-gray-400">
                No shipments found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
