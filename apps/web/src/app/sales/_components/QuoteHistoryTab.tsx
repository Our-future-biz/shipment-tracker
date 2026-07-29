"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Checkbox, Popover, Dropdown, Modal, DatePicker, Tag, Tooltip } from "antd";
import {
  SearchOutlined,
  DownloadOutlined,
  SettingOutlined,
  FilterOutlined,
  UpOutlined,
  DownOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { EyeOutlined, FilePdfOutlined } from "@ant-design/icons";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DataTable } from "@/components/DataTable";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { useSalesPref } from "@/hooks/useSalesPrefs";
import { useToast } from "@/lib/toast";
import {
  computeTotals,
  computeCargo,
  fmt,
  daysOpen,
  validityInfo,
  needsFollowUp,
  exportQuotesCsv,
  type SalesQuote,
} from "../_lib/salesQuote";
import type { SalesQuoteData } from "../_lib/types";
import { QUOTE_STATUS_MAP, QUOTE_STATUSES, SERVICE_TYPES, DIRECTIONS } from "../_lib/types";
import { printQuote } from "../_lib/printQuote";
import { PdfPreviewModal } from "../quote/[ref]/_components/PdfPreviewModal";
import { NewQuoteButton } from "./NewQuoteButton";

// Draggable table header cell — id comes from each column's onHeaderCell().
type HeaderCellProps = React.ThHTMLAttributes<HTMLTableCellElement> & { id?: string };

const DraggableHeaderCell = ({ id, style, ...rest }: HeaderCellProps) => {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: id ?? "" });

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

interface Filters {
  statuses: string[];
  serviceType?: string;
  direction?: string;
  dateFrom?: string;
  dateTo?: string;
  followUpOnly?: boolean;
}

interface SavedView {
  id: string;
  label: string;
  search: string;
  filters: Filters;
}

const EMPTY_FILTERS: Filters = { statuses: [] };

interface ColDef {
  key: string;
  title: string;
  width?: number;
  render: (q: SalesQuote) => React.ReactNode;
}

const COLUMN_DEFS: ColDef[] = [
  { key: "reference", title: "Reference", width: 160, render: (q) => <span className="font-mono text-xs text-indigo-500">{q.quoteNumber}</span> },
  { key: "customer", title: "Customer", render: (q) => q.data.customerName || <span className="text-slate-300">—</span> },
  { key: "service", title: "Service type", width: 110, render: (q) => q.data.serviceType || <span className="text-slate-300">—</span> },
  { key: "direction", title: "Direction", width: 100, render: (q) => q.data.direction || <span className="text-slate-300">—</span> },
  { key: "origin", title: "Origin", render: (q) => q.data.origin || <span className="text-slate-300">—</span> },
  { key: "destination", title: "Destination", render: (q) => q.data.destination || <span className="text-slate-300">—</span> },
  { key: "incoterm", title: "Incoterm", width: 90, render: (q) => q.data.incoterm || <span className="text-slate-300">—</span> },
  { key: "cargoReady", title: "Cargo ready", width: 120, render: (q) => q.data.readyDate || <span className="text-slate-300">—</span> },
  { key: "commodity", title: "Commodity", width: 130, render: (q) => q.data.commodity || <span className="text-slate-300">—</span> },
  { key: "packages", title: "Pkgs", width: 70, render: (q) => (q.data.packages?.length ? computeCargo(q.data).totalPackages : <span className="text-slate-300">—</span>) },
  { key: "weight", title: "Gross wt", width: 100, render: (q) => (q.data.packages?.length ? `${computeCargo(q.data).grossWeight} kg` : <span className="text-slate-300">—</span>) },
  { key: "cbm", title: "CBM", width: 90, render: (q) => (q.data.packages?.length ? `${computeCargo(q.data).cbm} m³` : <span className="text-slate-300">—</span>) },
  { key: "method", title: "Method", width: 90, render: (q) => q.data.method || <span className="text-slate-300">—</span> },
  { key: "shippingTerms", title: "Shipping terms", width: 130, render: (q) => q.data.shippingTerms || <span className="text-slate-300">—</span> },
  { key: "selling", title: "Selling", width: 120, render: (q) => fmt(computeTotals(q.data).selling, q.data.currency) },
  { key: "created", title: "Created", width: 110, render: (q) => (q.createdAt ? q.createdAt.slice(0, 10) : "—") },
  {
    key: "status",
    title: "Status",
    width: 130,
    render: (q) => {
      const s = QUOTE_STATUS_MAP[q.data.quoteStatus ?? ""];
      return s ? (
        <span className="rounded-xl text-[11px] font-medium px-2.5 py-0.5" style={{ backgroundColor: s.color.bg, color: s.color.text }}>
          {s.label}
        </span>
      ) : (
        "—"
      );
    },
  },
  {
    key: "daysOpen",
    title: "Days open",
    width: 110,
    render: (q) => {
      const d = daysOpen(q.data);
      if (d == null) return <span className="text-slate-300">—</span>;
      return (
        <span className="inline-flex items-center gap-1.5">
          {d}
          {needsFollowUp(q.data) && (
            <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">Follow up</span>
          )}
        </span>
      );
    },
  },
  {
    key: "validity",
    title: "Validity",
    width: 120,
    render: (q) => {
      const v = validityInfo(q.data);
      if (!v.date) return <span className="text-slate-300">—</span>;
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: v.expired ? "#dc2626" : "#16a34a" }} />
          {v.date}
        </span>
      );
    },
  },
];

