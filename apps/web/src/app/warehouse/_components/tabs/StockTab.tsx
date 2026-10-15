"use client";

import { useMemo, useState } from "react";
import { Button, Modal, Select, Switch } from "antd";
import { PlusOutlined, SyncOutlined } from "@ant-design/icons";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import {
  useBondedEntries,
  useStockLines,
  useStockMovements,
  useZones,
  type BondedEntry,
  type StockLine,
  type StockMovement,
  type Zone,
} from "@/hooks/useWarehouseRecords";
import { formatDate, formatDateTime } from "@/lib/date";
import type { interfaces } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { useGateLog } from "@/hooks/useGateLog";
import { Badge, PACKINGS, errorMessage, isManager } from "@/app/warehouse/gate-log/_lib/gate";
import { CustomsDeadlineChip } from "@/app/warehouse/_lib/customsDeadline";
import { customsClockSort } from "@/app/warehouse/_lib/customsClock";
import { stockSyncText, useStockSync } from "@/app/warehouse/_lib/stockSync";
import { TERMS } from "@/app/warehouse/_lib/glossary";
import { useUrlParam } from "@/app/warehouse/_lib/useUrlParam";
import { BulkDeleteButton, Callout, Card, Kpi, RecordFormModal, StatusTag, SubTabs, dim, nf, type FieldDef } from "./shared";

// Stock tab: what is on hand (per house job), where it sits on the floor, how it moved, how long
// it has been in store against its free time, and what is under customs control.

type Sub = "onhand" | "locations" | "movements" | "ageing" | "bonded";

const STOCK_STATUSES = ["Available", "Allocated", "On hold", "Picked"];
// An automatic line is closed by the gate (Picked when it leaves, Voided when the receipt is voided).
const AUTO_STATUSES = ["Available", "Allocated", "On hold"];
const ALL_STATUSES = [...STOCK_STATUSES, "Voided"];
const STOCK_STATUS_COLORS: Record<string, string> = { Available: "green", Allocated: "blue", "On hold": "red", Picked: "purple", Voided: "default" };
const CUSTOMS = ["Free circulation", "T1 bonded", "Temporary storage", "Customs warehouse", "Export cleared"];
const UNDER_CUSTOMS = ["T1 bonded", "Temporary storage", "Customs warehouse"];
const CUSTOMS_COLORS: Record<string, string> = {
  "T1 bonded": "orange",
  "Temporary storage": "orange",
  "Customs warehouse": "gold",
  "Export cleared": "blue",
  "Free circulation": "default",
};
const SOURCE_COLORS: Record<string, string> = { Auto: "geekblue", Manual: "default" };
const sourceLabel = (s: string) => (s === "auto" ? "Auto" : "Manual");
const SOURCE_HINT = "Auto: follows the gate record (opened at the receipt, closed when the position leaves). Manual: typed by hand.";
const FREE_TIME_COLORS: Record<string, string> = { "Within free time": "green", Expiring: "orange", Chargeable: "red" };
const MOVEMENT_TYPES = ["Receipt", "Put-away", "Transfer", "Pick", "Load", "Adjustment", "Rework"];
const MOVEMENT_COLORS: Record<string, string> = {
  Receipt: "blue",
  "Put-away": "geekblue",
  Transfer: "default",
  Pick: "orange",
  Load: "green",
  Adjustment: "red",
  Rework: "gold",
};
const BONDED_COLORS: Record<string, string> = { "In stock": "orange", Discharged: "green", Voided: "default" };

const btnPrimary =
  "flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors";

const mono = (v: string) => (v ? <span className="font-mono font-bold text-indigo-500">{v}</span> : dim(""));
// House job coloured by its free-time state, as on the prototype.
const JOB_TONE: Record<string, string> = { Chargeable: "text-red-600", Expiring: "text-amber-600", "Within free time": "text-emerald-600" };
const job = (l: StockLine) => (
  <span className={`font-mono font-bold ${l.closed ? "text-slate-400" : (JOB_TONE[l.freeTimeState] ?? "text-indigo-500")}`} title={l.movementId ? undefined : "Not linked to a position"}>
    {l.job}
    {!l.movementId && <span className="ml-1 font-sans font-normal text-[10px] text-slate-400">not linked</span>}
  </span>
);

const sourceTag = (source: string) => (
  <span title={SOURCE_HINT}>
    <StatusTag value={sourceLabel(source)} colors={SOURCE_COLORS} />
  </span>
);

// The position picker of manual lines / entries: the live gate records (WCZ ref · Job no. · customer).
function usePositionOptions() {
  const { movements } = useGateLog();
  return useMemo(
    () =>
      movements
        .map((m) => ({ value: m.id, label: [m.positionRef || m.gateRef, m.jobNumber, m.customer].filter(Boolean).join(" · ") }))
        .sort((a, b) => b.label.localeCompare(a.label)),
    [movements],
  );
}

