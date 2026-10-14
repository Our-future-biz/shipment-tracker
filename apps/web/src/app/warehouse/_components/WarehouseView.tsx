"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Drawer, Modal, Segmented, Select, Spin, Tabs, Tooltip } from "antd";
import { PlusOutlined, DeleteOutlined, PrinterOutlined, QuestionCircleOutlined } from "@ant-design/icons";
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
import { CUSTOMS_STATUSES, errorMessage, isFcl, isLcl, nf } from "../gate-log/_lib/gate";
import { GateLogView } from "../gate-log/_components/GateLogView";
import { PrintLabelsModal } from "../gate-log/_components/PrintLabelsModal";
import { DIRECTIONS, TERMS, directionOfVisit } from "../_lib/glossary";
import { ContainersTab } from "./tabs/ContainersTab";
import { StockTab } from "./tabs/StockTab";
import { DockYardTab } from "./tabs/DockYardTab";
import { ReportsTab } from "./tabs/ReportsTab";
import { ReadmeTab } from "./tabs/ReadmeTab";
import { ShipmentImportPicker, type ImportMode } from "./ShipmentImportPicker";
import { RemeasurementTab } from "./tabs/RemeasurementTab";
import { remeasurementHref } from "./remeasurementLinks";
import { reportBulk, runBulk } from "./tabs/shared";

// The Warehouse module works with its own data: a position (WCZ reference) and the record
// on its gate movement. "Create new" either copies job or quote values in once (a position
// of its own), or imports shipments as positions linked to them; for those the Gate Log
// writes the warehouse dates back to the shipment.

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
  { key: "taskId", title: TERMS.warehouseRef, width: 150, text: (r) => r.task.taskId, render: (_, r) => <span className="font-mono font-bold text-indigo-500">{r.task.taskId}</span> },
  // Imported positions open their shipment's warehouse part (Remeasurement / Release); copied
  // ones have no shipment to open.
  {
    key: "jobNumber",
    title: TERMS.jobNo,
    width: 170,
    text: (r) => r.m?.jobNumber ?? "",
    render: (_, r) =>
      r.task.shipmentId && r.m?.jobNumber ? (
        <Link
          href={remeasurementHref(r.task.shipmentId)}
          onClick={(e) => e.stopPropagation()}
          className="font-mono font-semibold text-indigo-500 hover:underline"
        >
          {r.m.jobNumber}
        </Link>
      ) : (
        mono(r.m?.jobNumber)
      ),
  },
  textCol("customer", "Customer", 200),
  textCol("customerRef", "Customer Reference", 160),
  // Direction follows the visit (příjem / výdej), which the gate stamps and release rules use.
  {
    key: "handling",
    title: TERMS.direction,
    width: 120,
    text: (r) => (r.m ? directionOfVisit(r.m.visit) : ""),
    filterOptions: [...DIRECTIONS],
    render: (_, r) => dim(r.m ? directionOfVisit(r.m.visit) : ""),
  },
  textCol("freightMode", "Freight Mode", 130),
  textCol("loadType", "Load Type", 140),
  textCol("status", TERMS.warehouseStatus, 150),
  textCol("customsStatus", "Customs Status", 230, { filterOptions: [...CUSTOMS_STATUSES] }),
  textCol("pol", "POL", 110),
  textCol("pod", "POD", 110),
  { key: "etd", title: "ETD", width: 110, text: (r) => formatDate(r.m?.etd), render: (_, r) => dim(formatDate(r.m?.etd)) },
  { key: "eta", title: "ETA", width: 110, text: (r) => formatDate(r.m?.eta), render: (_, r) => dim(formatDate(r.m?.eta)) },
  { key: "colli", title: TERMS.pieces, width: 90, align: "right", text: (r) => (r.m?.colli ? String(r.m.colli) : ""), render: (_, r) => numCell(r.m?.colli ? nf(r.m.colli) : "") },
  textCol("packing", "Type Of Packages", 150),
  { key: "weightKg", title: TERMS.weightKg, width: 110, align: "right", text: (r) => (r.m?.weightKg ? String(r.m.weightKg) : ""), render: (_, r) => numCell(r.m?.weightKg ? nf(r.m.weightKg) : "") },
  { key: "measureCbm", title: TERMS.volumeCbm, width: 110, align: "right", text: (r) => (r.m?.measureCbm ? String(r.m.measureCbm) : ""), render: (_, r) => numCell(r.m?.measureCbm ? nf(r.m.measureCbm, 2) : "") },
  textCol("commodity", "Commodity", 200),
  textCol("shipmentOwner", "Person In Charge", 180),
  textCol("containerNumber", "Container Number", 150, { defaultVisible: false, render: (_, r) => mono(r.m?.containerNumber) }),
  textCol("bookingNumber", "Booking Number", 150, { defaultVisible: false, render: (_, r) => mono(r.m?.bookingNumber) }),
  textCol("vessel", "Vessel", 150, { defaultVisible: false }),
  { key: "createdAt", title: "Created", width: 110, text: (r) => formatDate(r.task.createdAt), render: (_, r) => dim(formatDate(r.task.createdAt)) },
];

