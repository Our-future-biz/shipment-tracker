"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Modal, Segmented, Select, Spin, Tooltip } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { useWarehouse } from "@/hooks/useWarehouse";
import { useGateLog, type GateMovement } from "@/hooks/useGateLog";
import { useStockLines } from "@/hooks/useWarehouseRecords";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/lib/toast";
import { formatDate } from "@/lib/date";
import { api } from "@/lib/api";
import { isSalesQuote, toSalesQuote } from "@/app/sales/_lib/salesQuote";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import type { controllers, interfaces } from "@/lib/api/client";
import { CUSTOMS_STATUSES, HANDLINGS, errorMessage, isFcl, isLcl, nf } from "../gate-log/_lib/gate";
import { ContainersTab } from "./tabs/ContainersTab";
import { StockTab } from "./tabs/StockTab";
import { DockYardTab } from "./tabs/DockYardTab";
import { ReportsTab } from "./tabs/ReportsTab";
import { ReadmeTab } from "./tabs/ReadmeTab";

// The Warehouse module works only with its own data: a position (WCZ reference) and the
// record on its gate movement. Shipment or quote values are copied in once, when the
// position is recorded ("Create new"); nothing reads from or writes to Shipments afterwards.

type WarehouseTask = interfaces.WarehouseTaskItem;
type PositionRow = { task: WarehouseTask; m: GateMovement | undefined };
type LoadFilter = "fcl" | "lcl";

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const dim = (v: string | undefined) => (v ? <span className="text-slate-600">{v}</span> : <span className="text-slate-300">—</span>);
const mono = (v: string | undefined) => (v ? <span className="text-slate-600 font-mono">{v}</span> : <span className="text-slate-300">—</span>);
const numCell = (v: string) => (v ? <span className="text-slate-600 tabular-nums">{v}</span> : <span className="text-slate-300">—</span>);
const textCol = (key: keyof GateMovement & string, title: string, width: number, extra: Partial<AppGridColumn<PositionRow>> = {}): AppGridColumn<PositionRow> => ({
  key,
  title,
  width,
  text: (r) => String(r.m?.[key] ?? ""),
  render: (_, r) => dim(String(r.m?.[key] ?? "")),
  ...extra,
});

const POSITION_COLUMNS: AppGridColumn<PositionRow>[] = [
  { key: "taskId", title: "Warehouse Ref", width: 150, text: (r) => r.task.taskId, render: (_, r) => <span className="font-mono font-bold text-indigo-500">{r.task.taskId}</span> },
  { key: "jobNumber", title: "Job Number", width: 140, text: (r) => r.m?.jobNumber ?? "", render: (_, r) => mono(r.m?.jobNumber) },
  textCol("customer", "Customer", 200),
  textCol("customerRef", "Customer Reference", 160),
  textCol("handling", "Trade Direction", 130, { filterOptions: [...HANDLINGS] }),
  textCol("freightMode", "Freight Mode", 130),
  textCol("loadType", "Load Type", 140),
  textCol("status", "Status", 120),
  textCol("customsStatus", "Customs Status", 230, { filterOptions: [...CUSTOMS_STATUSES] }),
  textCol("pol", "POL", 110),
  textCol("pod", "POD", 110),
  { key: "etd", title: "ETD", width: 110, text: (r) => formatDate(r.m?.etd), render: (_, r) => dim(formatDate(r.m?.etd)) },
  { key: "eta", title: "ETA", width: 110, text: (r) => formatDate(r.m?.eta), render: (_, r) => dim(formatDate(r.m?.eta)) },
  { key: "colli", title: "Pieces", width: 90, align: "right", text: (r) => (r.m?.colli ? String(r.m.colli) : ""), render: (_, r) => numCell(r.m?.colli ? nf(r.m.colli) : "") },
  textCol("packing", "Type Of Packages", 150),
  { key: "weightKg", title: "Weight kg", width: 110, align: "right", text: (r) => (r.m?.weightKg ? String(r.m.weightKg) : ""), render: (_, r) => numCell(r.m?.weightKg ? nf(r.m.weightKg) : "") },
  { key: "measureCbm", title: "Volume cbm", width: 110, align: "right", text: (r) => (r.m?.measureCbm ? String(r.m.measureCbm) : ""), render: (_, r) => numCell(r.m?.measureCbm ? nf(r.m.measureCbm, 2) : "") },
  textCol("commodity", "Commodity", 200),
  textCol("shipmentOwner", "Person In Charge", 180),
  textCol("containerNumber", "Container Number", 150, { defaultVisible: false, render: (_, r) => mono(r.m?.containerNumber) }),
  textCol("bookingNumber", "Booking Number", 150, { defaultVisible: false, render: (_, r) => mono(r.m?.bookingNumber) }),
  textCol("vessel", "Vessel", 150, { defaultVisible: false }),
  { key: "createdAt", title: "Created", width: 110, text: (r) => formatDate(r.task.createdAt), render: (_, r) => dim(formatDate(r.task.createdAt)) },
];