// "Build stock from gate records" (manager): a dry run shows the counts, then it runs.
function BuildStockButton() {
  const { user } = useAuth();
  const toast = useToast();
  const { run, isRunning } = useStockSync();
  // antd's static Modal.confirm does not render under React 19; the hook version does.
  const [modal, modalHolder] = Modal.useModal();
  if (!isManager(user)) return null;
  const start = async () => {
    try {
      const preview = await run(true);
      modal.confirm({
        title: "Build stock from gate records?",
        width: 560,
        content: (
          <div className="text-xs text-slate-600 flex flex-col gap-2">
            <p className="m-0">
              Every live gate record is checked: received positions get their automatic stock line (and a bonded register entry when under
              customs control); lines of positions that left are closed. Manual lines are not changed.
            </p>
            <p className="m-0 font-semibold text-slate-800">{stockSyncText(preview, true)}</p>
            {preview.manualLineExists.length > 0 && (
              <p className="m-0 text-amber-700">
                Manual line exists — check: {preview.manualLineExists.slice(0, 20).join(", ")}
                {preview.manualLineExists.length > 20 ? ` … and ${preview.manualLineExists.length - 20} more` : ""}. These get no automatic line (it would be
                counted twice).
              </p>
            )}
          </div>
        ),
        okText: "Build",
        onOk: async () => {
          try {
            toast.success(stockSyncText(await run(false), false));
          } catch (e) {
            toast.error(errorMessage(e, "Could not build the stock"));
          }
        },
      });
    } catch (e) {
      toast.error(errorMessage(e, "Could not check the gate records"));
    }
  };
  return (
    <>
      {modalHolder}
      <Button size="small" icon={<SyncOutlined spin={isRunning} />} onClick={start} disabled={isRunning} title="Manager: create / close the automatic stock lines from the gate records">
        Build stock from gate records
      </Button>
    </>
  );
}


const SUBS = ["onhand", "locations", "movements", "ageing", "bonded"] as const satisfies readonly Sub[];

