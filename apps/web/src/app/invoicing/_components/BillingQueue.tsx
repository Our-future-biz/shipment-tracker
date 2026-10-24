"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Alert, Drawer, Input, Select, Tooltip } from "antd";
import { ClearOutlined, EditOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import type { interfaces } from "@/lib/api/client";
import { DataTable } from "@/components/DataTable";
import { PillTabs } from "@/components/SectionCard";
import { ListCapNotice } from "@/components/ListCapNotice";
import { DraggableHeaderCell } from "@/components/DraggableHeaderCell";
import { ColumnFiltersPopover, type StoredFilter } from "@/components/ColumnFiltersPopover";
import { ColumnPickerPopover } from "@/components/ColumnPickerPopover";
import { TOOLBAR_BUTTON_CLASS, storedGridFilters, withFilterId, type GridFilter } from "@/components/gridFilters";
import { btnPrimary } from "@/components/buttons";
import { useDebounced } from "@/hooks/useDebounced";
import { useInvoiceQueue, type BillingQueueView } from "@/hooks/useInvoiceQueue";
import { useColumnPrefs, type ColumnViewScope } from "@/hooks/useColumnPrefs";
import { useColumnTemplates } from "@/hooks/useColumnTemplates";
import { useFilterTemplates } from "@/hooks/useFilterTemplates";
import { useAuth } from "@/lib/auth/AuthContext";
import { filtersFromSearchParams, writeFiltersToSearchParams } from "@/lib/filterSearchParams";
import { statusLabel } from "@/lib/shipmentStatus";
import {
  FIRST_QUEUE_COLUMN,
  NO_CUSTOMER,
  QUEUE_COLUMN_META,
  QUEUE_DEFAULT_COLUMNS,
  arrangeQueueColumns,
  filterQueueRows,
  isQueueColumn,
  normalizeQueueColumns,
} from "../_lib/queueColumnModel";
import { queueColumns, queueRowInfo, type QueueRow } from "./queueColumns";
import { CreateInvoiceModal } from "./CreateInvoiceModal";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DocumentsPanel } from "@/app/shipments/_components/DocumentsPanel";
import { ChatPanel } from "@/app/shipments/_components/ChatPanel";

type View = BillingQueueView;
const VIEWS = ["all", "to_bill", "not_invoiced", "invoiced"] as const satisfies readonly View[];
const VIEW_COUNT: Record<View, keyof interfaces.BillingQueueCounts> = {
  all: "all",
  to_bill: "toBill",
  not_invoiced: "notInvoiced",
  invoiced: "invoiced",
};
const DEFAULT_VIEW: View = "all";
type QueueParam = "queue" | "q" | "dir" | "status" | "customer";

// The user's columns and their order, kept per user in this browser as on Shipments; templates on the server.
const INVOICING_SCOPE = "invoicing";
const INVOICING_COLUMN_VIEW: ColumnViewScope = { scope: INVOICING_SCOPE, defaults: QUEUE_DEFAULT_COLUMNS };
const FIXED_QUEUE_COLUMNS = [FIRST_QUEUE_COLUMN];

// The values the loaded rows carry, so no option leads to an empty list.
const distinctOptions = (values: string[]) =>
  Array.from(new Set(values.filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "cs"))
    .map((value) => ({ value, label: value }));

const label = (text: string, n: number | undefined) => (n === undefined ? text : `${text} (${n})`);

interface BillingQueueProps {
  onOpen: (shipmentId: string) => void;
}

/**
 * The first Invoicing page: the queue. Which jobs a tab lists comes from the shipment itself:
 * "To bill" are the jobs operations set to Shipment Status "Billing"; "Not invoiced" / "Invoiced"
 * follow the Invoicing Status. The tab, search and filters are kept in the URL, so Back from a
 * job returns to the queue as it was left.
 */
