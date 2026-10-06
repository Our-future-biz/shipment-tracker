"use client";

import { useMemo, useState } from "react";
import { Button, Select } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
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
import { PACKINGS } from "@/app/warehouse/gate-log/_lib/gate";
import { Callout, Card, Kpi, RecordFormModal, StatusTag, SubTabs, dim, nf, type FieldDef } from "./shared";

// Stock tab: what is on hand (per house job), where it sits on the floor, how it moved, how long
// it has been in store against its free time, and what is under customs control.

type Sub = "onhand" | "locations" | "movements" | "ageing" | "bonded";

const STOCK_STATUSES = ["Available", "Allocated", "On hold", "Picked"];
const STOCK_STATUS_COLORS: Record<string, string> = { Available: "green", Allocated: "blue", "On hold": "red", Picked: "purple" };
const CUSTOMS = ["Free circulation", "T1 bonded", "Export cleared"];
const CUSTOMS_COLORS: Record<string, string> = { "T1 bonded": "orange", "Export cleared": "blue", "Free circulation": "default" };
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
const BONDED_COLORS: Record<string, string> = { "In stock": "orange", Discharged: "green" };

const btnPrimary =
  "flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors";

const mono = (v: string) => (v ? <span className="font-mono font-bold text-indigo-500">{v}</span> : dim(""));
// House job coloured by its free-time state, as on the prototype.
const JOB_TONE: Record<string, string> = { Chargeable: "text-red-600", Expiring: "text-amber-600", "Within free time": "text-emerald-600" };
const job = (l: StockLine) => <span className={`font-mono font-bold ${JOB_TONE[l.freeTimeState] ?? "text-indigo-500"}`}>{l.job}</span>;

const deleteButton = (remove: (id: string) => Promise<unknown>, selected: { id: string }[], clear: () => void) => (
  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => Promise.all(selected.map((r) => remove(r.id))).then(clear)}>
    Delete
  </Button>
);