// Text accessor per column, used by the per-column inline filters.
const colText: Record<string, (q: SalesQuote) => string> = {
  reference: (q) => q.quoteNumber,
  customer: (q) => q.data.customerName ?? "",
  service: (q) => q.data.serviceType ?? "",
  direction: (q) => q.data.direction ?? "",
  origin: (q) => q.data.origin ?? "",
  destination: (q) => q.data.destination ?? "",
  incoterm: (q) => q.data.incoterm ?? "",
  cargoReady: (q) => q.data.readyDate ?? "",
  commodity: (q) => q.data.commodity ?? "",
  packages: (q) => String(q.data.packages?.length ?? ""),
  weight: (q) => String(q.data.packages?.length ? computeCargo(q.data).grossWeight : ""),
  cbm: (q) => String(q.data.packages?.length ? computeCargo(q.data).cbm : ""),
  method: (q) => q.data.method ?? "",
  shippingTerms: (q) => q.data.shippingTerms ?? "",
  selling: (q) => String(computeTotals(q.data).selling),
  created: (q) => q.createdAt ?? "",
  status: (q) => QUOTE_STATUS_MAP[q.data.quoteStatus ?? ""]?.label ?? "",
  daysOpen: (q) => String(daysOpen(q.data) ?? ""),
  validity: (q) => validityInfo(q.data).date ?? "",
};

const DEFAULT_VISIBLE = ["reference", "customer", "service", "origin", "destination", "incoterm", "cargoReady", "created", "status"];

const BUILTIN_VIEWS: { id: string; label: string; apply: () => Filters }[] = [
  { id: "my_open", label: "My open quotes", apply: () => ({ statuses: ["draft", "ready_to_send"] }) },
  { id: "followup_today", label: "Follow-up today", apply: () => ({ statuses: [], followUpOnly: true }) },
  { id: "won_month", label: "Won this month", apply: () => ({ statuses: ["won"] }) },
  { id: "lost_month", label: "Lost this month", apply: () => ({ statuses: ["lost"] }) },
  { id: "drafts", label: "Drafts to finish", apply: () => ({ statuses: ["draft"] }) },
];