// Warehouse module tabs, in work order; the Read me is in the "?" help drawer.
const MODULE_TABS = [
  { key: "positions", label: "Positions" },
  { key: "remeasurement", label: "Remeasurement / Release" },
  { key: "gatelog", label: "Gate Log" },
  { key: "containers", label: "Containers" },
  { key: "dock", label: "Dock & Yard" },
  { key: "stock", label: "Stock" },
  { key: "reports", label: "Reports" },
] as const;
type ModuleTab = (typeof MODULE_TABS)[number]["key"];

// Real tabs (keyboard: Tab to the bar, arrow keys between tabs), used as the tab bar only —
// each tab's content renders below it.
function ModuleTabs({
  active,
  counts,
  onChange,
  onHelp,
}: {
  active: ModuleTab;
  counts: Partial<Record<ModuleTab, number>>;
  onChange: (tab: ModuleTab) => void;
  onHelp: () => void;
}) {
  return (
    <Tabs
      activeKey={active}
      onChange={(k) => onChange(k as ModuleTab)}
      className="mt-3"
      tabBarStyle={{ marginBottom: 0 }}
      tabBarExtraContent={{
        right: (
          <Tooltip title="Read me — how the Warehouse module works">
            <Button type="text" shape="circle" aria-label="Help" icon={<QuestionCircleOutlined />} onClick={onHelp} />
          </Tooltip>
        ),
      }}
      items={MODULE_TABS.map((t) => {
        const count = counts[t.key];
        const on = active === t.key;
        return {
          key: t.key,
          label: (
            <span className="whitespace-nowrap">
              {t.label}
              {count != null && (
                <span className={`ml-1.5 rounded-full px-1.5 py-px text-[11px] font-semibold ${on ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>
                  {count}
                </span>
              )}
            </span>
          ),
        };
      })}
    />
  );
}

// Filter bubbles above the Positions grid, in the same format as the Shipments overview
// tiles. They read the warehouse's own data on each position (its gate log movement):
// handling (import cargo goes out, export cargo comes in), load type, freight mode, and
// whether the movement is still open.
type BubbleId = "consolImport" | "consolExport" | "shuttle";

const isOpen = (m: GateMovement) => !["Released", "Refused"].includes(m.status);
const BUBBLES: { id: BubbleId; label: string; hint: string; match: (m: GateMovement) => boolean }[] = [
  {
    id: "consolImport",
    label: "Open Consol Outbound Containers",
    hint: "Outbound (import) · load type Consolidation · not yet done",
    match: (m) => isOpen(m) && m.handling === "Import" && m.loadType === "Consolidation",
  },
  {
    id: "consolExport",
    label: "Open Consol Inbound Containers",
    hint: "Inbound (export) · load type Consolidation · not yet done",
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
  // The open shipment, sub-tab and Positions filters belong to their tab and do not carry over.
  const setTab = (tab: ModuleTab) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["shipment", "sub", "bubble", "load"]) params.delete(key);
    if (tab === "positions") params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const { tasks, isLoading: tasksLoading, deleteTask } = useWarehouse();
  const { movements, isLoading: movementsLoading } = useGateLog();
  const [createOpen, setCreateOpen] = useState(false);
  // Read me lives in a help drawer; an old ?tab=readme link opens it on Positions.
  // Read from the URL on every render, so a ?tab=readme link opens it while the page is mounted too.
  const [helpToggled, setHelpOpen] = useState(false);
  const helpOpen = helpToggled || tabParam === "readme";
  const closeHelp = () => {
    setHelpOpen(false);
    if (tabParam === "readme") setTab("positions");
  };
  const [printRows, setPrintRows] = useState<GateMovement[] | null>(null);

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
    // Row by row: a failure does not stop the rest, and the toast says which ones did not go.
    const result = await runBulk(removeRows.rows, (r) => deleteTask(r.task.id));
    setRemoving(false);
    reportBulk(toast, result, { verb: "Removed from the warehouse:", nouns: ["position", "positions"], label: (r) => r.task.taskId });
    if (result.failed.length === 0) removeRows.clear();
    setRemoveRows(null);
  };

  const { items: stockLines } = useStockLines();
  const moduleTabs = (
    <ModuleTabs
      active={activeTab}
      counts={{ positions: tasks.length, gatelog: movements.length, stock: stockLines.length }}
      onChange={setTab}
      onHelp={() => setHelpOpen(true)}
    />
  );

  // Labels print from the position's gate movement; positions without one are reported.
  const printSelected = (selected: PositionRow[]) => {
    const withMovement = selected.flatMap((r) => (r.m ? [r.m] : []));
    const without = selected.length - withMovement.length;
    if (without) toast.info(`${without} position${without === 1 ? " has" : "s have"} no Gate Log job yet and get${without === 1 ? "s" : ""} no label.`);
    if (withMovement.length) setPrintRows(withMovement);
  };

  const help = (
    <Drawer title="Read me" width={760} open={helpOpen} onClose={closeHelp}>
      <ReadmeTab />
    </Drawer>
  );

  if (activeTab === "gatelog") {
    return (
      <div className="bg-slate-50 min-h-full px-8 py-6">
        <div className="max-w-[1400px] mx-auto">
          <GateLogView embedded header={moduleTabs} />
        </div>
        {help}
      </div>
    );
  }

  if (activeTab !== "positions") {
    return (
      <div className="bg-slate-50 min-h-full px-8 py-6">
        <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Warehouse</h1>
            {moduleTabs}
          </div>
          {activeTab === "remeasurement" && <RemeasurementTab shipmentId={searchParams.get("shipment")} onBack={() => setTab("positions")} />}
          {activeTab === "stock" && <StockTab />}
          {activeTab === "containers" && <ContainersTab />}
          {activeTab === "dock" && <DockYardTab />}
          {activeTab === "reports" && <ReportsTab />}
        </div>
        {help}
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
          searchPlaceholder="Search warehouse ref, customer, job no.…"
          columns={POSITION_COLUMNS}
          rows={rows}
          rowKey={(r) => r.task.id}
          loading={tasksLoading || movementsLoading}
          // The position's one page is its Gate Log job; a position without one gets a short note.
          onRowClick={(r) => router.push(r.m ? `/warehouse/gate-log/${r.m.id}` : `/warehouse/${r.task.id}`)}
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
            <>
              <Button size="small" icon={<PrinterOutlined />} onClick={() => printSelected(selected)}>
                Print labels
              </Button>
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setRemoveRows({ rows: selected, clear })}>
                Remove from warehouse
              </Button>
            </>
          )}
        />

        {/* Create new: a position of its own, or shipments imported as linked positions. */}
        <NewPositionModal open={createOpen} onClose={() => setCreateOpen(false)} tasks={tasks} />
        <PrintLabelsModal open={!!printRows} movements={printRows ?? []} onClose={() => setPrintRows(null)} />

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
      {help}
    </div>
  );
};

type NewPositionValues = controllers.WarehousePositionCreateRequest;

type Source = "job" | "quote" | "blank" | ImportMode;

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
// "Import from Shipments / Master Jobs" instead makes one position per checked shipment,
// linked to it (an already imported shipment keeps its position).
const NewPositionModal = ({ open, onClose, tasks }: { open: boolean; onClose: () => void; tasks: WarehouseTask[] }) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState<Source | null>(null);
  const [source, setSource] = useState<Exclude<Source, "blank">>("job");
  const [jobId, setJobId] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [jobQuery, setJobQuery] = useState("");
  const [importIds, setImportIds] = useState<string[]>([]);
  const inWarehouse = useMemo(() => new Set(tasks.flatMap((t) => (t.shipmentId ? [t.shipmentId] : []))), [tasks]);
  const importing = source === "shipments" || source === "masters";
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
    setImportIds([]);
  }, [open]);

  const changeSource = (v: Exclude<Source, "blank">) => {
    setSource(v);
    setImportIds([]);
  };

  // One linked position per shipment, a few at a time.
  const importShipments = async () => {
    setSaving(source);
    let created = 0;
    const failed: string[] = [];
    const queue = [...importIds];
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        try {
          if ((await api.warehouse.warehouseCreate({ shipmentId: id })).created) created++;
        } catch {
          failed.push(id);
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["warehouse"] }),
      queryClient.invalidateQueries({ queryKey: ["warehouse-gate"] }),
    ]);
    setSaving(null);
    if (created) toast.success(`${created} shipment${created === 1 ? "" : "s"} imported to the warehouse`);
    if (failed.length) {
      toast.error(`${failed.length} shipment${failed.length === 1 ? "" : "s"} could not be imported`);
      setImportIds(failed);
    } else {
      onClose();
    }
  };

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
      const { task, movement } = await api.warehouse.warehousePositionCreate(
        Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as NewPositionValues,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["warehouse"] }),
        queryClient.invalidateQueries({ queryKey: ["warehouse-gate"] }),
      ]);
      toast.success(`Position ${task.taskId} created`);
      onClose();
      // Straight to the new position's one page, its Gate Log job.
      router.push(`/warehouse/gate-log/${movement.id}`);
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
      width={importing ? 960 : 800}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={() => create("blank")} loading={saving === "blank"} disabled={!!saving && saving !== "blank"}>
            Create blank
          </Button>
          {importing ? (
            <Button
              type="primary"
              loading={saving === source}
              disabled={!importIds.length || (!!saving && saving !== source)}
              onClick={importShipments}
            >
              {importIds.length ? `Import ${importIds.length} shipment${importIds.length === 1 ? "" : "s"}` : "Import"}
            </Button>
          ) : (
            <Button
              type="primary"
              loading={saving === source}
              disabled={(source === "job" ? !jobId : !quoteNumber) || (!!saving && saving !== source)}
              onClick={() => create(source)}
            >
              {source === "job" ? "Create from job" : "Create from quote"}
            </Button>
          )}
        </div>
      }
    >
      <p className="text-xs text-slate-600 mb-4">
        {importing
          ? "Each checked shipment becomes its own warehouse position with a WCZ reference, linked to the shipment: gate-in and release update the shipment's warehouse dates."
          : "Would you like to copy data from a job or a quote? The values are only copied — the new warehouse position gets its own WCZ reference and stays separate from Shipments and Sales."}
      </p>
      <Segmented
        block
        className="mb-4"
        value={source}
        onChange={(v) => changeSource(v as Exclude<Source, "blank">)}
        options={[
          { label: `Copy from ${TERMS.jobNo}`, value: "job" },
          { label: "Copy from quote", value: "quote" },
          { label: "Import from Shipments", value: "shipments" },
          { label: "Import from Master Jobs", value: "masters" },
        ]}
      />
      {importing ? (
        <ShipmentImportPicker key={source} mode={source} inWarehouse={inWarehouse} selected={importIds} onChange={setImportIds} />
      ) : source === "job" ? (
        <>
          <label className="block text-[11px] text-slate-500 mb-1">Copy from {TERMS.jobNo}</label>
          <Select
            showSearch
            allowClear
            filterOption={false}
            className="w-full"
            placeholder="Search by job no., customer, shipper…"
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