export function BillingQueue({ onOpen }: BillingQueueProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const get = (k: QueueParam) => searchParams.get(k) ?? "";
  const rawView = get("queue");
  // the default tab is left out of the URL; anything unknown reads as the default
  const view: View = (VIEWS as readonly string[]).includes(rawView) ? (rawView as View) : DEFAULT_VIEW;
  const dir = get("dir");
  const status = get("status");
  const customer = get("customer");

  // The one writer of the queue's URL (tab, search, filters), so no change can undo another.
  // history.replaceState changes the URL at once - Next keeps useSearchParams in step with it,
  // without a server round trip per keystroke - and each write starts from the URL as it is now,
  // not from the last render: a tab click right after typing keeps what was typed.
  const writeUrl = (change: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(window.location.search);
    change(p);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };
  const setParams = (patch: Partial<Record<QueueParam, string>>) =>
    writeUrl((p) => {
      for (const [k, v] of Object.entries(patch)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
    });
  const setView = (next: View) => setParams({ queue: next === DEFAULT_VIEW ? "" : next });

  // The box keeps what is typed; it follows the URL when that changes from outside (Back, or the
  // Invoicing menu item, which opens the page with no search).
  const urlQuery = get("q");
  const [query, setQuery] = useState(urlQuery);
  const lastWritten = useRef(urlQuery);
  useEffect(() => {
    if (urlQuery === lastWritten.current) return;
    lastWritten.current = urlQuery;
    setQuery(urlQuery);
  }, [urlQuery]);
  // search runs on the server (across all shipments), so wait until typing pauses
  const debounced = useDebounced(urlQuery.trim(), 300);
  const { rows, counts, truncated, hasData, isFetching, isError } = useInvoiceQueue(view, debounced);
  const [createOpen, setCreateOpen] = useState(false);
  // The row's Documents and Chat drawers, as on Shipments
  const [docsJob, setDocsJob] = useState<{ id: string; jobNumber: string } | null>(null);
  const [chatJob, setChatJob] = useState<{ id: string; jobNumber: string } | null>(null);
  // Unread chat messages per shipment, for the red badge on the chat icon (same query as Shipments)
  const { data: unreadData } = useQuery({
    queryKey: ["shipment-comments", "unread"],
    queryFn: () => api.shipments.commentUnread(),
    refetchInterval: 30000,
  });
  const unreadBy = useMemo(() => new Map((unreadData?.unread ?? []).map((u) => [u.shipmentId, u.unread])), [unreadData]);
  // Ticked rows, as on Shipments; kept per tab, so another tab starts with nothing ticked.
  const [selection, setSelection] = useState<{ view: View; keys: React.Key[] }>({ view, keys: [] });
  const selectedKeys = selection.view === view ? selection.keys : [];
  const setSelectedKeys = (keys: React.Key[]) => setSelection({ view, keys });

  // "Filter by column" rows, as on Customer Database: kept here as typed and copied to the URL as
  // ?f.<column>=<value> (one parameter per filter), so they survive opening a job and coming back.
  const urlFilters = useMemo(() => filtersFromSearchParams(searchParams, isQueueColumn), [searchParams]);
  const [shownFilters, setShownFilters] = useState<GridFilter[]>(() => urlFilters.map(withFilterId));
  // The ?f. part this page last wrote; only a change from elsewhere (Back, a link) replaces the rows.
  const writtenFilters = useRef(JSON.stringify(urlFilters));
  useEffect(() => {
    const fromUrl = JSON.stringify(urlFilters);
    if (fromUrl === writtenFilters.current) return;
    writtenFilters.current = fromUrl;
    setShownFilters(urlFilters.map(withFilterId));
  }, [urlFilters]);
  const activeFilters = useMemo(() => storedGridFilters(shownFilters), [shownFilters]);

  const handleFiltersChange = (next: GridFilter[]) => {
    setShownFilters(next);
    const active = storedGridFilters(next);
    writtenFilters.current = JSON.stringify(active);
    writeUrl((p) => writeFiltersToSearchParams(p, active));
  };

  // Columns shown and their order (per user, this browser), column templates (auth service) and
  // filter templates (user preferences), each under the "invoicing" scope.
  const { user, token } = useAuth();
  const columnPrefs = useColumnPrefs(user?.id, INVOICING_COLUMN_VIEW);
  const columnTemplates = useColumnTemplates(user?.id, token, INVOICING_SCOPE);
  const filterTemplates = useFilterTemplates(INVOICING_SCOPE);
  const visibleColumns = useMemo(() => normalizeQueueColumns(columnPrefs.visible), [columnPrefs.visible]);
  // Nothing is saved before the user is known: the layout is stored per user.
  const columnsReady = !!user?.id;

  const handleColumnsChange = (keys: string[]) => {
    if (!columnsReady) return;
    columnPrefs.save(normalizeQueueColumns(keys));
  };

  // Normalized, so a template shows as chosen when it equals the columns shown.
  const knownColumnTemplates = columnTemplates.templates.map((t) => ({ ...t, columns: normalizeQueueColumns(t.columns) }));
  const handleSaveColumnTemplate = async (name: string) => {
    // The server tells names apart by case: an existing one keeps its spelling, so no near-duplicate is added.
    const existing = columnTemplates.templates.find((t) => t.name.toLowerCase() === name.toLowerCase());
    const saved = await columnTemplates.createTemplate(existing?.name ?? name, visibleColumns);
    if (!saved) throw new Error("Not signed in");
  };

  // A saved filter on a column the queue no longer has is dropped, not left to empty the list.
  const knownFilterTemplates = useMemo(
    () => filterTemplates.templates.map((t) => ({ ...t, filters: t.filters.filter((f) => isQueueColumn(f.key)) })),
    [filterTemplates.templates],
  );
  const handleSaveFilterTemplate = async (name: string, filters: StoredFilter[]) => {
    await filterTemplates.saveTemplate(name, filters);
  };

  // Reordering the columns: the pencil turns it on, and the column headers can then be dragged.
  const [reordering, setReordering] = useState(false);
  // A drag starts after a few pixels, so a plain click on a header still sorts.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = visibleColumns.indexOf(String(active.id));
    const to = visibleColumns.indexOf(String(over.id));
    // Internal Reference stays first: nothing moves before it.
    if (from === -1 || to <= 0) return;
    handleColumnsChange(arrayMove(visibleColumns, from, to));
  };

  const jobHref = (id: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("shipment", id);
    return `${pathname}?${p.toString()}`;
  };

  // Options from all loaded rows of the tab, so they stay while another filter is set.
  const directionOptions = useMemo(() => distinctOptions(rows.map((r) => r.tradeDirection)), [rows]);
  const statusOptions = useMemo(() => distinctOptions(rows.map((r) => statusLabel(r.shipmentStatus))), [rows]);
  const customerOptions = useMemo(
    () => [
      ...distinctOptions(rows.map((r) => r.customer)),
      ...(rows.some((r) => !r.customer) ? [{ value: NO_CUSTOMER, label: "No customer" }] : []),
    ],
    [rows],
  );
  // The filter panel's columns: Shipment Status offers the statuses of the loaded rows, like its select.
  const filterColumns = useMemo(
    () => QUEUE_COLUMN_META.map((c) => (c.key === "status" ? { ...c, options: statusOptions.map((o) => o.value) } : c)),
    [statusOptions],
  );

  // Missing selling lines are flagged only where the job waits to be invoiced (To bill).
  const flagMissingLines = view === "to_bill";
  // The server search decides which rows are loaded; the selects and the column filters narrow those here.
  // Stale rows are not shown after an error.
  const shown = useMemo(
    () => (isError ? [] : filterQueueRows(rows, { dir, status, customer, columnFilters: activeFilters, flagMissingLines })),
    [rows, isError, dir, status, customer, activeFilters, flagMissingLines],
  );
  const info = useMemo(() => queueRowInfo(shown), [shown]);

  const hasListFilters = !!dir || !!status || !!customer || activeFilters.length > 0;
  const viewCount = counts?.[VIEW_COUNT[view]];

  const clearFilters = () => {
    setShownFilters([]);
    writtenFilters.current = "[]";
    writeUrl((p) => {
      p.delete("dir");
      p.delete("status");
      p.delete("customer");
      writeFiltersToSearchParams(p, []);
    });
  };

  const columns = arrangeQueueColumns(queueColumns({
      info,
      jobHref,
      onDocs: (r) => setDocsJob({ id: r.shipmentId, jobNumber: r.jobNumber }),
      onChat: (r) => setChatJob({ id: r.shipmentId, jobNumber: r.jobNumber }),
      unreadBy,
    }), visibleColumns, reordering);

  let emptyText =
    view === "to_bill" ? "No jobs to bill — a job appears here when its Shipment Status is set to Billing." : "No shipments here.";
  if (debounced || hasListFilters) emptyText = "No shipments match these filters.";
  if (isFetching) emptyText = "Loading the queue…";
  if (isError) emptyText = "Could not load the invoicing queue.";

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Invoicing</h1>
          </div>
          <div role="group" aria-label="Invoicing stage">
            <PillTabs<View>
              tabs={[
                { key: "all", label: label("All shipments", counts?.all) },
                { key: "to_bill", label: label("To bill", counts?.toBill) },
                { key: "not_invoiced", label: label("Not invoiced", counts?.notInvoiced) },
                { key: "invoiced", label: label("Invoiced", counts?.invoiced) },
              ]}
              active={view}
              onChange={setView}
            />
          </div>
        </div>

        {/* Toolbar: the action on the left, finding things on the right. */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <button type="button" onClick={() => setCreateOpen(true)} className={btnPrimary}>
              <PlusOutlined />
              Create invoice
            </button>
          </div>
          {/* It wraps on narrow screens, kept to the right; the square buttons wrap together as one block. */}
          <div className="flex flex-wrap items-center justify-end gap-3 ml-auto">
            {/* antd gives the input width: 100% outside Tailwind's layers, hence the important flag */}
            <Input
              placeholder="Search shipments..."
              aria-label="Search shipments"
              prefix={<SearchOutlined className="text-slate-400" />}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                lastWritten.current = e.target.value;
                setParams({ q: e.target.value });
              }}
              allowClear
              className="!w-60"
            />
            <div className="w-px h-6 bg-slate-200 shrink-0" />
            <Select
              value={dir || undefined}
              onChange={(v?: string) => setParams({ dir: v ?? "" })}
              options={directionOptions}
              placeholder="All directions"
              aria-label="Trade direction"
              allowClear
              className="w-36"
            />
            <Select
              value={status || undefined}
              onChange={(v?: string) => setParams({ status: v ?? "" })}
              options={statusOptions}
              placeholder="All statuses"
              aria-label="Shipment status"
              allowClear
              showSearch
              optionFilterProp="label"
              popupMatchSelectWidth={false}
              className="w-40"
            />
            <Select
              value={customer || undefined}
              onChange={(v?: string) => setParams({ customer: v ?? "" })}
              options={customerOptions}
              placeholder="All customers"
              aria-label="Customer"
              allowClear
              showSearch
              optionFilterProp="label"
              popupMatchSelectWidth={false}
              className="w-40"
            />
            <div className="flex items-center gap-3 shrink-0">
              {/* A square button, not a text link: at 1440px the toolbar then stays on one row when a filter is
                  set, so the open Filters panel never jumps away from its button. */}
              {hasListFilters && (
                <Tooltip title="Clear filters">
                  <button
                    type="button"
                    aria-label="Clear filters"
                    onClick={clearFilters}
                    className={`${TOOLBAR_BUTTON_CLASS} cursor-pointer`}
                  >
                    <ClearOutlined />
                  </button>
                </Tooltip>
              )}
              <ColumnFiltersPopover
                filters={shownFilters}
                onChange={handleFiltersChange}
                columns={filterColumns}
                templates={knownFilterTemplates}
                onSaveTemplate={handleSaveFilterTemplate}
                onDeleteTemplate={filterTemplates.deleteTemplate}
                isSaving={filterTemplates.isSaving}
                defaultColumn={FIRST_QUEUE_COLUMN}
              />
              <ColumnPickerPopover
                columns={QUEUE_COLUMN_META}
                fixedKeys={FIXED_QUEUE_COLUMNS}
                allKeys={QUEUE_DEFAULT_COLUMNS}
                visible={visibleColumns}
                onChange={handleColumnsChange}
                templates={knownColumnTemplates}
                onSaveTemplate={handleSaveColumnTemplate}
                onDeleteTemplate={columnTemplates.deleteTemplate}
                ready={columnsReady}
              />
              <Tooltip title={reordering ? "Done reordering" : "Reorder columns"}>
                <button
                  type="button"
                  aria-label="Reorder columns"
                  aria-pressed={reordering}
                  disabled={!columnsReady}
                  onClick={() => setReordering((on) => !on)}
                  className={
                    reordering
                      ? "flex items-center justify-center shrink-0 rounded-lg border w-8 h-8 p-0 transition-colors cursor-pointer border-indigo-500 bg-indigo-50 text-indigo-600"
                      : `${TOOLBAR_BUTTON_CLASS} cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`
                  }
                >
                  <EditOutlined />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>

        {reordering && (
          <div className="-mt-2 rounded-lg bg-indigo-50 px-4 py-2 text-[13px] text-indigo-700">
            Drag the column headers to change their order. Internal Reference stays first. Click the pencil again when
            you are done.
          </div>
        )}

        {isError && <Alert type="error" showIcon message="Could not load the invoicing queue." />}
        {truncated && viewCount !== undefined && (
          // The selects narrow only the rows loaded here; only the server search reaches older jobs.
          <ListCapNotice
            shown={rows.length}
            total={viewCount}
            noun="shipments"
            hint="use the search to find older ones; the filters apply to the shipments shown"
          />
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleColumns} strategy={horizontalListSortingStrategy}>
            <DataTable<QueueRow>
              components={reordering ? { header: { cell: DraggableHeaderCell } } : undefined}
              // no rows yet or a failed request: the footer then states no count
              dataSource={hasData && !isError ? shown : undefined}
              columns={columns}
              rowKey="shipmentId"
              rowSelection={{
                selectedRowKeys: selectedKeys,
                onChange: setSelectedKeys,
                preserveSelectedRowKeys: true,
                fixed: true,
                columnWidth: 44,
              }}
              loading={isFetching}
              scroll={{ x: "max-content" }}
              resetKey={`${view}|${debounced}|${dir}|${status}|${customer}|${JSON.stringify(activeFilters)}`}
              locale={{ emptyText }}
              rowClassName={(r) => (info.get(r.shipmentId)?.rowStyle?.color ? "cf-row-fg" : "")}
              onRow={(r) => {
                const fg = info.get(r.shipmentId)?.rowStyle?.color;
                return {
                  // a click on the tick box ticks the row; anywhere else opens the job
                  onClick: (e: React.MouseEvent) => {
                    if ((e.target as HTMLElement).closest(".ant-table-selection-column")) return;
                    onOpen(r.shipmentId);
                  },
                  className: "cursor-pointer",
                  ...(fg ? { style: { "--cf-row-fg": fg } as React.CSSProperties } : {}),
                };
              }}
            />
          </SortableContext>
        </DndContext>

        <Drawer
          open={!!docsJob}
          onClose={() => setDocsJob(null)}
          width={480}
          destroyOnHidden
          styles={{ body: { padding: 0 } }}
          title={docsJob ? `Documents — ${docsJob.jobNumber}` : "Documents"}
        >
          {docsJob && <DocumentsPanel shipmentId={docsJob.id} />}
        </Drawer>
        {/* Chat — the shipment's internal conversation; opening it marks it read. */}
        <Drawer
          open={!!chatJob}
          onClose={() => setChatJob(null)}
          width={460}
          destroyOnHidden
          styles={{ body: { padding: 0 } }}
          title={chatJob ? `Chat — ${chatJob.jobNumber}` : "Chat"}
        >
          {chatJob && <ChatPanel shipmentId={chatJob.id} />}
        </Drawer>
        <CreateInvoiceModal open={createOpen} onClose={() => setCreateOpen(false)} onSelect={onOpen} />
      </div>
    </div>
  );
}
