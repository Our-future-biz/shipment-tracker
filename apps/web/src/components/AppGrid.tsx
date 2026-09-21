"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Table, Input, Select, Tooltip, Popover, Pagination, Button, Badge, Checkbox } from "antd";
import { SearchOutlined, FilterOutlined, CloseOutlined, DownloadOutlined, SettingOutlined } from "@ant-design/icons";
import type { ColumnType } from "antd/es/table";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// The app's grid, with the same structure as the Shipments grid: title row, toolbar
// (actions left; search, filters, column filters, columns and export right), bulk bar
// for selected rows, a compact table with row selection and draggable column headers,
// and the rows-per-page / pagination bar. Every list page uses the same layout whatever
// data it shows.

export interface AppGridColumn<T> extends Omit<ColumnType<T>, "key" | "title"> {
  key: string;
  title: string;
  /** Shown before the user picks columns. */
  defaultVisible?: boolean;
  /** Plain-text value for search, column filters and CSV export. */
  text: (row: T) => string;
  /** Fixed list of values for the column filter (otherwise free text). */
  filterOptions?: string[];
}

type ColFilter = { key: string; value: string };

const PAGE_SIZE_OPTIONS = [50, 100, 150, 200];

type HeaderCellProps = React.ThHTMLAttributes<HTMLTableCellElement> & { id?: string };

const DraggableHeaderCell = ({ id, style, ...rest }: HeaderCellProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: id ?? "" });
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

const toolbarButton =
  "flex items-center justify-center shrink-0 rounded-lg border border-slate-300 bg-white w-8 h-8 p-0 text-slate-700 hover:bg-slate-50 transition-colors";

function exportCsv<T>(rows: T[], cols: AppGridColumn<T>[], filePrefix: string) {
  const csv = [cols.map((c) => c.title), ...rows.map((r) => cols.map((c) => c.text(r)))]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  // BOM so Excel reads the UTF-8 diacritics correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface AppGridProps<T> {
  /** Page title; omit inside a tab that already has one. */
  title?: string;
  /** Right side of the title row (e.g. overview bubbles). */
  headerExtra?: ReactNode;
  /** Under the title row (e.g. module tabs). */
  subHeader?: ReactNode;
  /** Buttons on the left of the toolbar. */
  actions?: ReactNode;
  /** Extra filter controls between search and the column filters (e.g. a status select). */
  filters?: ReactNode;
  searchPlaceholder?: string;
  columns: AppGridColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  /** Extra buttons in the bulk bar for the selected rows. */
  bulkActions?: (selected: T[], clearSelection: () => void) => ReactNode;
  /** Called with the selected rows, for actions that live outside the bulk bar. */
  onSelectionChange?: (selected: T[], clearSelection: () => void) => void;
  /** localStorage namespace for column order / visibility. */
  storageKey: string;
  exportFilePrefix: string;
  /** Hide the CSV export (toolbar + bulk bar). */
  hideExport?: boolean;
  emptyText?: string;
  /** Changes to this reset paging (e.g. an outside filter). */
  resetKey?: unknown;
}

