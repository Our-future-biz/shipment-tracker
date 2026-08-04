"use client";

import { useEffect, useMemo, useState } from "react";
import { Table, Input, Select, Drawer, Tooltip, Popover, Pagination, Button } from "antd";
import { SearchOutlined, PlusOutlined, FileTextOutlined, FilterOutlined, CloseOutlined, DownloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
import { getFieldValue, buildRowData, useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { COLUMNS, COLUMN_MAP, getCellConditionalStyle, getRowConditionalStyle, isFixedColumn, type CellStyle } from "@/lib/columnConfig";
import { useAuth } from "@/lib/auth/AuthContext";
import { useColumnView } from "@/hooks/useColumnView";
import { ColumnPicker } from "./ColumnPicker";
import { MasterJobDetailModal } from "./MasterJobDetailModal";
import { DocumentsTab } from "@/app/shipments/[jobNumber]/tabs/DocumentsTab";
import { EditableCell } from "@/app/shipments/[jobNumber]/_components/EditableCell";

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

type ColFilter = { key: string; value: string };

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "in-transit", label: "In Transit" },
  { value: "customs", label: "Customs" },
  { value: "delivered", label: "Delivered" },
];

const PAGE_SIZE_OPTIONS = [50, 100, 150, 200];

// Export the given shipments to a CSV of the currently visible columns (respects
// the column view + order). Mirrors the sales quote-history export.
function exportShipmentsCsv(rows: ShipmentItem[], visibleKeys: string[]): void {
  const cols = visibleKeys
    .map((k) => COLUMN_MAP.get(k))
    .filter((c): c is NonNullable<typeof c> => !!c && c.type !== "popup");
  const headers = cols.map((c) => c.title);
  const body = rows.map((s) => cols.map((c) => getFieldValue(s, c.key)));
  const csv = [headers, ...body]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  // Prepend a BOM so Excel reads the UTF-8 diacritics correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shipments-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const ShipmentsTable = ({
  shipments,
  isLoading,
  onCreateClick,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDelete,
  onAddMasterJob,
}: ShipmentsTableProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, token } = useAuth();
  const { updateField } = useShipments();
  const { visible, setVisible, reset, templates, activeTemplateId, isDirty, applyTemplate, deactivate, saveActiveTemplate, saveAsTemplate, deleteTemplate } =
    useColumnView(user?.id, token);
  // Search text, kept in sync with the URL ?q= param (also driven by the global top-nav search)
  const urlQuery = searchParams.get("q") ?? "";
  const [search, setSearch] = useState(urlQuery);
  useEffect(() => {
    setSearch(urlQuery);
  }, [urlQuery]);

  const onSearchChange = (value: string) => {
    setSearch(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [mczModal, setMczModal] = useState<string | null>(null);
  const [docsShipment, setDocsShipment] = useState<ShipmentItem | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

  // Per-column filters, persisted in the URL as ?f.<colKey>=<value>
  const [filters, setFilters] = useState<ColFilter[]>(() => {
    const out: ColFilter[] = [];
    searchParams.forEach((value, key) => {
      if (key.startsWith("f.")) out.push({ key: key.slice(2), value });
    });
    return out;
  });

  const applyFilters = (next: ColFilter[]) => {
    setFilters(next);
    const params = new URLSearchParams(searchParams.toString());
    Array.from(params.keys()).forEach((k) => {
      if (k.startsWith("f.")) params.delete(k);
    });
    next.forEach((f) => {
      if (f.key) params.set(`f.${f.key}`, f.value);
    });
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const addFilter = () => applyFilters([...filters, { key: "", value: "" }]);
  const updateFilter = (i: number, patch: Partial<ColFilter>) =>
    applyFilters(filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const removeFilter = (i: number) => applyFilters(filters.filter((_, idx) => idx !== i));

  const activeFilters = useMemo(() => filters.filter((f) => f.key && f.value.trim()), [filters]);

  const filterColumnOptions = useMemo(
    () => COLUMNS.filter((c) => c.type !== "popup").map((c) => ({ value: c.key, label: c.title })),
    [],
  );

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
      // Per-column filters (AND, case-insensitive contains)
      for (const f of activeFilters) {
        if (!getFieldValue(s, f.key).toLowerCase().includes(f.value.toLowerCase().trim())) return false;
      }
      // Global search across every column value
      if (q) {
        const haystack = Object.values(buildRowData(s)).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [shipments, statusFilter, search, activeFilters]);

  // Precompute per-row data + whole-row conditional tint once (used by every cell).
  const rowInfo = useMemo(() => {
    const m = new Map<string, { rowData: Record<string, string>; rowStyle: CellStyle | null }>();
    for (const s of filtered) {
      const rowData = buildRowData(s);
      m.set(s.id, { rowData, rowStyle: getRowConditionalStyle(rowData) });
    }
    return m;
  }, [filtered]);

  // Columns \u2014 driven by the user's selection, in the saved (draggable) order.
  const columns: ColumnsType<ShipmentItem> = useMemo(() => {
    const cols: ColumnsType<ShipmentItem> = visible
      .map((key) => COLUMN_MAP.get(key))
      .filter((col): col is NonNullable<typeof col> => !!col && col.type !== "popup")
      .map((col) => ({
      key: col.key,
      title: col.title,
      width: col.width,
      ellipsis: true,
      // Internal Reference + Master job stay frozen on the left while the rest scrolls.
      fixed: isFixedColumn(col.key) ? ("left" as const) : undefined,
      onHeaderCell: () => ({ id: col.key }) as React.HTMLAttributes<HTMLTableCellElement>,
      // Per-column conditional background tint (applies on every row).
      onCell: (record: ShipmentItem) => {
        const info = rowInfo.get(record.id);
        const cellBg = getCellConditionalStyle(col.key, getFieldValue(record, col.key), info?.rowData ?? {})?.backgroundColor;
        return cellBg ? { style: { backgroundImage: `linear-gradient(${cellBg}, ${cellBg})` } } : {};
      },
      render: (_: unknown, record: ShipmentItem) => {
        const info = rowInfo.get(record.id);
        const val = getFieldValue(record, col.key);
        const cellStyle = getCellConditionalStyle(col.key, val, info?.rowData ?? {});
        const textStyle: React.CSSProperties | undefined = cellStyle
          ? { color: cellStyle.color, fontWeight: cellStyle.fontWeight }
          : undefined;

        // Internal Reference \u2192 opens the detail.
        if (col.key === "jobNumber") {
          return (
            <span
              onClick={() => router.push(`/shipments/${record.id}`)}
              className="font-mono font-bold hover:underline cursor-pointer"
              style={{ color: cellStyle?.color ?? "#6366f1", fontWeight: cellStyle?.fontWeight ?? 700 }}
            >
              {record.jobNumber || "\u2014"}
            </span>
          );
        }
        // Master job \u2192 opens the master-job modal.
        if (col.key === "masterJob") {
          return val ? (
            <button
              onClick={(e) => { e.stopPropagation(); setMczModal(val); }}
              className="text-indigo-500 hover:underline font-medium bg-transparent border-none p-0 cursor-pointer"
              style={textStyle}
            >
              {val}
            </button>
          ) : (
            <span className="text-slate-300">{"\u2014"}</span>
          );
        }
        // Read-only columns (computed, createdBy\u2026) \u2014 plain text.
        if (col.readonly) {
          return val ? <span className="text-slate-600" style={textStyle}>{val}</span> : <span className="text-slate-300">{"\u2014"}</span>;
        }
        // Everything else \u2014 inline editable (double-click). Text/dropdown/date per column config.
        return (
          <EditableCell
            fieldKey={col.key}
            value={val}
            onCommit={(fieldKey, value) => updateField(record.id, fieldKey, value)}
            placeholder={"\u2014"}
            displayClassName="text-slate-600"
            emptyClassName="text-slate-300"
            displayStyle={textStyle}
          />
        );
      },
    }));

    // Always-visible Documents column (independent of the column picker).
    cols.push({
      key: "__docs",
      title: "",
      width: 46,
      fixed: "right",
      render: (_: unknown, record: ShipmentItem) => (
        <Tooltip title="Documents">
          <button
            onClick={(e) => { e.stopPropagation(); setDocsShipment(record); }}
            className="text-slate-400 hover:text-indigo-500 bg-transparent border-none cursor-pointer p-1"
          >
            <FileTextOutlined />
          </button>
        </Tooltip>
      ),
    });

    return cols;
  }, [visible, rowInfo, router, updateField]);

  // Client-side pagination (custom bottom bar so the size selector sits on the left).
  const totalRows = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  // Reset to the first page whenever the result set or page size changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, activeFilters, pageSize]);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Shipments</h1>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search shipments..."
            prefix={<SearchOutlined className="text-slate-400" />}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            allowClear
            className="w-60"
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            className="w-44"
          />
          <Popover
            trigger="click"
            placement="bottomLeft"
            content={
              <div className="w-[430px] -m-1">
                <div className="flex items-center justify-between px-1 pb-2.5 mb-2.5 border-b border-slate-100">
                  <span className="text-[13px] font-semibold text-slate-800">Filter by column</span>
                  {filters.length > 0 && (
                    <button
                      onClick={() => applyFilters([])}
                      className="text-xs font-medium text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-0"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                {filters.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-lg">
                    No filters yet — add one to narrow the list.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filters.map((f, i) => {
                      const col = COLUMN_MAP.get(f.key);
                      const isDropdown = col?.type === "dropdown" && !!col.options;
                      return (
                        <div key={i} className="flex items-center gap-1.5">
                          <Select
                            showSearch
                            placeholder="Column"
                            value={f.key || undefined}
                            onChange={(val) => updateFilter(i, { key: val, value: "" })}
                            options={filterColumnOptions}
                            optionFilterProp="label"
                            size="small"
                            className="w-[150px] shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            {isDropdown ? (
                              <Select
                                showSearch
                                allowClear
                                placeholder="Select value"
                                value={f.value || undefined}
                                onChange={(val) => updateFilter(i, { value: val ?? "" })}
                                options={col!.options!.map((o) => ({ value: o, label: o }))}
                                optionFilterProp="label"
                                size="small"
                                className="w-full"
                              />
                            ) : (
                              <Input
                                placeholder="Enter value"
                                value={f.value}
                                onChange={(e) => updateFilter(i, { value: e.target.value })}
                                size="small"
                                allowClear
                              />
                            )}
                          </div>
                          <button
                            onClick={() => removeFilter(i)}
                            aria-label="Remove filter"
                            className="shrink-0 flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 bg-transparent border-none cursor-pointer transition-colors"
                          >
                            <CloseOutlined className="text-[11px]" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button
                  onClick={addFilter}
                  className="mt-2.5 w-full flex items-center justify-center gap-1.5 h-8 rounded-lg border border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/40 bg-transparent cursor-pointer transition-colors"
                >
                  <PlusOutlined className="text-[10px]" /> Add filter
                </button>
              </div>
            }
          >
            <button className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 h-8 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              <FilterOutlined />
              Filters
              {activeFilters.length > 0 && (
                <span className="ml-0.5 rounded-full bg-indigo-100 text-indigo-600 text-[11px] font-semibold px-1.5 leading-5">
                  {activeFilters.length}
                </span>
              )}
            </button>
          </Popover>
        </div>
        <div className="flex items-center gap-3 text-[13px] text-slate-500">
          <ColumnPicker
            visible={visible}
            onChange={setVisible}
            onReset={reset}
            templates={templates}
            activeTemplateId={activeTemplateId}
            isDirty={isDirty}
            onApplyTemplate={applyTemplate}
            onDeactivate={deactivate}
            onSaveActive={saveActiveTemplate}
            onSaveTemplate={saveAsTemplate}
            onDeleteTemplate={deleteTemplate}
          />
          <button
            onClick={() => exportShipmentsCsv(filtered, visible)}
            title="Export the filtered shipments (visible columns) to CSV"
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 h-8 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <DownloadOutlined />
            Export
          </button>
          <div className="w-px h-6 bg-slate-200" />
          <button
            onClick={onCreateClick}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            <PlusOutlined />
            New Shipment
          </button>
          <button
            onClick={onAddMasterJob}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 h-8 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Add to Master Job
          </button>
        </div>
      </div>

      {/* Bulk action bar (shown when rows are selected) */}
      {selectedKeys.length > 0 && (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-2.5">
          <span className="text-sm text-indigo-700 font-medium">{selectedKeys.length} selected</span>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => {
              const set = new Set(selectedKeys.map(String));
              exportShipmentsCsv(shipments.filter((s) => set.has(s.id)), visible);
            }}
          >
            Export CSV
          </Button>
          <Button size="small" type="text" onClick={() => setSelectedKeys([])}>
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="shipments-table bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible} strategy={horizontalListSortingStrategy}>
            <Table<ShipmentItem>
              dataSource={paged}
              columns={columns}
              rowKey="id"
              loading={isLoading}
              size="small"
              components={{ header: { cell: DraggableHeaderCell } }}
              pagination={false}
              rowSelection={{
                selectedRowKeys: selectedKeys,
                onChange: setSelectedKeys,
                preserveSelectedRowKeys: true,
                fixed: true,
                columnWidth: 44,
              }}
              scroll={{ x: "max-content" }}
              rowClassName={(record) => (rowInfo.get(record.id)?.rowStyle?.color ? "cf-row-fg" : "")}
              onRow={(record) => {
                const fg = rowInfo.get(record.id)?.rowStyle?.color;
                return fg ? { style: { "--cf-row-fg": fg } as React.CSSProperties } : {};
              }}
              locale={{ emptyText: "No shipments found" }}
            />
          </SortableContext>
        </DndContext>

        {/* Bottom bar: rows-per-page on the left, pagination on the right */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
          <div className="flex items-center gap-2 text-[13px] text-slate-500">
            <span>Rows per page</span>
            <Select
              value={pageSize}
              onChange={setPageSize}
              options={PAGE_SIZE_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
              className="w-20"
              size="small"
            />
          </div>
          <Pagination
            size="small"
            current={safePage}
            pageSize={pageSize}
            total={totalRows}
            showSizeChanger={false}
            onChange={setCurrentPage}
            showTotal={(total, range) => `${range[0]}-${range[1]} of ${total} entries`}
          />
        </div>
      </div>

      {mczModal && (
        <MasterJobDetailModal mcz={mczModal} open={!!mczModal} onClose={() => setMczModal(null)} />
      )}

      <Drawer
        open={!!docsShipment}
        onClose={() => setDocsShipment(null)}
        width={560}
        destroyOnClose
        title={docsShipment ? `Documents — ${docsShipment.jobNumber ?? docsShipment.id}` : "Documents"}
      >
        {docsShipment && <DocumentsTab shipment={docsShipment} />}
      </Drawer>
    </div>
  );
};