export function QuoteHistoryTab() {
  const router = useRouter();
  const { salesQuotes, isLoading, updateQuoteData } = useSalesQuotes();
  const { value: visibleKeys, setValue: setVisibleKeys } = useSalesPref<string[]>("qh_cols", DEFAULT_VISIBLE);
  const { value: savedViews, setValue: setSavedViews } = useSalesPref<SavedView[]>("saved_views", []);
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<SalesQuote | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [showColFilters, setShowColFilters] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  const filtered = useMemo(() => {
    let rows = [...salesQuotes];
    if (filters.statuses.length) rows = rows.filter((q) => filters.statuses.includes(q.data.quoteStatus ?? ""));
    if (filters.serviceType) rows = rows.filter((q) => q.data.serviceType === filters.serviceType);
    if (filters.direction) rows = rows.filter((q) => q.data.direction === filters.direction);
    if (filters.dateFrom) rows = rows.filter((q) => (q.createdAt ?? "") >= filters.dateFrom!);
    if (filters.dateTo) rows = rows.filter((q) => (q.createdAt ?? "").slice(0, 10) <= filters.dateTo!);
    if (filters.followUpOnly) rows = rows.filter((q) => needsFollowUp(q.data));
    for (const [k, val] of Object.entries(colFilters)) {
      if (!val) continue;
      const acc = colText[k];
      if (acc) rows = rows.filter((q) => acc(q).toLowerCase().includes(val.toLowerCase()));
    }
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((q) => {
        const d = q.data;
        return [q.quoteNumber, d.customerName, d.quoteStatus, d.serviceType, d.origin, d.destination, d.commodity, d.incoterm]
          .some((v) => (v ?? "").toString().toLowerCase().includes(s));
      });
    }
    return rows;
  }, [salesQuotes, filters, search, colFilters]);

  const columns: ColumnsType<SalesQuote> = useMemo(() => {
    const ordered = visibleKeys
      .map((k) => COLUMN_DEFS.find((c) => c.key === k))
      .filter((c): c is ColDef => !!c);
    const cols: ColumnsType<SalesQuote> = ordered.map((c) => ({
      title: showColFilters ? (
        <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
          <div>{c.title}</div>
          <Input
            size="small"
            allowClear
            placeholder="Filter…"
            value={colFilters[c.key] ?? ""}
            onChange={(e) => setColFilters((f) => ({ ...f, [c.key]: e.target.value }))}
          />
        </div>
      ) : (
        c.title
      ),
      key: c.key,
      width: c.width,
      onHeaderCell: () => ({ id: c.key }) as React.HTMLAttributes<HTMLTableCellElement>,
      render: (_: unknown, record: SalesQuote) => c.render(record),
    }));
    // Leading validity indicator: red = offer expired, green = still valid, grey = no validity date.
    cols.unshift({
      title: (
        <Tooltip title="Validity status">
          <span className="text-slate-300">●</span>
        </Tooltip>
      ),
      key: "validity",
      width: 40,
      align: "center",
      render: (_: unknown, record: SalesQuote) => {
        const v = validityInfo(record.data);
        const color = v.date === null ? "#d1d5db" : v.expired ? "#ef4444" : "#22c55e";
        const ring = v.date === null ? undefined : v.expired ? "#fee2e2" : "#dcfce7";
        const title = v.date === null ? "No validity date set" : v.expired ? `Expired: ${v.date}` : `Valid until: ${v.date}`;
        return (
          <Tooltip title={title}>
            <span
              className="inline-block w-2.5 h-2.5 rounded-full align-middle"
              style={{ backgroundColor: color, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}
            />
          </Tooltip>
        );
      },
    });
    cols.push({
      title: "",
      key: "action",
      width: 130,
      fixed: "right",
      render: (_: unknown, record: SalesQuote) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button size="small" type="text" icon={<EyeOutlined />} title="Preview PDF" onClick={() => setPreview(record)} />
          <Button size="small" type="text" icon={<FilePdfOutlined />} title="Download PDF" onClick={() => printQuote(record.quoteNumber, record.data)} />
          <Button size="small" type="link" onClick={() => router.push(`/sales/quote/${record.quoteNumber}`)}>
            Open
          </Button>
        </div>
      ),
    });
    return cols;
  }, [visibleKeys, router, showColFilters, colFilters]);

  // Drag-to-reorder columns (same interaction as the shipments table).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = visibleKeys.indexOf(String(active.id));
    const newIndex = visibleKeys.indexOf(String(over.id));
    if (oldIndex !== -1 && newIndex !== -1) setVisibleKeys(arrayMove(visibleKeys, oldIndex, newIndex));
  };

  // Bulk lifecycle helpers operating on the selected quotes.
  const patchSelected = async (mutate: (d: SalesQuoteData) => SalesQuoteData, label: string) => {
    const set = new Set(selectedKeys.map(String));
    const targets = salesQuotes.filter((q) => set.has(q.quoteNumber));
    await Promise.all(targets.map((q) => updateQuoteData({ quoteNumber: q.quoteNumber, data: mutate({ ...q.data }) })));
    toast.success(`${label} ${targets.length} quote(s)`);
    setSelectedKeys([]);
  };
  const bulkAssignOwner = async () => {
    const owner = typeof window !== "undefined" ? window.prompt("Assign sales owner to selected quotes:") : "";
    if (!owner) return;
    await patchSelected((d) => ({ ...d, salesOwner: owner }), "Assigned owner on");
  };
  const bulkStatus = (status: string) =>
    patchSelected(
      (d) => ({ ...d, quoteStatus: status, winProbability: QUOTE_STATUS_MAP[status]?.winProbability ?? d.winProbability }),
      `Set ${QUOTE_STATUS_MAP[status]?.label ?? status} on`,
    );

  const bulkExport = () => {
    const set = new Set(selectedKeys.map(String));
    exportQuotesCsv(filtered.filter((q) => set.has(q.quoteNumber)));
  };

  const toggleColumn = (key: string) => {
    if (visibleKeys.includes(key)) setVisibleKeys(visibleKeys.filter((k) => k !== key));
    else setVisibleKeys([...visibleKeys, key]);
  };
  const moveColumn = (key: string, dir: -1 | 1) => {
    const idx = visibleKeys.indexOf(key);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= visibleKeys.length) return;
    const next = [...visibleKeys];
    const a = next[idx];
    const b = next[target];
    if (a === undefined || b === undefined) return;
    next[idx] = b;
    next[target] = a;
    setVisibleKeys(next);
  };

  const applyBuiltin = (id: string) => {
    const v = BUILTIN_VIEWS.find((b) => b.id === id);
    if (v) setFilters(v.apply());
  };
  const applySaved = (id: string) => {
    const v = savedViews.find((s) => s.id === id);
    if (v) {
      setFilters(v.filters);
      setSearch(v.search);
    }
  };
  const saveCurrentView = () => {
    if (!newViewName.trim()) return;
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(filtered.length + savedViews.length);
    setSavedViews([...savedViews, { id, label: newViewName.trim(), search, filters }]);
    setNewViewName("");
    setSaveViewOpen(false);
    toast.success("View saved");
  };
  const deleteSaved = (id: string) => setSavedViews(savedViews.filter((s) => s.id !== id));

  // Active filter chips
  const chips: { label: string; clear: () => void }[] = [];
  filters.statuses.forEach((s) =>
    chips.push({ label: QUOTE_STATUS_MAP[s]?.label ?? s, clear: () => setFilters((f) => ({ ...f, statuses: f.statuses.filter((x) => x !== s) })) }),
  );
  if (filters.serviceType) chips.push({ label: filters.serviceType, clear: () => setFilters((f) => ({ ...f, serviceType: undefined })) });
  if (filters.direction) chips.push({ label: filters.direction, clear: () => setFilters((f) => ({ ...f, direction: undefined })) });
  if (filters.followUpOnly) chips.push({ label: "Needs follow-up", clear: () => setFilters((f) => ({ ...f, followUpOnly: false })) });
  if (filters.dateFrom || filters.dateTo) chips.push({ label: `${filters.dateFrom ?? "…"} → ${filters.dateTo ?? "…"}`, clear: () => setFilters((f) => ({ ...f, dateFrom: undefined, dateTo: undefined })) });

  const columnPicker = (
    <div className="w-56">
      <div className="text-xs font-semibold text-slate-500 mb-2">Columns</div>
      <div className="space-y-1 max-h-72 overflow-auto">
        {COLUMN_DEFS.map((c) => {
          const visible = visibleKeys.includes(c.key);
          return (
            <div key={c.key} className="flex items-center justify-between gap-2">
              <Checkbox checked={visible} onChange={() => toggleColumn(c.key)}>
                <span className="text-[13px]">{c.title}</span>
              </Checkbox>
              {visible && (
                <span className="flex gap-0.5">
                  <Button type="text" size="small" icon={<UpOutlined className="text-[10px]" />} onClick={() => moveColumn(c.key, -1)} />
                  <Button type="text" size="small" icon={<DownOutlined className="text-[10px]" />} onClick={() => moveColumn(c.key, 1)} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const filterPanel = (
    <div className="w-64 space-y-3">
      <div>
        <div className="text-xs text-slate-500 mb-1">Status</div>
        <Select
          mode="multiple"
          allowClear
          className="w-full"
          size="small"
          placeholder="Any"
          value={filters.statuses}
          onChange={(v) => setFilters((f) => ({ ...f, statuses: v }))}
          options={QUOTE_STATUSES.map((s) => ({ value: s.key, label: s.label }))}
        />
      </div>
      <div>
        <div className="text-xs text-slate-500 mb-1">Service type</div>
        <Select
          allowClear
          className="w-full"
          size="small"
          placeholder="Any"
          value={filters.serviceType}
          onChange={(v) => setFilters((f) => ({ ...f, serviceType: v }))}
          options={SERVICE_TYPES.map((s) => ({ value: s, label: s }))}
        />
      </div>
      <div>
        <div className="text-xs text-slate-500 mb-1">Direction</div>
        <Select
          allowClear
          className="w-full"
          size="small"
          placeholder="Any"
          value={filters.direction}
          onChange={(v) => setFilters((f) => ({ ...f, direction: v }))}
          options={DIRECTIONS.map((s) => ({ value: s, label: s }))}
        />
      </div>
      <div>
        <div className="text-xs text-slate-500 mb-1">Created between</div>
        <DatePicker.RangePicker
          size="small"
          className="w-full"
          onChange={(_, strs) => setFilters((f) => ({ ...f, dateFrom: strs[0] || undefined, dateTo: strs[1] || undefined }))}
        />
      </div>
      <Checkbox checked={!!filters.followUpOnly} onChange={(e) => setFilters((f) => ({ ...f, followUpOnly: e.target.checked }))}>
        <span className="text-[13px]">Overdue follow-up only</span>
      </Checkbox>
      <Button size="small" block onClick={() => setFilters(EMPTY_FILTERS)}>
        Clear filters
      </Button>
    </div>
  );

  const viewsMenuItems = [
    { key: "builtin-header", type: "group" as const, label: "Built-in views", children: BUILTIN_VIEWS.map((v) => ({ key: `b:${v.id}`, label: v.label })) },
    ...(savedViews.length
      ? [{ key: "saved-header", type: "group" as const, label: "Saved views", children: savedViews.map((v) => ({ key: `s:${v.id}`, label: v.label })) }]
      : []),
  ];

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-3">
        <Input
          placeholder="Search quotes…"
          prefix={<SearchOutlined className="text-slate-400" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          className="w-56"
        />
        <Dropdown menu={{ items: viewsMenuItems, onClick: ({ key }) => (key.startsWith("b:") ? applyBuiltin(key.slice(2)) : applySaved(key.slice(2))) }}>
          <Button>Saved views</Button>
        </Dropdown>
        <Popover content={filterPanel} trigger="click" placement="bottomLeft" title="Filters">
          <Button icon={<FilterOutlined />}>Filters</Button>
        </Popover>
        <Popover content={columnPicker} trigger="click" placement="bottomLeft">
          <Button icon={<SettingOutlined />}>Columns</Button>
        </Popover>
        <Button
          icon={<FilterOutlined />}
          type={showColFilters ? "primary" : "default"}
          onClick={() => setShowColFilters((v) => !v)}
        >
          Column filters
        </Button>
        <Button icon={<DownloadOutlined />} onClick={() => exportQuotesCsv(filtered)}>
          CSV
        </Button>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setSaveViewOpen(true)}>Save view</Button>
          <NewQuoteButton />
        </div>
      </div>

      {/* Chips */}
      {(chips.length > 0 || savedViews.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {chips.map((chip, i) => (
            <Tag key={i} closable onClose={chip.clear} className="rounded-xl">
              {chip.label}
            </Tag>
          ))}
          {savedViews.map((v) => (
            <Tag key={v.id} className="rounded-xl cursor-pointer" onClick={() => applySaved(v.id)}>
              {v.label}
              <CloseOutlined
                className="ml-1 text-[10px]"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSaved(v.id);
                }}
              />
            </Tag>
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedKeys.length > 0 && (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-2.5 mb-3">
          <span className="text-sm text-indigo-700 font-medium">{selectedKeys.length} selected</span>
          <Dropdown
            menu={{
              items: [
                { key: "owner", label: "Assign owner…", onClick: bulkAssignOwner },
                { type: "divider" as const },
                ...QUOTE_STATUSES.map((s) => ({ key: `st:${s.key}`, label: `Set status: ${s.label}`, onClick: () => bulkStatus(s.key) })),
              ],
            }}
          >
            <Button size="small">Actions</Button>
          </Dropdown>
          <Button size="small" icon={<DownloadOutlined />} onClick={bulkExport}>
            Export CSV
          </Button>
          <Button size="small" type="text" onClick={() => setSelectedKeys([])}>
            Clear
          </Button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visibleKeys} strategy={horizontalListSortingStrategy}>
          <DataTable<SalesQuote>
            dataSource={filtered}
            columns={columns}
            rowKey="quoteNumber"
            loading={isLoading}
            scroll={{ x: "max-content" }}
            components={{ header: { cell: DraggableHeaderCell } }}
            resetKey={`${search}${JSON.stringify(filters)}${JSON.stringify(colFilters)}`}
            locale={{ emptyText: "No quotes match" }}
            rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
            onRow={(record) => ({
              onClick: () => router.push(`/sales/quote/${record.quoteNumber}`),
              className: "cursor-pointer",
            })}
          />
        </SortableContext>
      </DndContext>

      <Modal
        open={saveViewOpen}
        onCancel={() => setSaveViewOpen(false)}
        onOk={saveCurrentView}
        title="Save current view"
        okText="Save"
        destroyOnHidden
      >
        <div className="pt-2">
          <div className="text-xs text-slate-500 mb-1">View name</div>
          <Input value={newViewName} onChange={(e) => setNewViewName(e.target.value)} onPressEnter={saveCurrentView} placeholder="e.g. Hot leads" />
        </div>
      </Modal>

      {preview && <PdfPreviewModal open quoteNumber={preview.quoteNumber} data={preview.data} onClose={() => setPreview(null)} />}
    </div>
  );
}