export function AppGrid<T extends object>({
  title,
  headerExtra,
  subHeader,
  actions,
  filters: extraFilters,
  searchPlaceholder = "Search…",
  columns,
  rows,
  rowKey,
  loading,
  onRowClick,
  bulkActions,
  onSelectionChange,
  storageKey,
  exportFilePrefix,
  hideExport,
  emptyText = "No records found",
  resetKey,
}: AppGridProps<T>) {
  const columnMap = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const defaultVisible = useMemo(() => columns.filter((c) => c.defaultVisible !== false).map((c) => c.key), [columns]);

  // Column order + visibility, remembered per browser.
  const [visible, setVisibleState] = useState<string[]>(defaultVisible);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${storageKey}:columns`) ?? "null");
      if (Array.isArray(saved)) setVisibleState(saved.filter((k: string) => columnMap.has(k)));
    } catch {
      // Storage unavailable — default columns.
    }
  }, [storageKey, columnMap]);
  const setVisible = (next: string[]) => {
    setVisibleState(next);
    try {
      localStorage.setItem(`${storageKey}:columns`, JSON.stringify(next));
    } catch {
      // Storage unavailable — the choice lasts until reload.
    }
  };

  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState<ColFilter[]>([]);
  const [columnSearch, setColumnSearch] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

  const activeFilters = useMemo(() => colFilters.filter((f) => f.key && f.value.trim()), [colFilters]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !columns.some((c) => c.text(r).toLowerCase().includes(q))) return false;
      return activeFilters.every((f) => {
        const col = columnMap.get(f.key);
        return !col || col.text(r).toLowerCase().includes(f.value.toLowerCase().trim());
      });
    });
  }, [rows, columns, columnMap, search, activeFilters]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeFilters, pageSize, resetKey]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = visible.indexOf(String(active.id));
    const to = visible.indexOf(String(over.id));
    if (from !== -1 && to !== -1) setVisible(arrayMove(visible, from, to));
  };

  const visibleColumns = useMemo(() => visible.map((k) => columnMap.get(k)).filter((c): c is AppGridColumn<T> => !!c), [visible, columnMap]);
  const tableColumns = useMemo(
    () =>
      visibleColumns.map(({ text: _text, defaultVisible: _dv, filterOptions: _fo, ...col }) => ({
        ellipsis: true,
        ...col,
        onHeaderCell: () => ({ id: col.key }) as React.HTMLAttributes<HTMLTableCellElement>,
      })),
    [visibleColumns],
  );

  const totalRows = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const paged = useMemo(() => filtered.slice((safePage - 1) * pageSize, safePage * pageSize), [filtered, safePage, pageSize]);

  const selectedRows = useMemo(() => {
    const set = new Set(selectedKeys.map(String));
    return rows.filter((r) => set.has(rowKey(r)));
  }, [rows, selectedKeys, rowKey]);

  // Report the selection to the page (for actions outside the bulk bar). selectedRows and the
  // callback are re-created on every render, so the effect keys off what actually changed.
  const clearSelection = useCallback(() => setSelectedKeys([]), []);
  const latest = useRef({ selectedRows, onSelectionChange });
  latest.current = { selectedRows, onSelectionChange };
  useEffect(() => {
    latest.current.onSelectionChange?.(latest.current.selectedRows, clearSelection);
  }, [selectedKeys, rows, clearSelection]);

  const filterColumnOptions = columns.map((c) => ({ value: c.key, label: c.title }));
  const shownColumns = columns.filter((c) => c.title.toLowerCase().includes(columnSearch.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      {(title || headerExtra || subHeader) && (
        <div>
          {(title || headerExtra) && (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {title && <h1 className="text-2xl font-bold text-slate-900">{title}</h1>}
              {headerExtra}
            </div>
          )}
          {subHeader}
        </div>
      )}

      {/* Filters Row */}
      <div className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">{actions}</div>
        {/* Search sits in the middle of the toolbar, actions left, the rest right. */}
        <div className="flex flex-1 justify-center min-w-0">
          <Input
            placeholder={searchPlaceholder}
            prefix={<SearchOutlined className="text-slate-400" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            className="w-[320px] max-w-full"
          />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {extraFilters && (
            <>
              {extraFilters}
              <div className="w-px h-6 bg-slate-200 shrink-0" />
            </>
          )}
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <div className="w-[430px] -m-1">
                <div className="flex items-center justify-between px-1 pb-2.5 mb-2.5 border-b border-slate-100">
                  <span className="text-[13px] font-semibold text-slate-800">Filter by column</span>
                  {colFilters.length > 0 && (
                    <button
                      onClick={() => setColFilters([])}
                      className="text-xs font-medium text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-0"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                {colFilters.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-lg">No filters yet — add one to narrow the list.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {colFilters.map((f, i) => {
                      const col = columnMap.get(f.key);
                      const update = (patch: Partial<ColFilter>) => setColFilters(colFilters.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
                      return (
                        <div key={i} className="flex items-center gap-1.5">
                          <Select
                            showSearch
                            placeholder="Column"
                            value={f.key || undefined}
                            onChange={(val) => update({ key: val, value: "" })}
                            options={filterColumnOptions}
                            optionFilterProp="label"
                            size="small"
                            className="w-[150px] shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            {col?.filterOptions ? (
                              <Select
                                showSearch
                                allowClear
                                placeholder="Select value"
                                value={f.value || undefined}
                                onChange={(val) => update({ value: val ?? "" })}
                                options={col.filterOptions.map((o) => ({ value: o, label: o }))}
                                optionFilterProp="label"
                                size="small"
                                className="w-full"
                              />
                            ) : (
                              <Input placeholder="Enter value" value={f.value} onChange={(e) => update({ value: e.target.value })} size="small" allowClear />
                            )}
                          </div>
                          <button
                            onClick={() => setColFilters(colFilters.filter((_, idx) => idx !== i))}
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
                  onClick={() => setColFilters([...colFilters, { key: "", value: "" }])}
                  className="mt-2.5 w-full flex items-center justify-center gap-1.5 h-8 rounded-lg border border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/40 bg-transparent cursor-pointer transition-colors"
                >
                  + Add filter
                </button>
              </div>
            }
          >
            <Tooltip title="Filters">
              <Badge count={activeFilters.length} size="small" color="#4f46e5" offset={[-4, 4]}>
                <button aria-label="Filters" className={toolbarButton}>
                  <FilterOutlined />
                </button>
              </Badge>
            </Tooltip>
          </Popover>
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <div className="w-[300px]">
                <Input size="small" placeholder="Find a column…" value={columnSearch} onChange={(e) => setColumnSearch(e.target.value)} allowClear className="mb-2" />
                <div className="flex items-center gap-3 mb-1.5">
                  <button
                    onClick={() => setVisible([...visible, ...columns.map((c) => c.key).filter((k) => !visible.includes(k))])}
                    className="text-[11px] text-indigo-500 hover:underline bg-transparent border-none p-0 cursor-pointer"
                  >
                    Select all
                  </button>
                  <button onClick={() => setVisible([])} className="text-[11px] text-slate-400 hover:underline bg-transparent border-none p-0 cursor-pointer">
                    Clear
                  </button>
                </div>
                <div className="max-h-[320px] overflow-y-auto pr-1 flex flex-col gap-1">
                  {shownColumns.length === 0 && <div className="text-xs text-slate-400 py-2">No columns found.</div>}
                  {shownColumns.map((c) => (
                    <label key={c.key} className="flex items-center gap-2 text-xs py-0.5 text-slate-700 cursor-pointer">
                      <Checkbox
                        checked={visible.includes(c.key)}
                        onChange={(e) => setVisible(e.target.checked ? [...visible, c.key] : visible.filter((k) => k !== c.key))}
                      />
                      {c.title}
                    </label>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-slate-400">{visible.length} shown</span>
                  <Button size="small" type="link" onClick={() => setVisible(defaultVisible)} className="px-0">
                    Reset to default
                  </Button>
                </div>
              </div>
            }
          >
            <Tooltip title="Columns">
              <button aria-label="Columns" className={toolbarButton}>
                <SettingOutlined />
              </button>
            </Tooltip>
          </Popover>
          {!hideExport && (
            <button
              onClick={() => exportCsv(filtered, visibleColumns, exportFilePrefix)}
              title="Export the filtered rows (visible columns) to CSV"
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 h-8 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <DownloadOutlined />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar (shown when rows are selected) */}
      {selectedKeys.length > 0 && (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-2.5">
          <span className="text-sm text-indigo-700 font-medium">{selectedKeys.length} selected</span>
          {!hideExport && (
            <Button size="small" icon={<DownloadOutlined />} onClick={() => exportCsv(selectedRows, visibleColumns, exportFilePrefix)}>
              Export CSV
            </Button>
          )}
          {bulkActions?.(selectedRows, () => setSelectedKeys([]))}
          <Button size="small" type="text" onClick={() => setSelectedKeys([])}>
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="shipments-table bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible} strategy={horizontalListSortingStrategy}>
            <Table<T>
              dataSource={paged}
              columns={tableColumns}
              rowKey={rowKey}
              loading={loading}
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
              onRow={
                onRowClick
                  ? (r) => ({
                      // Ticking the row checkbox must not open the row.
                      onClick: (e) => !(e.target as HTMLElement).closest(".ant-table-selection-column") && onRowClick(r),
                      className: "cursor-pointer",
                    })
                  : undefined
              }
              locale={{ emptyText }}
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
    </div>
  );
}