// Warehouse module tabs.
const MODULE_TABS = [
  { key: "positions", label: "Positions" },
  { key: "containers", label: "Containers" },
  { key: "dock", label: "Dock & Yard" },
  { key: "reports", label: "Reports" },
  { key: "readme", label: "Read me" },
  { key: "stock", label: "Stock" },
] as const;
type ModuleTab = (typeof MODULE_TABS)[number]["key"];

function ModuleTabs({ active, counts, onChange }: { active: ModuleTab; counts: Partial<Record<ModuleTab, number>>; onChange: (tab: ModuleTab) => void }) {
  return (
    <div className="flex gap-0 mt-3 border-b border-slate-200 overflow-x-auto">
      {MODULE_TABS.map((t) => {
        const on = active === t.key;
        const count = counts[t.key];
        return (
          <div
            key={t.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`px-4 py-2.5 text-sm cursor-pointer whitespace-nowrap transition-all duration-150 border-b-2 -mb-px ${
              on ? "font-semibold text-indigo-500 border-indigo-500" : "font-normal text-slate-500 border-transparent hover:text-slate-700"
            }`}
          >
            {t.label}
            {count != null && (
              <span className={`ml-1.5 rounded-full px-1.5 py-px text-[11px] font-semibold ${on ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>
                {count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Filter bubbles above the Positions grid, in the same format as the Shipments overview
// tiles. They read the warehouse's own data on each position (its gate log movement):
// trade direction, load type, freight mode, and whether the movement is still open.
type BubbleId = "consolImport" | "consolExport" | "shuttle";

const isOpen = (m: GateMovement) => !["Released", "Refused"].includes(m.status);
const BUBBLES: { id: BubbleId; label: string; hint: string; match: (m: GateMovement) => boolean }[] = [
  {
    id: "consolImport",
    label: "Open Consol Import Containers",
    hint: "Import · load type Consolidation · not yet done",
    match: (m) => isOpen(m) && m.handling === "Import" && m.loadType === "Consolidation",
  },
  {
    id: "consolExport",
    label: "Open Consol Export Containers",
    hint: "Export · load type Consolidation · not yet done",
    match: (m) => isOpen(m) && m.handling === "Export" && m.loadType === "Consolidation",
  },
  {
    id: "shuttle",
    label: "Open Shuttle Trucks",
    hint: "Freight mode Road Freight · not yet done",
    match: (m) => isOpen(m) && m.freightMode === "Road Freight",
  },
];

function FilterBubbles({ active, counts, onSelect }: { active: BubbleId | null; counts: Record<BubbleId, number>; onSelect: (id: BubbleId | null) => void }) {
  return (
    // Same tiles as the Gate Log: full width, the label with its count beside it.
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
      {BUBBLES.map((b) => {
        const on = active === b.id;
        return (
          <Tooltip key={b.id} title={b.hint} mouseEnterDelay={0.4}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(on ? null : b.id)}
              className={[
                "w-full text-left rounded-xl border shadow-sm px-4 py-3 min-w-0 transition-colors cursor-pointer",
                on ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
              ].join(" ")}
            >
              <div className="flex items-baseline gap-2">
                <span className={`text-[15px] font-bold uppercase tracking-wide ${on ? "text-indigo-600" : "text-slate-500"}`}>{b.label}:</span>
                <span className={`text-[22px] leading-tight font-bold tabular-nums ${on ? "text-indigo-700" : "text-slate-900"}`}>{counts[b.id]}</span>
              </div>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

// Positions grid: every warehouse position with its own data (the gate movement record).
export const WarehouseView = () => {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: ModuleTab = MODULE_TABS.some((t) => t.key === tabParam) ? (tabParam as ModuleTab) : "positions";
  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const setTab = (tab: ModuleTab) => setParam("tab", tab === "positions" ? null : tab);

  const { tasks, isLoading: tasksLoading, deleteTask } = useWarehouse();
  const { movements, isLoading: movementsLoading } = useGateLog();
  const [createOpen, setCreateOpen] = useState(false);

  // Bubble filter is URL-backed (?bubble=).
  const activeBubble = BUBBLES.find((b) => b.id === searchParams.get("bubble")) ?? null;
  const setBubble = (id: BubbleId | null) => setParam("bubble", id);

  const allRows = useMemo<PositionRow[]>(() => {
    const byTask = new Map<string, GateMovement>();
    for (const mv of movements) if (mv.warehouseTaskId && !byTask.has(mv.warehouseTaskId)) byTask.set(mv.warehouseTaskId, mv);
    // Most recently recorded first.
    return tasks.map((task) => ({ task, m: byTask.get(task.id) })).sort((a, b) => b.task.createdAt.localeCompare(a.task.createdAt));
  }, [tasks, movements]);

  const bubbleCounts = useMemo(
    () => Object.fromEntries(BUBBLES.map((b) => [b.id, allRows.filter((r) => r.m && b.match(r.m)).length])) as Record<BubbleId, number>,
    [allRows],
  );
  // FCL / LCL switch (?load=fcl|lcl) by the position's operation type; click the active side to clear.
  const loadParam = searchParams.get("load");
  const load: LoadFilter | null = loadParam === "fcl" || loadParam === "lcl" ? loadParam : null;
  const setLoad = (next: LoadFilter | null) => setParam("load", next);

  const rows = useMemo(
    () =>
      allRows.filter(
        (r) =>
          (!activeBubble || (r.m && activeBubble.match(r.m))) &&
          (!load || (r.m && (load === "fcl" ? isFcl(r.m.operationType) : isLcl(r.m.operationType)))),
      ),
    [allRows, activeBubble, load],
  );

  const [removeRows, setRemoveRows] = useState<{ rows: PositionRow[]; clear: () => void } | null>(null);
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    if (!removeRows) return;
    setRemoving(true);
    try {
      await Promise.all(removeRows.rows.map((r) => deleteTask(r.task.id)));
      toast.success(`Removed ${removeRows.rows.length} position${removeRows.rows.length === 1 ? "" : "s"} from the warehouse`);
      removeRows.clear();
      setRemoveRows(null);
    } catch {
      toast.error("Failed to remove from the warehouse");
    } finally {
      setRemoving(false);
    }
  };

  const { items: stockLines } = useStockLines();
  const moduleTabs = <ModuleTabs active={activeTab} counts={{ positions: tasks.length, stock: stockLines.length }} onChange={setTab} />;

  if (activeTab !== "positions") {
    return (
      <div className="bg-slate-50 min-h-full px-8 py-6">
        <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Warehouse</h1>
            {moduleTabs}
          </div>
          {activeTab === "stock" && <StockTab />}
          {activeTab === "containers" && <ContainersTab />}
          {activeTab === "dock" && <DockYardTab />}
          {activeTab === "reports" && <ReportsTab />}
          {activeTab === "readme" && <ReadmeTab />}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto">
        <AppGrid<PositionRow>
          title="Warehouse"
          subHeader={
            <>
              {moduleTabs}
              <FilterBubbles active={activeBubble?.id ?? null} counts={bubbleCounts} onSelect={setBubble} />
            </>
          }
          searchPlaceholder="Search warehouse ref, customer, job…"
          columns={POSITION_COLUMNS}
          rows={rows}
          rowKey={(r) => r.task.id}
          loading={tasksLoading || movementsLoading}
          onRowClick={(r) => router.push(`/warehouse/${r.task.id}`)}
          storageKey="warehouse:positions"
          exportFilePrefix="warehouse"
          emptyText={tasks.length ? "No positions match this filter." : "No positions in the warehouse yet."}
          resetKey={`${activeBubble?.id ?? ""}|${load ?? ""}`}
          actions={
            <>
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                <PlusOutlined />
                Create new
              </button>
              <div role="group" aria-label="Filter by load" className="flex shrink-0 rounded-lg border border-slate-300 overflow-hidden">
                {(["fcl", "lcl"] as const).map((k, i) => {
                  const on = load === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setLoad(on ? null : k)}
                      className={[
                        "px-3 h-8 text-[13px] font-medium transition-colors cursor-pointer",
                        i > 0 ? "border-l border-l-slate-300" : "",
                        on ? "bg-indigo-50 text-indigo-700 font-semibold" : "bg-white text-slate-700 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {k.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </>
          }
          bulkActions={(selected, clear) => (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setRemoveRows({ rows: selected, clear })}>
              Remove from warehouse
            </Button>
          )}
        />

        {/* Create new: a warehouse position of its own — not paired with a shipment. */}
        <NewPositionModal open={createOpen} onClose={() => setCreateOpen(false)} />

        <ConfirmModal
          open={!!removeRows}
          onClose={() => setRemoveRows(null)}
          onConfirm={handleRemove}
          title="Remove from warehouse"
          description={`Remove ${removeRows?.rows.length ?? 0} position(s) from the warehouse? Their warehouse references are retired and not reused. Shipments are not affected.`}
          confirmLabel="Remove"
          danger
          loading={removing}
        />
      </div>
    </div>
  );
};

type NewPositionValues = controllers.WarehousePositionCreateRequest;

type Source = "job" | "quote" | "blank";

// Quote → warehouse value mappings (the same values a job would carry).
const FREIGHT_MODE: Record<string, string> = { Air: "Air Freight", "Sea FCL": "Sea Freight", "Sea LCL": "Sea Freight", Rail: "Rail Freight", Road: "Road Freight" };
const LOAD_TYPE: Record<string, string> = { "Sea FCL": "Full Load", "Sea LCL": "Consolidation" };
const packageType = (t: string | undefined): string => (t === "Pallets" ? "Pallet(s)" : (t ?? ""));

type ShipmentItem = interfaces.ShipmentItem;

const num = (v: string | null | undefined) => {
  const n = Number(v);
  return v && isFinite(n) ? n : undefined;
};

// Values a new position takes over from a shipment job — a copy only, nothing stays linked.
const fromShipment = (sh: ShipmentItem): Partial<NewPositionValues> => ({
  customer: sh.customer || undefined,
  customerRef: sh.customerReference || undefined,
  customerContact: sh.customerPic || undefined,
  handling: sh.tradeDirection === "Export" ? "Export" : "Import",
  freightMode: sh.freightMode || undefined,
  loadType: sh.loadType || undefined,
  commodity: sh.cargoDescription || undefined,
  packing: sh.typeOfPackages || undefined,
  colli: num(sh.pcs) ?? 0,
  weightKg: num(sh.totalWeightTons) != null ? Math.round(num(sh.totalWeightTons)! * 1000) : 0,
  measureCbm: num(sh.totalVolumeCbm) ?? 0,
  shipmentOwner: sh.personInCharge || undefined,
  customsStatus: sh.customsStatus || undefined,
  jobNumber: sh.jobNumber || undefined,
  pol: sh.pol || undefined,
  pod: sh.pod || undefined,
  etd: sh.estimatedDeparture || undefined,
  eta: sh.estimatedArrival || undefined,
  vessel: sh.vessel || undefined,
  voyage: sh.voyage || undefined,
  containerNumber: sh.containerNumber || undefined,
  sealNumber: sh.sealNumber || undefined,
  bookingNumber: sh.bookingNumber || undefined,
  hblNumber: sh.houseBolNumber || undefined,
  mblNumber: sh.masterBolNumber || undefined,
});

// Values a new position takes over from a sales quote — a copy only, nothing stays linked.
const fromQuote = (d: SalesQuoteData): Partial<NewPositionValues> => {
  const packages = d.packages ?? [];
  const pieces = packages.reduce((t, p) => t + (Number(p.qty) || 0), 0);
  const lineWeight = packages.reduce((t, p) => t + (Number(p.qty) || 0) * (Number(p.weight) || 0), 0);
  return {
    customer: d.customerName || undefined,
    customerContact: d.customerContact || undefined,
    handling: d.direction === "Export" ? "Export" : "Import",
    freightMode: FREIGHT_MODE[d.serviceType ?? ""],
    loadType: LOAD_TYPE[d.serviceType ?? ""],
    commodity: d.commodity || undefined,
    packing: packageType(packages[0]?.type) || undefined,
    colli: pieces,
    weightKg: Math.round(lineWeight || Number(d.weight) || 0),
    measureCbm: Number(d.cbm) || 0,
  };
};

// "Create new" — a new warehouse position, created straight away (no form to fill in):
// blank, or with values copied from a job or a quote. It gets its own WCZ reference and is
// never paired with Shipments or Sales; everything else is filled in on its detail page.
const NewPositionModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState<Source | null>(null);
  const [source, setSource] = useState<Exclude<Source, "blank">>("job");
  const [jobId, setJobId] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [jobQuery, setJobQuery] = useState("");
  const debouncedJobQuery = useDebounced(jobQuery.trim(), 300);

  const { data: jobData, isFetching: jobsLoading } = useQuery({
    queryKey: ["warehouse-copy-jobs", debouncedJobQuery],
    queryFn: () => api.shipments.shipmentList({ limit: 50, search: debouncedJobQuery || undefined }),
    enabled: open && source === "job",
  });
  const { data: quoteData, isFetching: quotesLoading } = useQuery({
    queryKey: ["quotes", "warehouse-copy"],
    queryFn: () => api.quotes.quoteList({ limit: 200, sortDirection: "desc" }),
    enabled: open && source === "quote",
  });
  const quotes = useMemo(() => (quoteData?.data ?? []).filter(isSalesQuote).map(toSalesQuote), [quoteData]);

  useEffect(() => {
    if (!open) return;
    setSource("job");
    setJobId("");
    setQuoteNumber("");
    setJobQuery("");
  }, [open]);

  const create = async (from: Source) => {
    let values: NewPositionValues = {};
    if (from === "job") {
      const sh = jobData?.data.find((x) => x.id === jobId);
      if (sh) values = fromShipment(sh);
    } else if (from === "quote") {
      const q = quotes.find((x) => x.quoteNumber === quoteNumber);
      if (q) values = fromQuote(q.data);
    }
    setSaving(from);
    try {
      const { task } = await api.warehouse.warehousePositionCreate(
        Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as NewPositionValues,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["warehouse"] }),
        queryClient.invalidateQueries({ queryKey: ["warehouse-gate"] }),
      ]);
      toast.success(`Position ${task.taskId} created`);
      onClose();
      router.push(`/warehouse/${task.id}`);
    } catch (e) {
      toast.error(errorMessage(e, "Failed to create the position"));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Modal
      open={open}
      title="Create new warehouse position"
      onCancel={onClose}
      width={560}
      destroyOnClose
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={() => create("blank")} loading={saving === "blank"} disabled={!!saving && saving !== "blank"}>
            Create blank
          </Button>
          <Button
            type="primary"
            loading={saving === source}
            disabled={(source === "job" ? !jobId : !quoteNumber) || (!!saving && saving !== source)}
            onClick={() => create(source)}
          >
            {source === "job" ? "Create from job" : "Create from quote"}
          </Button>
        </div>
      }
    >
      <p className="text-xs text-slate-600 mb-4">
        Would you like to copy data from a job or a quote? The values are only copied — the new warehouse position gets its own WCZ reference
        and stays separate from Shipments and Sales.
      </p>
      <Segmented
        block
        className="mb-4"
        value={source}
        onChange={(v) => setSource(v as Exclude<Source, "blank">)}
        options={[
          { label: "Copy from job", value: "job" },
          { label: "Copy from quote", value: "quote" },
        ]}
      />
      {source === "job" ? (
        <>
          <label className="block text-[11px] text-slate-500 mb-1">Copy from Job Number</label>
          <Select
            showSearch
            allowClear
            filterOption={false}
            className="w-full"
            placeholder="Search by job number, customer, shipper…"
            value={jobId || undefined}
            onChange={(v) => setJobId(v ?? "")}
            onSearch={setJobQuery}
            notFoundContent={jobsLoading ? <Spin size="small" /> : "No jobs found"}
            options={(jobData?.data ?? []).map((sh) => ({
              value: sh.id,
              label: sh.customer ? `${sh.jobNumber || sh.id} — ${sh.customer}` : sh.jobNumber || sh.id,
            }))}
          />
        </>
      ) : (
        <>
          <label className="block text-[11px] text-slate-500 mb-1">Copy from Quote Number</label>
          <Select
            showSearch
            allowClear
            className="w-full"
            placeholder="Search or select…"
            optionFilterProp="label"
            value={quoteNumber || undefined}
            onChange={(v) => setQuoteNumber(v ?? "")}
            notFoundContent={quotesLoading ? <Spin size="small" /> : "No quotes found"}
            options={quotes.map((q) => ({
              value: q.quoteNumber,
              label: q.data.customerName ? `${q.quoteNumber} — ${q.data.customerName}` : q.quoteNumber,
            }))}
          />
        </>
      )}
    </Modal>
  );
};
