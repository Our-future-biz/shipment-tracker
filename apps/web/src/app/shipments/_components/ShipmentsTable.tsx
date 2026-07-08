"use client";

import { useMemo, useState } from "react";
import { Table, Input, Select } from "antd";
import { SearchOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import { COLUMN_MAP } from "@/lib/columnConfig";
import { useAuth } from "@/lib/auth/AuthContext";
import { useColumnView } from "@/hooks/useColumnView";
import { ColumnPicker } from "./ColumnPicker";

// Draggable table header cell — id comes from each column's onHeaderCell().
type HeaderCellProps = React.ThHTMLAttributes<HTMLTableCellElement> & { id?: string };

const DraggableHeaderCell = ({ id, style, ...rest }: HeaderCellProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: id ?? "",
  });

  if (!id) return <th style={style} {...rest} />;

  const thStyle: React.CSSProperties = {
    ...style,
    transform: CSS.Translate.toString(transform),
    transition,
    cursor: "grab",
    userSelect: "none",
    ...(isDragging ? { position: "relative", zIndex: 2, background: "#eef2ff" } : {}),
  };

  return <th ref={setNodeRef} style={thStyle} {...rest} {...attributes} {...listeners} />;
};

// --- Props ---

interface ShipmentsTableProps {
  shipments: ShipmentItem[];
  isLoading: boolean;
  onCreateClick: () => void;
  onDelete: (shipment: ShipmentItem) => void;
  onAddMasterJob: () => void;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "in-transit", label: "In Transit" },
  { value: "customs", label: "Customs" },
  { value: "delivered", label: "Delivered" },
];

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
];

export const ShipmentsTable = ({
  shipments,
  isLoading,
  onCreateClick,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDelete,
  onAddMasterJob,
}: ShipmentsTableProps) => {
  const router = useRouter();
  const { user, token } = useAuth();
  const { visible, setVisible, reset, templates, activeTemplateId, applyTemplate, deactivate, saveAsTemplate, deleteTemplate } =
    useColumnView(user?.id, token);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = useState(25);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = visible.indexOf(String(active.id));
    const newIndex = visible.indexOf(String(over.id));
    if (oldIndex !== -1 && newIndex !== -1) {
      setVisible(arrayMove(visible, oldIndex, newIndex));
    }
  };

  // Filter by status + search
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return shipments.filter((s) => {
      // Status filter
      if (statusFilter !== "all") {
        const status = (s.status || "").toLowerCase();
        if (statusFilter === "active" && !status.includes("active") && !status.includes("pending") && !status.includes("new")) return false;
        if (statusFilter === "in-transit" && !status.includes("transport") && !status.includes("shipped") && !status.includes("pre-alert") && !status.includes("loaded")) return false;
        if (statusFilter === "customs" && !status.includes("customs")) return false;
        if (statusFilter === "delivered" && !status.includes("billed") && !status.includes("billing") && !status.includes("delivered")) return false;
      }
      // Search filter
      if (q) {
        const haystack = [s.jobNumber, s.customer, s.personInCharge]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [shipments, statusFilter, search]);

  // Columns \u2014 driven by the user's selection, in the saved (draggable) order.
  const columns: ColumnsType<ShipmentItem> = useMemo(() => {
    return visible
      .map((key) => COLUMN_MAP.get(key))
      .filter((col): col is NonNullable<typeof col> => !!col && col.type !== "popup")
      .map((col) => ({
      key: col.key,
      title: col.title,
      width: col.width,
      ellipsis: true,
      onHeaderCell: () => ({ id: col.key }) as React.HTMLAttributes<HTMLTableCellElement>,
      render: (_: unknown, record: ShipmentItem) => {
        if (col.key === "jobNumber") {
          return (
            <span className="font-mono font-bold text-indigo-500 hover:underline cursor-pointer">
              {record.jobNumber || "\u2014"}
            </span>
          );
        }
        const val = getFieldValue(record, col.key);
        if (!val) return <span className="text-slate-300">{"\u2014"}</span>;
        if (col.key === "masterJob") return <span className="text-slate-400">#{val}</span>;
        return <span className="text-slate-600">{val}</span>;
      },
    }));
  }, [visible]);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Shipments</h1>
          <p className="text-[14px] text-slate-500 mt-1">Manage and track all shipments</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onCreateClick}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-indigo-700 transition-colors h-[44px]"
          >
            <PlusOutlined />
            New Shipment
          </button>
          <button
            onClick={onAddMasterJob}
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-[14px] font-medium text-slate-700 hover:bg-slate-50 transition-colors h-[44px]"
          >
            Add to Master Job
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search shipments..."
            prefix={<SearchOutlined className="text-slate-400" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            className="w-60"
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            className="w-44"
          />
        </div>
        <div className="flex items-center gap-3 text-[13px] text-slate-500">
          <ColumnPicker
            visible={visible}
            onChange={setVisible}
            onReset={reset}
            templates={templates}
            activeTemplateId={activeTemplateId}
            onApplyTemplate={applyTemplate}
            onDeactivate={deactivate}
            onSaveTemplate={saveAsTemplate}
            onDeleteTemplate={deleteTemplate}
          />
          <span>Rows per page</span>
          <Select
            value={pageSize}
            onChange={setPageSize}
            options={PAGE_SIZE_OPTIONS}
            className="w-16"
            size="small"
          />
          <span>{filtered.length} / {shipments.length} rows</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible} strategy={horizontalListSortingStrategy}>
            <Table<ShipmentItem>
              dataSource={filtered}
              columns={columns}
              rowKey="id"
              loading={isLoading}
              size="small"
              components={{ header: { cell: DraggableHeaderCell } }}
              pagination={{
                pageSize,
                showSizeChanger: false,
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} entries`,
              }}
              scroll={{ x: "max-content" }}
              onRow={(record) => ({
                onClick: () => router.push(`/shipments/${record.id}`),
                className: "cursor-pointer",
              })}
              locale={{ emptyText: "No shipments found" }}
            />
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};