export function StockTab() {
  const [sub, setSub] = useState<Sub>("onhand");
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

const stockFields: FieldDef[] = [
  { name: "job", label: "House job", required: true, placeholder: "WCZ… / CZ…" },
  { name: "customer", label: "Customer" },
  { name: "shipper", label: "Shipper" },
  { name: "pod", label: "POD" },
  { name: "pieces", label: "Pieces", type: "number" },
  { name: "packageType", label: "Package", type: "select", options: PACKINGS },
  { name: "weightKg", label: "Gross weight (kg)", type: "number" },
  { name: "cbm", label: "Volume (cbm)", type: "number", step: 0.01 },
  { name: "location", label: "Location", placeholder: "A-04-2", section: "Storage" },
  { name: "receivedAt", label: "Received", type: "date", required: true },
  { name: "freeDays", label: "Free days", type: "number" },
  { name: "customs", label: "Customs", type: "select", options: CUSTOMS },
  { name: "status", label: "Status", type: "select", options: STOCK_STATUSES },
  { name: "consol", label: "Consol", placeholder: "Master job it is allocated to" },
  { name: "marks", label: "Marks", type: "textarea" },
];

function StockOnHand() {
  const { items, isLoading, create, update, remove, isSaving } = useStockLines();
  const [editing, setEditing] = useState<{ line?: StockLine } | null>(null);
  const [status, setStatus] = useState("");
  const [customs, setCustoms] = useState("");

  const rows = useMemo(() => items.filter((l) => (!status || l.status === status) && (!customs || l.customs === customs)), [items, status, customs]);
  const pallets = items.filter((l) => /pallet/i.test(l.packageType)).reduce((s, l) => s + l.pieces, 0);

  const columns: AppGridColumn<StockLine>[] = [
    { key: "job", title: "House job", width: 150, text: (l) => l.job, render: (_, l) => job(l) },
    { key: "customer", title: "Customer", width: 180, text: (l) => l.customer, render: (_, l) => dim(l.customer) },
    { key: "shipper", title: "Shipper", width: 160, text: (l) => l.shipper, render: (_, l) => dim(l.shipper) },
    { key: "pod", title: "POD", width: 110, text: (l) => l.pod, render: (_, l) => dim(l.pod) },
    { key: "pieces", title: "Pcs", width: 70, align: "right", text: (l) => String(l.pieces), render: (_, l) => dim(l.pieces) },
    { key: "packageType", title: "Package", width: 140, text: (l) => l.packageType, render: (_, l) => dim(l.packageType) },
    { key: "weightKg", title: "Gross kg", width: 100, align: "right", text: (l) => String(l.weightKg), render: (_, l) => dim(nf(l.weightKg)) },
    { key: "cbm", title: "CBM", width: 80, align: "right", text: (l) => String(l.cbm), render: (_, l) => dim(nf(l.cbm, 2)) },
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
    { key: "consol", title: "Consol", width: 130, text: (l) => l.consol, render: (_, l) => mono(l.consol) },
    { key: "status", title: "Status", width: 110, text: (l) => l.status, filterOptions: STOCK_STATUSES, render: (_, l) => <StatusTag value={l.status} colors={STOCK_STATUS_COLORS} /> },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Lines in stock" value={items.length} sub="house-job level" />
        <Kpi label="Packages" value={nf(items.reduce((s, l) => s + l.pieces, 0))} sub={`${nf(pallets)} of which pallets`} />
        <Kpi label="Gross weight" value={nf(items.reduce((s, l) => s + l.weightKg, 0))} sub="kg" tone="indigo" />
        <Kpi label="Volume" value={nf(items.reduce((s, l) => s + l.cbm, 0), 1)} sub="cbm" tone="indigo" />
        <Kpi label="Bonded / T1" value={items.filter((l) => l.customs === "T1 bonded").length} sub="lines under customs control" tone="amber" />
      </div>
      <AppGrid<StockLine>
        searchPlaceholder="Search job, customer, shipper, marks…"
        actions={
          <button className={btnPrimary} onClick={() => setEditing({})}>
            <PlusOutlined /> Stock line
          </button>
        }
        filters={
          <>
            <Select value={status} onChange={setStatus} className="w-40" options={[{ value: "", label: "All statuses" }, ...STOCK_STATUSES.map((s) => ({ value: s, label: s }))]} />
            <Select value={customs} onChange={setCustoms} className="w-44" options={[{ value: "", label: "All customs" }, ...CUSTOMS.map((s) => ({ value: s, label: s }))]} />
          </>
        }
        columns={columns}
        rows={rows}
        rowKey={(l) => l.id}
        loading={isLoading}
        onRowClick={(line) => setEditing({ line })}
        bulkActions={(selected, clear) => deleteButton(remove, selected, clear)}
        storageKey="warehouse:stock-on-hand"
        exportFilePrefix="stock-on-hand"
        emptyText={items.length ? "No lines match this filter." : "Nothing in stock yet."}
        resetKey={`${status}|${customs}`}
      />
      {editing && (
        <RecordFormModal<interfaces.WarehouseStockLineInput>
          open
          title={editing.line ? `House job ${editing.line.job}` : "New stock line"}
          fields={stockFields}
          initial={editing.line ?? { receivedAt: new Date().toISOString().slice(0, 10), freeDays: 7, customs: "Free circulation", status: "Available" }}
          saving={isSaving}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => (editing.line ? update(editing.line.id, values) : create(values))}
          onDelete={editing.line ? () => remove(editing.line!.id) : undefined}
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
  const { items: lines } = useStockLines();
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
                    ["Pieces", `${l.pieces}${l.packageType ? ` × ${l.packageType}` : ""}`],
                    ["Gross", `${nf(l.weightKg)} kg`],
                    ["Volume", `${nf(l.cbm, 2)} cbm`],
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
  { name: "pieces", label: "Pieces", type: "number" },
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
    { key: "pieces", title: "Pcs", width: 70, align: "right", text: (m) => String(m.pieces), render: (_, m) => dim(m.pieces) },
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
            <span className="text-xs text-slate-400">Every movement is final and stamped with who recorded it.</span>
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
  const { items, isLoading } = useStockLines();
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
  ];

  return (
    <>
      <Callout title="Why this screen exists.">
        Storage revenue is lost when nobody notices free time ran out. Free time is counted from the receipt date; the first chargeable day turns
        red the moment it is reached. Storage accrues at CZK 22 per w/m per day, at least CZK 120 per day.
      </Callout>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Kpi label="Within free time" value={items.filter((l) => l.freeTimeState === "Within free time").length} sub="no charge yet" tone="green" />
        <Kpi label="Expiring ≤ 3 days" value={items.filter((l) => l.freeTimeState === "Expiring").length} sub="notify customer" tone="amber" />
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

const bondedFields: FieldDef[] = [
  { name: "mrn", label: "MRN", required: true, placeholder: "26CZ5100001234A7" },
  { name: "job", label: "House job" },
  { name: "consignee", label: "Consignee" },
  { name: "procedure", label: "Procedure" },
  { name: "entryDate", label: "Entry date", type: "date" },
  { name: "pieces", label: "Pieces", type: "number" },
  { name: "weightKg", label: "Gross weight (kg)", type: "number" },
  { name: "customsValue", label: "Customs value", placeholder: "CZK 412 000" },
  { name: "discharge", label: "Discharge", placeholder: "2026-08-06 · 40 00 release", section: "Discharge" },
  { name: "balance", label: "Balance (pieces)", type: "number" },
];

function Bonded() {
  const { items, isLoading, create, update, remove, isSaving } = useBondedEntries();
  const [editing, setEditing] = useState<{ entry?: BondedEntry } | null>(null);

  const columns: AppGridColumn<BondedEntry>[] = [
    { key: "mrn", title: "MRN", width: 170, text: (b) => b.mrn, render: (_, b) => mono(b.mrn) },
    { key: "job", title: "House job", width: 150, text: (b) => b.job, render: (_, b) => mono(b.job) },
    { key: "consignee", title: "Consignee", width: 180, text: (b) => b.consignee, render: (_, b) => dim(b.consignee) },
    { key: "procedure", title: "Procedure", width: 220, text: (b) => b.procedure, render: (_, b) => dim(b.procedure) },
    { key: "entryDate", title: "Entry date", width: 110, text: (b) => b.entryDate, render: (_, b) => dim(formatDate(b.entryDate)) },
    { key: "pieces", title: "Pcs", width: 70, align: "right", text: (b) => String(b.pieces), render: (_, b) => dim(b.pieces) },
    { key: "weightKg", title: "Gross kg", width: 100, align: "right", text: (b) => String(b.weightKg), render: (_, b) => dim(nf(b.weightKg)) },
    { key: "customsValue", title: "Customs value", width: 140, align: "right", text: (b) => b.customsValue, render: (_, b) => dim(b.customsValue) },
    { key: "discharge", title: "Discharge", width: 220, text: (b) => b.discharge, render: (_, b) => dim(b.discharge) },
    { key: "balance", title: "Balance", width: 90, align: "right", text: (b) => String(b.balance), render: (_, b) => dim(b.balance) },
    { key: "status", title: "Status", width: 120, text: (b) => b.status, filterOptions: ["In stock", "Discharged"], render: (_, b) => <StatusTag value={b.status} colors={BONDED_COLORS} /> },
  ];

  return (
    <>
      <Callout title="Customs warehouse register.">
        Mirrors the entry / discharge record the customs authority expects: MRN, procedure, entry date, discharge document and running balance.
        An entry is discharged when its balance reaches zero.
      </Callout>
      <AppGrid<BondedEntry>
        searchPlaceholder="Search MRN, job, consignee…"
        actions={
          <button className={btnPrimary} onClick={() => setEditing({})}>
            <PlusOutlined /> Entry
          </button>
        }
        columns={columns}
        rows={items}
        rowKey={(b) => b.id}
        loading={isLoading}
        onRowClick={(entry) => setEditing({ entry })}
        bulkActions={(selected, clear) => deleteButton(remove, selected, clear)}
        storageKey="warehouse:bonded"
        exportFilePrefix="bonded-register"
        emptyText="No bonded entries yet."
      />
      {editing && (
        <RecordFormModal<interfaces.WarehouseBondedEntryInput>
          open
          title={editing.entry ? `MRN ${editing.entry.mrn}` : "New bonded entry"}
          fields={bondedFields}
          initial={editing.entry ?? { procedure: "71 00 — customs warehousing", entryDate: new Date().toISOString().slice(0, 10) }}
          saving={isSaving}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => (editing.entry ? update(editing.entry.id, values) : create(values))}
          onDelete={editing.entry ? () => remove(editing.entry!.id) : undefined}
          okText={editing.entry ? "Save" : "Create"}
        />
      )}
    </>
  );
}
