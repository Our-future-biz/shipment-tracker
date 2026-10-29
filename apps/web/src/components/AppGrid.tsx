"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Table, Input, Select, Tooltip, Popover, Pagination, Button, Badge, type InputRef } from "antd";
import { SearchOutlined, FilterOutlined, DownloadOutlined, SettingOutlined } from "@ant-design/icons";
import type { ColumnType } from "antd/es/table";
import type { SortOrder } from "antd/es/table/interface";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { DraggableHeaderCell } from "@/components/DraggableHeaderCell";
import { ColumnChecklist } from "@/components/ColumnChecklist";
import { ColumnFilterRows } from "@/components/ColumnFilterRows";
import { TOOLBAR_BUTTON_CLASS, activeGridFilters, matchesGridFilters, type GridFilter } from "@/components/gridFilters";
import { cellRender } from "@/components/gridColumns";
import { downloadCsv } from "@/lib/csv";
import { businessToday } from "@/lib/date";
import { foldIncludes } from "@/lib/fold";
import { useAuth } from "@/lib/auth/AuthContext";
import { resizableColumns, useColumnWidths } from "@/hooks/useColumnWidths";

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

type Sort = { key: string; order: Exclude<SortOrder, null> };

// A column's compare function (`sorter` as a function or `{ compare }`), if it sorts on the client.
function compareOf<T>(col: AppGridColumn<T> | undefined): ((a: T, b: T) => number) | null {
  const s = col?.sorter;
  if (typeof s === "function") return (a, b) => s(a, b, "ascend");
  if (s && typeof s === "object" && typeof s.compare === "function") return s.compare;
  return null;
}

const PAGE_SIZE_OPTIONS = [50, 100, 150, 200];