export function StockTab() {
  const [sub, setSub] = useUrlParam<Sub>("sub", SUBS, "onhand");
  return (
    <div className="flex flex-col gap-5">
      <SubTabs
        tabs={[
          { key: "onhand", label: "Stock on Hand" },
          { key: "locations", label: "Locations & Occupancy" },
          { key: "movements", label: "Movements / Audit Trail" },
          { key: "ageing", label: "Ageing & Free Time" },
          { key: "bonded", label: "Bonded Register" },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === "onhand" && <StockOnHand />}
      {sub === "locations" && <Locations />}
      {sub === "movements" && <Movements />}
      {sub === "ageing" && <Ageing />}
      {sub === "bonded" && <Bonded />}
    </div>
  );
}

// ---------- Stock on hand ----------

const stockFields = (positions: { value: string; label: string }[]): FieldDef[] => [
  { name: "movementId", label: "Position", type: "select", options: positions, placeholder: "WCZ ref · Job no. — pick the position", full: true },
  { name: "job", label: "House job (only when no position)", placeholder: "Not linked — odd cases only" },
  { name: "customer", label: "Customer" },
  { name: "shipper", label: "Shipper" },
  { name: "pod", label: "POD" },
  { name: "pieces", label: TERMS.pieces, type: "number" },
  { name: "packageType", label: "Package", type: "select", options: PACKINGS },
  { name: "weightKg", label: TERMS.weightKg, type: "number" },
  { name: "cbm", label: TERMS.volumeCbm, type: "number", step: 0.01 },
  { name: "location", label: "Location", placeholder: "A-04-2", section: "Storage" },
  { name: "receivedAt", label: "Received", type: "date", required: true },
  { name: "freeDays", label: "Free days", type: "number" },
  { name: "customs", label: "Customs", type: "select", options: CUSTOMS },
  { name: "status", label: "Status", type: "select", options: STOCK_STATUSES },
  { name: "consol", label: "Consol", placeholder: "Master job it is allocated to" },
  { name: "marks", label: "Marks", type: "textarea" },
];

// An automatic line: only where it sits, On hold / Allocated, the consol and the marks.
const autoStockFields: FieldDef[] = [
  { name: "location", label: "Location", placeholder: "A-04-2" },
  { name: "status", label: "Status", type: "select", options: AUTO_STATUSES },
  { name: "consol", label: "Consol", placeholder: "Master job it is allocated to" },
  { name: "marks", label: "Marks", type: "textarea" },
];

const customsDeadlineCol: AppGridColumn<StockLine> = {
  key: "customsDeadline",
  title: "Customs deadline",
  width: 140,
  text: (l) => (l.customsClock.state === "none" ? "" : l.customsClock.note),
  sorter: (a, b) => customsClockSort(a.customsClock) - customsClockSort(b.customsClock),
  render: (_, l) => <CustomsDeadlineChip clock={l.customsClock} empty="" />,
};

function StockOnHand() {
  const { items: all, isLoading, create, update, remove, isSaving } = useStockLines();
  const positions = usePositionOptions();
  const [editing, setEditing] = useState<{ line?: StockLine } | null>(null);
  const [status, setStatus] = useState("");
  const [customs, setCustoms] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  // On hand = open lines; "Show closed" adds the lines that left (Picked) or were voided.
  const items = useMemo(() => all.filter((l) => !l.closed), [all]);
  const shown = showClosed ? all : items;
  const rows = useMemo(() => shown.filter((l) => (!status || l.status === status) && (!customs || l.customs === customs)), [shown, status, customs]);
  const pallets = items.filter((l) => /pallet/i.test(l.packageType)).reduce((s, l) => s + l.pieces, 0);
  const auto = editing?.line?.source === "auto";

  const columns: AppGridColumn<StockLine>[] = [
    { key: "job", title: "House job", width: 170, text: (l) => l.job, render: (_, l) => job(l) },
    { key: "source", title: "Source", width: 90, text: (l) => sourceLabel(l.source), filterOptions: ["Auto", "Manual"], render: (_, l) => sourceTag(l.source) },
    { key: "jobNumber", title: TERMS.jobNo, width: 130, text: (l) => l.jobNumber, render: (_, l) => dim(l.jobNumber) },
    { key: "customer", title: "Customer", width: 180, text: (l) => l.customer, render: (_, l) => dim(l.customer) },
    { key: "shipper", title: "Shipper", width: 160, text: (l) => l.shipper, render: (_, l) => dim(l.shipper) },
    { key: "pod", title: "POD", width: 110, text: (l) => l.pod, render: (_, l) => dim(l.pod) },
    { key: "pieces", title: TERMS.pieces, width: 80, align: "right", text: (l) => String(l.pieces), render: (_, l) => dim(l.pieces) },
    { key: "packageType", title: "Package", width: 140, text: (l) => l.packageType, render: (_, l) => dim(l.packageType) },
    { key: "weightKg", title: TERMS.weightKg, width: 100, align: "right", text: (l) => String(l.weightKg), render: (_, l) => dim(nf(l.weightKg)) },
    { key: "cbm", title: TERMS.volumeCbm, width: 110, align: "right", text: (l) => String(l.cbm), render: (_, l) => dim(nf(l.cbm, 2)) },
    { key: "wm", title: "w/m", width: 80, align: "right", text: (l) => String(l.wm), render: (_, l) => dim(nf(l.wm, 2)) },
    { key: "location", title: "Location", width: 110, text: (l) => l.location, render: (_, l) => mono(l.location) },
    { key: "receivedAt", title: "Received", width: 110, text: (l) => l.receivedAt, render: (_, l) => dim(formatDate(l.receivedAt)) },
    { key: "daysInStock", title: "Days", width: 70, align: "right", text: (l) => String(l.daysInStock), render: (_, l) => dim(l.daysInStock) },
    {
      key: "freeTimeState",
      title: "Free time",
      width: 150,
      text: (l) => l.freeTimeState,
      filterOptions: Object.keys(FREE_TIME_COLORS),
      render: (_, l) => <StatusTag value={l.freeTimeState} colors={FREE_TIME_COLORS} />,
    },
    { key: "customs", title: "Customs", width: 150, text: (l) => l.customs, filterOptions: CUSTOMS, render: (_, l) => <StatusTag value={l.customs} colors={CUSTOMS_COLORS} /> },
    customsDeadlineCol,
    { key: "consol", title: "Consol", width: 130, text: (l) => l.consol, render: (_, l) => mono(l.consol) },
    {
      key: "status",
      title: "Status",
      width: 110,
      text: (l) => l.status,
      filterOptions: ALL_STATUSES,
      render: (_, l) => (
        <span title={l.closedReason ? `${l.closedReason}${l.closedAt ? ` · ${formatDateTime(l.closedAt)}` : ""}` : undefined}>
          <StatusTag value={l.status} colors={STOCK_STATUS_COLORS} />
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Lines in stock" value={items.length} sub={`${items.filter((l) => l.source === "auto").length} from the gate · ${items.filter((l) => l.source !== "auto").length} manual`} />
        <Kpi label={TERMS.pieces} value={nf(items.reduce((s, l) => s + l.pieces, 0))} sub={`${nf(pallets)} of which pallets`} />
        <Kpi label={TERMS.weightKg} value={nf(items.reduce((s, l) => s + l.weightKg, 0))} sub="in stock" tone="indigo" />
        <Kpi label={TERMS.volumeCbm} value={nf(items.reduce((s, l) => s + l.cbm, 0), 1)} sub="in stock" tone="indigo" />
        <Kpi
          label="Bonded / T1"
          value={items.filter((l) => l.customsRegime || UNDER_CUSTOMS.includes(l.customs)).length}
          sub={`under customs control · ${items.filter((l) => l.customsClock.state === "warning" || l.customsClock.state === "overdue").length} near or past the 90-day deadline`}
          tone="amber"
        />
      </div>
      <AppGrid<StockLine>
        searchPlaceholder="Search job, customer, shipper, marks…"
        actions={
          <>
            <button className={btnPrimary} onClick={() => setEditing({})} title="A manual line, for odd cases — received cargo gets its line from the gate">
              <PlusOutlined /> Manual line
            </button>
            <BuildStockButton />
          </>
        }
        filters={
          <>
            <Select value={status} onChange={setStatus} className="w-40" options={[{ value: "", label: "All statuses" }, ...(showClosed ? ALL_STATUSES : STOCK_STATUSES).map((s) => ({ value: s, label: s }))]} />
            <Select value={customs} onChange={setCustoms} className="w-44" options={[{ value: "", label: "All customs" }, ...CUSTOMS.map((s) => ({ value: s, label: s }))]} />
            <label className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
              <Switch size="small" checked={showClosed} onChange={setShowClosed} /> Show closed
            </label>
          </>
        }
        columns={columns}
        rows={rows}
        rowKey={(l) => l.id}
        loading={isLoading}
        onRowClick={(line) => setEditing({ line })}
        bulkActions={(selected, clear) => (
          <BulkDeleteButton
            rows={selected}
            clear={clear}
            nouns={["stock line", "stock lines"]}
            label={(l) => l.job}
            warning="Automatic lines are not deleted — they close when the position leaves."
            remove={(l) => remove(l.id)}
          />
        )}
        storageKey="warehouse:stock-on-hand"
        exportFilePrefix="stock-on-hand"
        emptyText={shown.length ? "No lines match this filter." : "Nothing in stock yet — lines open at the WH receipt / stripping tally."}
        resetKey={`${status}|${customs}|${showClosed}`}
      />
      {editing && (
        <RecordFormModal<interfaces.WarehouseStockLineInput>
          open
          title={editing.line ? `House job ${editing.line.job} · ${sourceLabel(editing.line.source)}` : "New manual stock line"}
          fields={auto ? autoStockFields : stockFields(positions)}
          note={
            auto
              ? `Automatic line: it follows the gate record (pieces, weight, volume, received date, customs) — opened at the receipt and closed when the position leaves${editing.line?.closedReason ? ` (${editing.line.closedReason})` : ""}. Only the location, On hold / Allocated, the consol and the marks are changed here.`
              : "Manual line, for odd cases: pick the position it belongs to. Received cargo gets its automatic line from the gate — do not add a manual line for it (it would be counted twice)."
          }
          initial={
            editing.line
              ? { ...editing.line, movementId: editing.line.movementId ?? undefined }
              : { receivedAt: new Date().toISOString().slice(0, 10), freeDays: 7, customs: "Free circulation", status: "Available" }
          }
          saving={isSaving}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => (editing.line ? update(editing.line.id, values) : create(values))}
          onDelete={editing.line && !auto ? () => remove(editing.line!.id) : undefined}
          okText={editing.line ? "Save" : "Create"}
        />
      )}
    </>
  );
}

// ---------- Locations & occupancy ----------

const zoneFields: FieldDef[] = [
  { name: "code", label: "Zone", required: true, placeholder: "A" },
  { name: "name", label: "Use", placeholder: "General export — palletised" },
  { name: "bays", label: "Bays", type: "number" },
  { name: "capacity", label: "Pallet positions", type: "number", placeholder: "0 for floor storage" },
  { name: "blockedBays", label: "Blocked bays", placeholder: "C-05, C-06", full: true },
  { name: "note", label: "Note", type: "textarea" },
];

type Bay = { code: string; zone: Zone; lines: StockLine[]; blocked: boolean };

// Bay fill on the floor map: empty, part used, well used (> 8 cbm) or blocked.
const bayTone = (b: Bay) =>
  b.blocked
    ? "bg-red-50 border-red-200"
    : !b.lines.length
      ? "bg-white border-slate-200"
      : b.lines.reduce((s, l) => s + l.cbm, 0) > 8
        ? "bg-indigo-100 border-indigo-300"
        : "bg-indigo-50 border-indigo-200";

function Locations() {
  const { items: zones, isLoading, create, update, remove, isSaving } = useZones();
  const { items: allLines } = useStockLines();
  // Only what is on hand occupies a bay.
  const lines = useMemo(() => allLines.filter((l) => !l.closed), [allLines]);
  const [editing, setEditing] = useState<{ zone?: Zone } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const bays = useMemo<Bay[]>(
    () =>
      zones.flatMap((zone) => {
        const blocked = new Set(zone.blockedBays.split(",").map((b) => b.trim()).filter(Boolean));
        return Array.from({ length: zone.bays }, (_, i) => {
          const code = `${zone.code}-${String(i + 1).padStart(2, "0")}`;
          return { code, zone, blocked: blocked.has(code), lines: lines.filter((l) => l.location === code || l.location.startsWith(`${code}-`)) };
        });
      }),
    [zones, lines],
  );
  const bay = bays.find((b) => b.code === selected);

  const legend = [
    ["bg-white border-slate-200", "Empty"],
    ["bg-indigo-50 border-indigo-200", "In use"],
    ["bg-indigo-100 border-indigo-300", "> 8 cbm"],
    ["bg-red-50 border-red-200", "Blocked"],
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
      <Card
        title="Floor map"
        extra={legend.map(([cls, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <i className={`inline-block w-3 h-3 rounded-sm border ${cls}`} />
            {label}
          </span>
        ))}
      >
        {zones.length === 0 ? (
          <p className="text-xs text-slate-400 m-0">No zones yet — add the storage zones on the right to draw the floor map.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {zones.map((z) => (
              <div key={z.id}>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                  Zone {z.code}
                  {z.name ? ` — ${z.name}` : ""}
                </div>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))" }}>
                  {bays
                    .filter((b) => b.zone.id === z.id)
                    .map((b) => (
                      <button
                        key={b.code}
                        type="button"
                        aria-pressed={selected === b.code}
                        onClick={() => setSelected(b.code)}
                        className={`text-left rounded-md border px-2 py-1.5 cursor-pointer transition-shadow ${bayTone(b)} ${selected === b.code ? "ring-2 ring-indigo-500" : ""}`}
                      >
                        <div className="font-mono text-[11px] font-bold text-slate-700">{b.code}</div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {b.blocked ? "Blocked" : b.lines.length ? `${b.lines[0]!.job.slice(-4)} · ${nf(b.lines.reduce((s, l) => s + l.cbm, 0), 1)} cbm` : "Empty"}
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-5 min-w-0">
        <Card
          title="Zone summary"
          bodyClassName="overflow-x-auto"
          extra={
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>
              Zone
            </Button>
          }
        >
          {isLoading ? null : zones.length === 0 ? (
            <p className="text-xs text-slate-400 m-0 p-4">No zones yet.</p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {["Zone", "Use", "Occupied", "Full"].map((h, i) => (
                    <th key={h} className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 ${i >= 2 ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id} onClick={() => setEditing({ zone: z })} className="border-b border-slate-100 last:border-b-0 cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-2">{mono(z.code)}</td>
                    <td className="px-4 py-2">{dim(z.name)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{dim(z.capacity ? `${z.occupied} / ${z.capacity}` : `${z.usedBays} / ${z.bays} bays`)}</td>
                    <td className="px-4 py-2 text-right">
                      {/* A full zone is the problem, not the goal. */}
                      <StatusTag value={`${z.fullPercent} %`} colors={{ [`${z.fullPercent} %`]: z.fullPercent >= 90 ? "red" : z.fullPercent >= 70 ? "orange" : "green" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Bay detail">
          {!bay ? (
            <p className="text-xs text-slate-400 m-0">Select a bay on the map.</p>
          ) : bay.blocked ? (
            <Callout title={bay.code}>Blocked — no storage permitted.</Callout>
          ) : !bay.lines.length ? (
            <Callout title={bay.code}>Empty and available{bay.zone.capacity && bay.zone.bays ? ` — ${Math.round(bay.zone.capacity / bay.zone.bays)} pallet positions` : ""}.</Callout>
          ) : (
            <div className="flex flex-col gap-3">
              {bay.lines.map((l) => (
                <dl key={l.id} className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs m-0">
                  {[
                    ["Bay", l.location],
                    ["House job", l.job],
                    ["Customer", l.customer],
                    [TERMS.pieces, `${l.pieces}${l.packageType ? ` × ${l.packageType}` : ""}`],
                    [TERMS.weightKg, nf(l.weightKg)],
                    [TERMS.volumeCbm, nf(l.cbm, 2)],
                    ["Received", formatDate(l.receivedAt)],
                    ["Days in stock", String(l.daysInStock)],
                    ["Customs", l.customs],
                    ["Consol", l.consol],
                    ["Status", l.status],
                  ].map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{k}</dt>
                      <dd className="m-0 font-medium text-slate-900">{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
              ))}
            </div>
          )}
        </Card>
      </div>

      {editing && (
        <RecordFormModal<interfaces.WarehouseZoneInput>
          open
          title={editing.zone ? `Zone ${editing.zone.code}` : "New zone"}
          fields={zoneFields}
          initial={editing.zone ?? { bays: 10, capacity: 0 }}
          saving={isSaving}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => (editing.zone ? update(editing.zone.id, values) : create(values))}
          onDelete={editing.zone ? () => remove(editing.zone!.id) : undefined}
          okText={editing.zone ? "Save" : "Create"}
        />
      )}
    </div>
  );
}

// ---------- Movements / audit trail ----------

const movementFields: FieldDef[] = [
  { name: "type", label: "Type", type: "select", options: MOVEMENT_TYPES, required: true },
  { name: "at", label: "Time", type: "datetime", placeholder: "Now when empty" },
  { name: "job", label: "House job" },
  { name: "pieces", label: TERMS.pieces, type: "number" },
  { name: "fromLocation", label: "From", placeholder: "Dock 2 / A-04-2" },
  { name: "toLocation", label: "To", placeholder: "A-04-2 / container" },
  { name: "reference", label: "Reference / reason", type: "textarea" },
];

function Movements() {
  const { items, isLoading, record, isSaving } = useStockMovements();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("");
  const rows = useMemo(() => (type ? items.filter((m) => m.type === type) : items), [items, type]);

  const columns: AppGridColumn<StockMovement>[] = [
    { key: "at", title: "Timestamp", width: 150, text: (m) => m.at, render: (_, m) => <span className="font-mono text-slate-600">{formatDateTime(m.at)}</span> },
    { key: "type", title: "Type", width: 120, text: (m) => m.type, filterOptions: MOVEMENT_TYPES, render: (_, m) => <StatusTag value={m.type} colors={MOVEMENT_COLORS} /> },
    { key: "job", title: "House job", width: 150, text: (m) => m.job, render: (_, m) => mono(m.job) },
    { key: "source", title: "Source", width: 90, text: (m) => sourceLabel(m.source), filterOptions: ["Auto", "Manual"], render: (_, m) => sourceTag(m.source) },
    { key: "pieces", title: TERMS.pieces, width: 80, align: "right", text: (m) => String(m.pieces), render: (_, m) => dim(m.pieces) },
    { key: "fromLocation", title: "From", width: 130, text: (m) => m.fromLocation, render: (_, m) => dim(m.fromLocation) },
    { key: "toLocation", title: "To", width: 150, text: (m) => m.toLocation, render: (_, m) => dim(m.toLocation) },
    { key: "userName", title: "User", width: 150, text: (m) => m.userName, render: (_, m) => dim(m.userName) },
    { key: "reference", title: "Reference / reason", width: 240, text: (m) => m.reference, render: (_, m) => dim(m.reference) },
  ];

  return (
    <>
      <AppGrid<StockMovement>
        searchPlaceholder="Search job, user, location…"
        actions={
          <>
            <button className={btnPrimary} onClick={() => setOpen(true)}>
              <PlusOutlined /> Record movement
            </button>
            <span className="text-xs text-slate-400">Every movement is final and stamped with who recorded it. Receipts, picks and loads from the gate are written automatically.</span>
          </>
        }
        filters={<Select value={type} onChange={setType} className="w-44" options={[{ value: "", label: "All movement types" }, ...MOVEMENT_TYPES.map((t) => ({ value: t, label: t }))]} />}
        columns={columns}
        rows={rows}
        rowKey={(m) => m.id}
        loading={isLoading}
        storageKey="warehouse:stock-movements"
        exportFilePrefix="stock-movements"
        emptyText={items.length ? "No movements match this filter." : "No movements recorded yet."}
        resetKey={type}
      />
      {open && (
        <RecordFormModal<interfaces.WarehouseStockMovementInput>
          open
          title="Record movement"
          fields={movementFields}
          initial={{ type: "Put-away" }}
          saving={isSaving}
          onCancel={() => setOpen(false)}
          onSubmit={(values) => record(values)}
          okText="Record"
        />
      )}
    </>
  );
}

// ---------- Ageing & free time ----------

function Ageing() {
  const { items: all, isLoading } = useStockLines();
  const items = useMemo(() => all.filter((l) => !l.closed), [all]);
  const rows = useMemo(() => [...items].sort((a, b) => b.overFreeTime - a.overFreeTime), [items]);
  const chargeable = items.filter((l) => l.freeTimeState === "Chargeable");

  const columns: AppGridColumn<StockLine>[] = [
    { key: "job", title: "House job", width: 150, text: (l) => l.job, render: (_, l) => job(l) },
    { key: "customer", title: "Customer", width: 200, text: (l) => l.customer, render: (_, l) => dim(l.customer) },
    { key: "receivedAt", title: "Received", width: 110, text: (l) => l.receivedAt, render: (_, l) => dim(formatDate(l.receivedAt)) },
    { key: "daysInStock", title: "Days in", width: 90, align: "right", text: (l) => String(l.daysInStock), render: (_, l) => dim(l.daysInStock) },
    { key: "freeDays", title: "Free days", width: 90, align: "right", text: (l) => String(l.freeDays), render: (_, l) => dim(l.freeDays) },
    { key: "lastFreeDay", title: "Last free day", width: 120, text: (l) => l.lastFreeDay, render: (_, l) => dim(formatDate(l.lastFreeDay)) },
    { key: "chargeableDays", title: "Chargeable days", width: 130, align: "right", text: (l) => String(l.chargeableDays), render: (_, l) => dim(l.chargeableDays) },
    { key: "wm", title: "w/m", width: 80, align: "right", text: (l) => String(l.wm), render: (_, l) => dim(nf(l.wm, 2)) },
    { key: "accruedCzk", title: "Accrued CZK", width: 120, align: "right", text: (l) => String(l.accruedCzk), render: (_, l) => dim(nf(l.accruedCzk)) },
    {
      key: "freeTimeState",
      title: "State",
      width: 150,
      text: (l) => l.freeTimeState,
      filterOptions: Object.keys(FREE_TIME_COLORS),
      render: (_, l) => <StatusTag value={l.freeTimeState} colors={FREE_TIME_COLORS} />,
    },
    customsDeadlineCol,
  ];

  return (
    <>
      <Callout title="Why this screen exists.">
        Storage revenue is lost when nobody notices free time ran out. Free time is counted in calendar days (Prague time) from the receipt date —
        the receipt day is day 1; the first chargeable day turns red the moment it is reached. Storage accrues at CZK 22 per w/m per day, at least
        CZK 120 per day. The same calculation is used in Positions, the gate job and Reports. Goods under customs control (T1 / temporary storage)
        also show their customs deadline: 90 days from the receipt (UCC art. 149), amber with 10 days left or fewer.
      </Callout>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Kpi label="Within free time" value={items.filter((l) => l.freeTimeState === "Within free time").length} sub="no charge yet" tone="green" />
        <Kpi label="Expiring ≤ 2 days" value={items.filter((l) => l.freeTimeState === "Expiring").length} sub="notify customer" tone="amber" />
        <Kpi label="Chargeable now" value={chargeable.length} sub={`CZK ${nf(chargeable.reduce((s, l) => s + l.accruedCzk, 0))} accrued to date`} tone="red" />
      </div>
      <AppGrid<StockLine>
        searchPlaceholder="Search job, customer…"
        columns={columns}
        rows={rows}
        rowKey={(l) => l.id}
        loading={isLoading}
        storageKey="warehouse:stock-ageing"
        exportFilePrefix="stock-ageing"
        emptyText="Nothing in stock yet."
      />
    </>
  );
}

// ---------- Bonded register ----------

const bondedFields = (positions: { value: string; label: string }[]): FieldDef[] => [
  { name: "movementId", label: "Position", type: "select", options: positions, placeholder: "WCZ ref · Job no. — pick the position", full: true },
  { name: "mrn", label: "MRN", placeholder: "26CZ5100001234A7 — required when no position is picked" },
  { name: "job", label: "House job (only when no position)" },
  { name: "consignee", label: "Consignee" },
  { name: "procedure", label: "Procedure" },
  { name: "entryDate", label: "Entry date", type: "date" },
  { name: "pieces", label: TERMS.pieces, type: "number" },
  { name: "weightKg", label: TERMS.weightKg, type: "number" },
  { name: "customsValue", label: "Customs value", placeholder: "CZK 412 000" },
  { name: "discharge", label: "Discharge", placeholder: "2026-08-06 · 40 00 release", section: "Discharge" },
  { name: "balance", label: "Balance (pieces)", type: "number" },
];

// An automatic entry follows the gate record; a missing MRN or discharge reference is filled in here.
const autoBondedFields = (e: BondedEntry): FieldDef[] => [
  ...(e.mrn ? [] : [{ name: "mrn", label: "MRN", placeholder: "26CZ5100001234A7" }]),
  ...(e.dischargedAt && !e.dischargeRef ? [{ name: "dischargeRef", label: "Discharge reference", placeholder: "Customs document of the discharge", full: true }] : []),
];

function Bonded() {
  const { items, isLoading, create, update, remove, isSaving } = useBondedEntries();
  const positions = usePositionOptions();
  const [editing, setEditing] = useState<{ entry?: BondedEntry } | null>(null);
  const auto = editing?.entry?.source === "auto";
  const autoFields = editing?.entry && auto ? autoBondedFields(editing.entry) : [];

  const columns: AppGridColumn<BondedEntry>[] = [
    {
      key: "mrn",
      title: "MRN",
      width: 180,
      text: (b) => b.mrn || (b.mrnMissing ? "MRN missing" : ""),
      render: (_, b) => (b.mrnMissing ? <Badge tone="a" title="Record the MRN on the position (gate job)">MRN missing</Badge> : mono(b.mrn)),
    },
    { key: "source", title: "Source", width: 90, text: (b) => sourceLabel(b.source), filterOptions: ["Auto", "Manual"], render: (_, b) => sourceTag(b.source) },
    { key: "job", title: "House job", width: 150, text: (b) => b.job, render: (_, b) => mono(b.job) },
    { key: "jobNumber", title: TERMS.jobNo, width: 130, text: (b) => b.jobNumber, render: (_, b) => dim(b.jobNumber) },
    { key: "consignee", title: "Consignee", width: 180, text: (b) => b.consignee, render: (_, b) => dim(b.consignee) },
    { key: "regime", title: "Regime", width: 150, text: (b) => b.regime || b.procedure, render: (_, b) => dim(b.regime || b.procedure) },
    {
      key: "entered",
      title: "Entered",
      width: 140,
      text: (b) => b.enteredAt ?? b.entryDate,
      render: (_, b) => dim(b.enteredAt ? formatDateTime(b.enteredAt) : formatDate(b.entryDate)),
    },
    {
      key: "deadline",
      title: "Customs deadline",
      width: 150,
      text: (b) => (b.customsClock.state === "none" ? b.deadline : b.customsClock.note),
      sorter: (a, b) => customsClockSort(a.customsClock) - customsClockSort(b.customsClock),
      render: (_, b) => (
        <span className="flex flex-col gap-0.5">
          <CustomsDeadlineChip clock={b.customsClock} empty="" />
          {b.deadline && <span className="text-[10.5px] text-slate-400">{formatDate(b.deadline)}</span>}
        </span>
      ),
    },
    { key: "pieces", title: TERMS.pieces, width: 80, align: "right", text: (b) => String(b.pieces), render: (_, b) => dim(b.pieces) },
    { key: "weightKg", title: TERMS.weightKg, width: 100, align: "right", text: (b) => String(b.weightKg), render: (_, b) => dim(nf(b.weightKg)) },
    { key: "customsValue", title: "Customs value", width: 140, align: "right", text: (b) => b.customsValue, render: (_, b) => dim(b.customsValue) },
    { key: "discharged", title: "Discharged", width: 140, text: (b) => b.dischargedAt ?? "", render: (_, b) => dim(b.dischargedAt ? formatDateTime(b.dischargedAt) : "") },
    { key: "dischargeRef", title: "Ref", width: 240, text: (b) => b.dischargeRef || b.discharge || b.voidedReason, render: (_, b) => dim(b.dischargeRef || b.discharge || (b.voidedReason ? `Voided — ${b.voidedReason}` : "")) },
    { key: "balance", title: "Balance", width: 90, align: "right", text: (b) => String(b.balance), render: (_, b) => dim(b.balance) },
    { key: "status", title: "Status", width: 120, text: (b) => b.status, filterOptions: ["In stock", "Discharged", "Voided"], render: (_, b) => <StatusTag value={b.status} colors={BONDED_COLORS} /> },
  ];
  const open = items.filter((b) => b.status === "In stock");

  return (
    <>
      <Callout title="Customs register.">
        Mirrors the entry / discharge record the customs authority expects: MRN, procedure, entry date, discharge document and running balance.
        Positions under customs control (customs mode T1 or RDT, or bonded cargo storage, not yet cleared) get their entry automatically at the
        receipt; it is discharged when they leave (WH release or container gate-out) or customs clears them. Temporary storage has a 90-day
        deadline from the receipt (UCC art. 149) — amber with 10 days left or fewer, red when overdue.
      </Callout>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Kpi label="Under customs control" value={open.length} sub={`${nf(open.reduce((s, b) => s + b.balance, 0))} pieces`} tone="amber" />
        <Kpi
          label="Deadline ≤ 10 days"
          value={open.filter((b) => b.customsClock.state === "warning").length}
          sub="place under a customs procedure"
          tone="amber"
        />
        <Kpi label="Overdue" value={open.filter((b) => b.customsClock.state === "overdue").length} sub="past the 90-day deadline" tone="red" />
      </div>
      <AppGrid<BondedEntry>
        searchPlaceholder="Search MRN, job, consignee…"
        actions={
          <button className={btnPrimary} onClick={() => setEditing({})} title="A manual entry, for odd cases — positions under customs control get theirs from the gate">
            <PlusOutlined /> Manual entry
          </button>
        }
        columns={columns}
        rows={items}
        rowKey={(b) => b.id}
        loading={isLoading}
        onRowClick={(entry) => setEditing({ entry })}
        bulkActions={(selected, clear) => (
          <BulkDeleteButton
            rows={selected}
            clear={clear}
            nouns={["bonded entry", "bonded entries"]}
            label={(b) => b.mrn || b.job}
            warning="This is a customs record. Automatic entries are not deleted — they are discharged when the position leaves."
            remove={(b) => remove(b.id)}
          />
        )}
        storageKey="warehouse:bonded"
        exportFilePrefix="bonded-register"
        emptyText="No bonded entries yet."
      />
      {editing && (
        <RecordFormModal<interfaces.WarehouseBondedEntryInput>
          open
          title={editing.entry ? `${editing.entry.mrn ? `MRN ${editing.entry.mrn}` : editing.entry.job} · ${sourceLabel(editing.entry.source)}` : "New manual bonded entry"}
          fields={auto ? autoFields : bondedFields(positions)}
          note={
            auto
              ? autoFields.length
                ? "Automatic entry: it follows the gate record. Only a missing MRN or discharge reference is filled in here."
                : `Automatic entry: it follows the gate record (${editing.entry?.positionRef || editing.entry?.job}) — nothing to change here. Correct the position in the gate job.`
              : "Manual entry, for odd cases: pick the position it belongs to (the MRN can follow later)."
          }
          initial={
            editing.entry
              ? { ...editing.entry, movementId: editing.entry.movementId ?? undefined }
              : { procedure: "71 00 — customs warehousing", entryDate: new Date().toISOString().slice(0, 10) }
          }
          saving={isSaving}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => (editing.entry ? update(editing.entry.id, values) : create(values))}
          onDelete={editing.entry && !auto ? () => remove(editing.entry!.id) : undefined}
          okText={editing.entry ? "Save" : "Create"}
        />
      )}
    </>
  );
}
