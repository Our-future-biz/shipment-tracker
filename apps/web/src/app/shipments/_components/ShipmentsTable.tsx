"use client";

import { useState, useMemo, useCallback } from "react";
import { Table, Popconfirm, Tag, Input, Select } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  COLUMNS,
  COMPUTED_COLUMNS,
  getComputedValue,
  getCellConditionalStyle,
  getRowConditionalStyle,
  getFilteredStatusOptions,
  STATUS_COLORS,
} from "@/lib/columnConfig";
import { getFieldValue, buildRowData, type ShipmentItem } from "@/hooks/useShipments";

interface ShipmentsTableProps {
  shipments: ShipmentItem[];
  isLoading: boolean;
  onCellEdit: (shipmentId: string, field: string, value: string) => void;
  onRowClick: (shipment: ShipmentItem) => void;
  onDelete: (shipmentId: string) => void;
  onMasterJobClick?: (mczNumber: string) => void;
  onRemoveMasterJob?: (shipment: ShipmentItem) => void;
  onOpenDimensions?: (shipment: ShipmentItem) => void;
}

interface EditingCell {
  rowId: string;
  colKey: string;
}

export const ShipmentsTable = ({
  shipments,
  isLoading,
  onCellEdit,
  onRowClick,
  onDelete,
  onMasterJobClick,
  onRemoveMasterJob,
  onOpenDimensions,
}: ShipmentsTableProps) => {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  // Precompute row data for conditional formatting
  const rowDataMap = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    for (const s of shipments) {
      const data = buildRowData(s);
      for (const key of COMPUTED_COLUMNS) {
        data[key] = getComputedValue(key, data);
      }
      map.set(s.id, data);
    }
    return map;
  }, [shipments]);

  const handleCommit = useCallback((rowId: string, colKey: string, value: string) => {
    setEditingCell(null);
    const shipment = shipments.find((s) => s.id === rowId);
    if (!shipment) return;
    if (getFieldValue(shipment, colKey) === value) return;
    onCellEdit(rowId, colKey, value);
  }, [shipments, onCellEdit]);

  // Build Ant Design columns from our column config
  const antColumns: ColumnsType<ShipmentItem> = useMemo(() => {
    const cols: ColumnsType<ShipmentItem> = COLUMNS.map((col, idx) => ({
      key: col.key,
      title: col.title,
      width: col.width,
      fixed: idx < 2 ? ("left" as const) : undefined,
      ellipsis: true,
      onCell: (record: ShipmentItem) => {
        const rowData = rowDataMap.get(record.id) || {};
        const val = COMPUTED_COLUMNS.has(col.key) ? getComputedValue(col.key, rowData) : getFieldValue(record, col.key);
        const condStyle = getCellConditionalStyle(col.key, val, rowData);
        const hasMaster = !!(rowData["masterJob"] || "").trim();
        const isMasterOrJob = col.key === "jobNumber" || col.key === "masterJob";

        return {
          style: {
            ...(condStyle ? {
              backgroundColor: condStyle.backgroundColor,
              color: condStyle.color,
              fontWeight: condStyle.fontWeight,
            } : {}),
            ...(hasMaster && isMasterOrJob ? { backgroundColor: "rgba(251, 191, 36, 0.08)" } : {}),
            cursor: (col.readonly && col.key !== "jobNumber" && col.key !== "masterJob") || COMPUTED_COLUMNS.has(col.key) ? "default" : "pointer",
            padding: "0 8px",
          },
          onClick: () => {
            if (col.key === "jobNumber") {
              onRowClick(record);
            } else if (col.key === "masterJob") {
              if (onMasterJobClick) onMasterJobClick(getFieldValue(record, "masterJob"));
            } else if (col.key === "dimensions") {
              if (onOpenDimensions) onOpenDimensions(record);
            } else if (!col.readonly && !COMPUTED_COLUMNS.has(col.key)) {
              setEditingCell({ rowId: record.id, colKey: col.key });
            }
          },
        };
      },
      render: (_: unknown, record: ShipmentItem) => {
        const rowData = rowDataMap.get(record.id) || {};
        const val = COMPUTED_COLUMNS.has(col.key) ? getComputedValue(col.key, rowData) : getFieldValue(record, col.key);
        const isEditing = editingCell?.rowId === record.id && editingCell?.colKey === col.key;

        // Editing mode
        if (isEditing) {
          if (col.type === "dropdown" && col.options) {
            const options = col.key === "status"
              ? getFilteredStatusOptions(rowData["tradeDirection"] || "")
              : col.options;
            return (
              <Select
                size="small"
                autoFocus
                open
                value={val || undefined}
                style={{ width: "100%" }}
                onChange={(v) => handleCommit(record.id, col.key, v)}
                onBlur={() => setEditingCell(null)}
                options={options.filter((o) => o !== "---").map((o) => ({ value: o, label: o }))}
              />
            );
          }
          return (
            <EditableInput
              value={val}
              onCommit={(v) => handleCommit(record.id, col.key, v)}
              onCancel={() => setEditingCell(null)}
              placeholder={col.type === "date" ? "MM/DD/YY" : ""}
            />
          );
        }

        // Display mode
        if (col.key === "jobNumber") {
          return <span style={{ fontFamily: "monospace", color: "#0d9488", fontWeight: 500, cursor: "pointer" }}>{val}</span>;
        }
        if (col.key === "masterJob" && val) {
          return (
            <span className="flex items-center gap-1">
              <span className="font-mono text-amber-500 hover:underline cursor-pointer">{val}</span>
              {onRemoveMasterJob && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveMasterJob(record); }}
                  className="text-amber-400/50 hover:text-red-400 text-[10px]"
                >✕</button>
              )}
            </span>
          );
        }
        if (col.key === "status" && val) {
          const color = STATUS_COLORS[val];
          return color
            ? <Tag color={color} style={{ fontSize: 11, lineHeight: "18px", margin: 0 }}>{val}</Tag>
            : <span>{val}</span>;
        }
        if (col.key === "dimensions") {
          return <span className="text-teal-500 text-[11px] cursor-pointer">{val ? "click to edit" : "click to open"}</span>;
        }
        if (!val) return <span style={{ color: "#d1d5db" }}>—</span>;
        return val;
      },
    }));

    // Action column
    cols.push({
      key: "_actions",
      title: "",
      width: 40,
      fixed: "right",
      render: (_: unknown, record: ShipmentItem) => (
        <Popconfirm title="Delete this shipment?" onConfirm={() => onDelete(record.id)} okType="danger">
          <button className="text-gray-300 hover:text-red-500 transition-colors">
            <DeleteOutlined style={{ fontSize: 11 }} />
          </button>
        </Popconfirm>
      ),
    });

    return cols;
  }, [editingCell, rowDataMap, handleCommit, onRowClick, onDelete, onMasterJobClick, onRemoveMasterJob, onOpenDimensions]);

  return (
    <Table<ShipmentItem>
      dataSource={shipments}
      columns={antColumns}
      rowKey="id"
      loading={isLoading}
      size="small"
      pagination={false}
      scroll={{ x: "max-content", y: "calc(100vh - 210px)" }}
      rowClassName={(record) => {
        const rowData = rowDataMap.get(record.id) || {};
        const style = getRowConditionalStyle(rowData);
        if (style?.backgroundColor) return "row-highlight";
        return "";
      }}
      locale={{ emptyText: "No shipments found" }}
    />
  );
};

// ─── Inline Edit Input ────────────────────────────────────────────

function EditableInput({
  value,
  onCommit,
  onCancel,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const [localVal, setLocalVal] = useState(value);

  return (
    <Input
      size="small"
      autoFocus
      value={localVal}
      placeholder={placeholder}
      onChange={(e) => setLocalVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(localVal);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onCommit(localVal)}
      style={{ fontSize: 12 }}
    />
  );
}