// The rows as a CSV file (lib/csv guards cells a spreadsheet would run as formulas), named
// with today's date on the company's calendar.
function exportCsv<T>(rows: T[], cols: AppGridColumn<T>[], filePrefix: string) {
  downloadCsv(`${filePrefix}-${businessToday()}.csv`, [cols.map((c) => c.title), ...rows.map((r) => cols.map((c) => String(c.text(r))))]);
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
  /** localStorage namespace for column order / visibility, and (per user) the column widths. */
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

  // Column widths the user dragged, kept per user in this browser.
  const { user } = useAuth();
  const { widthOf, resizeProps, resetAll: resetWidths, hasWidths } = useColumnWidths(user?.id, storageKey);

  const [search, setSearch] = useState("");
  const searchRef = useRef<InputRef>(null);

  // "/" jumps to the search, unless the user is typing somewhere. The first grid on screen
  // takes it (preventDefault), and a grid hidden on another tab never does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const input = searchRef.current?.input;
      if (!input || input.offsetParent === null) return;
      // An open drawer or modal covers the grid; only a grid inside it may take the key.
      const overlays = Array.from(document.querySelectorAll<HTMLElement>(".ant-drawer-open, .ant-modal-wrap")).filter(
        (el) => el.getClientRects().length > 0,
      );
      if (overlays.some((el) => !el.contains(input))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [colFilters, setColFilters] = useState<GridFilter[]>([]);
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

  const activeFilters = useMemo(() => activeGridFilters(colFilters), [colFilters]);

  const filtered = useMemo(() => {
    const q = search.trim();
    return rows.filter((r) => {
      if (q && !columns.some((c) => foldIncludes(c.text(r), q))) return false;
      // A filter on a column this grid no longer has narrows nothing.
      return matchesGridFilters(
        r,
        activeFilters.filter((f) => columnMap.has(f.key)),
        (row, key) => columnMap.get(key)?.text(row) ?? "",
      );
    });
  }, [rows, columns, columnMap, search, activeFilters]);

  // Column sorting: a column with a compare `sorter` sorts the whole filtered list (not only the
  // page shown), then the list is paged.
  const [sort, setSort] = useState<Sort | null>(null);
  const sorted = useMemo(() => {
    const compare = sort ? compareOf(columnMap.get(sort.key)) : null;
    if (!sort || !compare) return filtered;
    const dir = sort.order === "descend" ? -1 : 1;
    return filtered
      .map((r, i) => ({ r, i }))
      .sort((a, b) => compare(a.r, b.r) * dir || a.i - b.i)
      .map((x) => x.r);
  }, [filtered, sort, columnMap]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeFilters, pageSize, resetKey, sort]);

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
      resizableColumns(
        visibleColumns.map(({ text, defaultVisible: _dv, filterOptions: _fo, ...col }) => ({
          ellipsis: true,
          ...col,
          render: cellRender(col, text),
          // Sorting is done above on the whole list; the table only shows the arrow.
          ...(compareOf(col as AppGridColumn<T>) ? { sorter: true, sortOrder: sort?.key === col.key ? sort.order : null } : {}),
          onHeaderCell: () => ({ id: col.key }) as React.HTMLAttributes<HTMLTableCellElement>,
        })),
        { widthOf, resizeProps },
      ),
    [visibleColumns, sort, widthOf, resizeProps],
  );

  const totalRows = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const paged = useMemo(() => sorted.slice((safePage - 1) * pageSize, safePage * pageSize), [sorted, safePage, pageSize]);

  const selectedRows = useMemo(() => {
    const set = new Set(selectedKeys.map(String));
    return rows.filter((r) => set.has(rowKey(r)));
  }, [rows, selectedKeys, rowKey]);

  // Report the selection to the page (for actions outside the bulk bar). The rows array can be
  // a new (even empty) array on every render, so the effect keys off the selected rows' content:
  // it fires only when the selection or the data of a selected row really changes.
  const clearSelection = useCallback(() => setSelectedKeys([]), []);
  const latest = useRef({ selectedRows, onSelectionChange });
  latest.current = { selectedRows, onSelectionChange };
  const selectionSignature = onSelectionChange ? JSON.stringify(selectedRows) : "";
  useEffect(() => {
    latest.current.onSelectionChange?.(latest.current.selectedRows, clearSelection);
  }, [selectionSignature, clearSelection]);

  const filterColumns = useMemo(() => columns.map((c) => ({ key: c.key, title: c.title, options: c.filterOptions })), [columns]);

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
      {/* Wraps onto a second line when narrow, so the search never shrinks under the buttons. */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3 shrink-0">{actions}</div>
        {/* Search sits in the middle of the toolbar, actions left, the rest right. "/" focuses it. */}
        <div className="flex flex-1 basis-[220px] justify-center min-w-[200px]">
          <Input
            ref={searchRef}
            placeholder={searchPlaceholder}
            prefix={<SearchOutlined className="text-slate-400" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            className="w-[320px] max-w-full"
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
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
                <ColumnFilterRows rows={colFilters} columns={filterColumns} onChange={setColFilters} />
              </div>
            }
          >
            <Tooltip title="Filters">
              <Badge count={activeFilters.length} size="small" offset={[-4, 4]} className="[&_.ant-badge-count]:!bg-indigo-600">
                <button aria-label="Filters" className={TOOLBAR_BUTTON_CLASS}>
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
                <ColumnChecklist columns={columns} visible={visible} onChange={setVisible} />
                <div className="flex justify-end gap-3">
                  {hasWidths && (
                    <Button size="small" type="link" onClick={resetWidths} title="Put every column back to its default width" className="px-0">
                      Reset widths
                    </Button>
                  )}
                  <Button size="small" type="link" onClick={() => setVisible(defaultVisible)} className="px-0">
                    Reset to default
                  </Button>
                </div>
              </div>
            }
          >
            <Tooltip title="Columns">
              <button aria-label="Columns" className={TOOLBAR_BUTTON_CLASS}>
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
      <div className="shipments-table app-grid bg-white border border-slate-200 rounded-2xl overflow-hidden">
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
              onChange={(_p, _f, sorter) => {
                const s = Array.isArray(sorter) ? sorter[0] : sorter;
                setSort(s?.order && s.columnKey != null ? { key: String(s.columnKey), order: s.order } : null);
              }}
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
                      // Rows can be reached with Tab and opened with Enter (only on the row itself,
                      // so Enter on a link or checkbox inside it keeps its own meaning).
                      tabIndex: 0,
                      onKeyDown: (e) => {
                        if (e.key === "Enter" && e.target === e.currentTarget) {
                          e.preventDefault();
                          onRowClick(r);
                        }
                      },
                      className: "cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:-outline-offset-2",
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
