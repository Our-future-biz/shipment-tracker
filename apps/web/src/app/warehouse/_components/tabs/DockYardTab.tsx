"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Tooltip } from "antd";
import { LeftOutlined, PlusOutlined, RightOutlined } from "@ant-design/icons";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import {
  useDockSlots,
  useEquipment,
  useStaff,
  useWarehouseContainers,
  type DockSlot,
  type Equipment,
  type StaffMember,
  type WarehouseContainer,
} from "@/hooks/useWarehouseRecords";
import { useGateLog, type GateMovement } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import type { interfaces } from "@/lib/api/client";
import { CONTAINER_TYPES } from "@/app/warehouse/gate-log/_lib/gate";
import { TERMS, directionOfVisit } from "@/app/warehouse/_lib/glossary";
import { useUrlParam } from "@/app/warehouse/_lib/useUrlParam";
import { Card, ExpiryTag, Kpi, RecordFormModal, StatusTag, SubTabs, daysUntil, dim, type FieldDef } from "./shared";

type Sub = "schedule" | "yard" | "resources";

const DOCKS = ["Dock 1", "Dock 2", "Dock 3", "Dock 4"];
const HOURS = ["06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18"];
const SLOT_STATUSES = ["Booked", "In progress", "Completed", "Overdue", "Cancelled"];
const SLOT_COLORS: Record<string, string> = { Completed: "green", "In progress": "orange", Booked: "default", Overdue: "red", Cancelled: "default" };
const SLOT_CELL: Record<string, string> = {
  Completed: "bg-emerald-50 border-emerald-200",
  "In progress": "bg-amber-50 border-amber-200",
  Booked: "bg-indigo-50 border-indigo-200",
  Overdue: "bg-red-50 border-red-200",
};
const YARD_STATUSES = ["On site", "Return due", "Gate-out today", "Overdue return"];
const YARD_COLORS: Record<string, string> = { "On site": "default", "Return due": "orange", "Gate-out today": "blue", "Overdue return": "red" };
const EQUIPMENT_STATUSES = ["Available", "In use", "Maintenance"];
const EQUIPMENT_COLORS: Record<string, string> = { Available: "green", "In use": "blue", Maintenance: "red" };
const STAFF_COLORS: Record<string, string> = { "On shift": "green", Booked: "blue" };

const btnPrimary =
  "flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors";

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDate = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
};
const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const SUBS = ["schedule", "yard", "resources"] as const satisfies readonly Sub[];

export function DockYardTab() {
  const [sub, setSub] = useUrlParam<Sub>("sub", SUBS, "schedule");
  return (
    <div className="flex flex-col gap-5">
      <SubTabs
        tabs={[
          { key: "schedule", label: "Dock Schedule" },
          { key: "yard", label: "Yard / Container Park" },
          { key: "resources", label: "Labour & Equipment" },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === "schedule" && <DockSchedule />}
      {sub === "yard" && <YardPark />}
      {sub === "resources" && <Resources />}
    </div>
  );
}

// ---------- Dock schedule ----------

const DURATIONS = [30, 60, 90, 120];
const HOUR_MIN = Number(HOURS[0]) * 60;
const HOUR_MAX = (Number(HOURS[HOURS.length - 1]) + 1) * 60;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h! * 60 + m! : NaN;
};

type Placed = { slot: DockSlot; col: number; span: number; lane: number };

/**
 * Where each slot of one dock goes on the hour grid: from the hour it starts over every hour it
 * runs into, in lanes so slots sharing an hour (e.g. 08:00–08:30 and 08:30–09:00) sit one under
 * the other. Cancelled slots free the door and are left off the grid (they stay in the list).
 */
function placeSlots(slots: DockSlot[]): { placed: Placed[]; lanes: number } {
  const placed: Placed[] = [];
  const laneEnds: number[] = [];
  for (const slot of [...slots].sort((a, b) => a.time.localeCompare(b.time))) {
    const start = toMin(slot.time);
    if (!Number.isFinite(start) || start >= HOUR_MAX) continue;
    const end = Math.min(HOUR_MAX, start + (slot.durationMin || 60));
    if (end <= HOUR_MIN) continue;
    const first = Math.floor((Math.max(start, HOUR_MIN) - HOUR_MIN) / 60);
    const last = Math.ceil((end - HOUR_MIN) / 60) - 1;
    let lane = laneEnds.findIndex((e) => e <= first);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = last + 1;
    placed.push({ slot, col: first, span: Math.max(1, last - first + 1), lane });
  }
  return { placed, lanes: Math.max(1, laneEnds.length) };
}

const slotDirection = (m: GateMovement) => (m.visit === "výdej" ? "OUT" : "IN");
const positionLabel = (m: Pick<GateMovement, "positionRef" | "gateRef" | "customer" | "visit">) =>
  `${m.positionRef || m.gateRef} · ${m.customer || "—"} · ${directionOfVisit(m.visit)}`;

type SlotForm = Omit<interfaces.WarehouseDockSlotInput, "durationMin"> & { durationMin?: string };

function DockSchedule() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { items, isLoading, create, update, remove, isSaving } = useDockSlots();
  const { movements, isLoading: movementsLoading } = useGateLog();
  const [date, setDate] = useState(localDate(new Date()));
  const [editing, setEditing] = useState<{ slot?: DockSlot; preset?: Partial<interfaces.WarehouseDockSlotInput> } | null>(null);
  const daySlots = useMemo(() => items.filter((s) => s.date === date).sort((a, b) => a.time.localeCompare(b.time)), [items, date]);
  // The four doors, and any other door name used on this day.
  const docks = useMemo(() => [...DOCKS, ...[...new Set(daySlots.map((s) => s.dock))].filter((d) => d && !DOCKS.includes(d)).sort()], [daySlots]);
  const byId = useMemo(() => new Map(movements.map((m) => [m.id, m])), [movements]);

  const presetFor = (m: GateMovement, extra: Partial<interfaces.WarehouseDockSlotInput> = {}): Partial<interfaces.WarehouseDockSlotInput> => ({
    movementId: m.id,
    date,
    direction: slotDirection(m),
    reference: m.positionRef || m.gateRef,
    party: m.customer,
    vehicle: m.plate,
    status: "Booked",
    durationMin: 60,
    ...extra,
  });

  // ?book=<movement id> (from the gate job): the booking form for that position.
  const book = searchParams.get("book");
  useEffect(() => {
    if (!book || movementsLoading) return;
    const m = byId.get(book);
    if (m) setEditing({ preset: presetFor(m) });
    else toast.warning("That position is not in the Gate Log (archived?) — pick it in the form");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("book");
    router.replace(params.toString() ? `${pathname}?${params}` : pathname, { scroll: false });
    // Once per link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, movementsLoading]);

  const legacy = !!editing?.slot && !editing.slot.movementId;
  const positionOptions = useMemo(() => {
    const opts = movements.map((m) => ({ value: m.id, label: positionLabel(m) }));
    // A slot's position that is no longer in the Gate Log (archived) keeps its label.
    const s = editing?.slot;
    if (s?.movementId && !byId.has(s.movementId)) opts.unshift({ value: s.movementId, label: `${s.positionRef || s.reference} · ${s.customer || "—"} · archived` });
    return opts;
  }, [movements, byId, editing]);
  const durationOptions = useMemo(() => {
    const d = editing?.slot?.durationMin;
    return [...new Set([...DURATIONS, ...(d ? [d] : [])])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: `${n} min` }));
  }, [editing]);

  const fields: FieldDef[] = [
    {
      name: "movementId",
      label: "Position",
      type: "select",
      options: positionOptions,
      required: !legacy,
      full: true,
      placeholder: legacy ? "Booked before slots were linked — pick its position" : "WCZ… · customer · direction",
    },
    { name: "date", label: "Date", type: "date", required: true },
    { name: "time", label: "Time", type: "time", required: true },
    { name: "durationMin", label: "Duration", type: "select", options: durationOptions, required: true },
    { name: "dock", label: "Dock", type: "select", options: docks, required: true },
    { name: "direction", label: "Direction", type: "select", options: ["IN", "OUT"], required: true },
    { name: "status", label: "Status", type: "select", options: SLOT_STATUSES },
    { name: "reference", label: "Reference", placeholder: "WCZ… (from the position)" },
    { name: "party", label: "Party", placeholder: "Customer (from the position)" },
    { name: "vehicle", label: "Vehicle", placeholder: TERMS.plate },
    { name: "note", label: "Note", type: "textarea" },
  ];

  // The form works with the duration as text (a select); the API takes minutes.
  const initial = useMemo<Partial<SlotForm> | undefined>(() => {
    const v = editing?.slot ?? editing?.preset;
    if (!v) return undefined;
    return { ...v, movementId: v.movementId ?? undefined, durationMin: v.durationMin ? String(v.durationMin) : "60" };
  }, [editing]);
  const toInput = (v: SlotForm): interfaces.WarehouseDockSlotInput => ({ ...v, movementId: v.movementId || null, durationMin: Number(v.durationMin) || 60 });

  const gateLink = (s: DockSlot) =>
    s.movementId ? (
      <Link href={`/warehouse/gate-log/${s.movementId}`} onClick={(e) => e.stopPropagation()} className="font-mono font-bold text-indigo-500 hover:underline">
        {s.positionRef || s.reference || "Position"}
      </Link>
    ) : s.reference ? (
      <span className="font-mono font-bold text-slate-600">{s.reference}</span>
    ) : (
      dim("")
    );

  const columns: AppGridColumn<DockSlot>[] = [
    { key: "time", title: "Time", width: 110, text: (s) => `${s.time}${s.end ? `–${s.end}` : ""}`, render: (_, s) => <span className="font-mono text-slate-700">{s.time}{s.end ? `–${s.end}` : ""}</span> },
    { key: "dock", title: "Dock", width: 100, text: (s) => s.dock, filterOptions: docks, render: (_, s) => dim(s.dock) },
    { key: "direction", title: "Direction", width: 100, text: (s) => s.direction, filterOptions: ["IN", "OUT"], render: (_, s) => <StatusTag value={s.direction} colors={{ IN: "blue", OUT: "purple" }} /> },
    { key: "reference", title: "Position", width: 170, text: (s) => s.positionRef || s.reference, render: (_, s) => gateLink(s) },
    { key: "party", title: "Party", width: 180, text: (s) => s.party, render: (_, s) => dim(s.party) },
    { key: "vehicle", title: "Vehicle", width: 120, text: (s) => s.vehicle, render: (_, s) => dim(s.vehicle) },
    { key: "status", title: "Status", width: 120, text: (s) => s.status, filterOptions: SLOT_STATUSES, render: (_, s) => <StatusTag value={s.status} colors={SLOT_COLORS} /> },
  ];

  const gridCols = `80px repeat(${HOURS.length}, minmax(0, 1fr))`;

  return (
    <>
      <Card
        title={longDate(date)}
        extra={
          <>
            <Button size="small" icon={<LeftOutlined />} onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day" />
            <Button size="small" onClick={() => setDate(localDate(new Date()))}>
              Today
            </Button>
            <Button size="small" icon={<RightOutlined />} onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day" />
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ preset: { date, direction: "IN", status: "Booked", durationMin: 60 } })}>
              Book slot
            </Button>
          </>
        }
      >
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: gridCols }}>
              <div />
              {HOURS.map((h) => (
                <div key={h} className="text-[11px] text-slate-400 text-center">
                  {h}:00
                </div>
              ))}
            </div>
            {docks.map((dock) => {
              const { placed, lanes } = placeSlots(daySlots.filter((s) => s.dock === dock && s.status !== "Cancelled"));
              return (
                <div
                  key={dock}
                  className="grid gap-1 mb-1"
                  style={{ gridTemplateColumns: gridCols, gridTemplateRows: `repeat(${lanes}, minmax(36px, auto))` }}
                >
                  <div className="text-xs font-semibold text-slate-700 self-center" style={{ gridRow: `1 / span ${lanes}` }}>
                    {dock}
                  </div>
                  {HOURS.map((h, i) => (
                    <button
                      key={h}
                      type="button"
                      aria-label={`Book ${dock} at ${h}:00`}
                      onClick={() => setEditing({ preset: { date, time: `${h}:00`, dock, direction: "IN", status: "Booked", durationMin: 60 } })}
                      style={{ gridColumn: i + 2, gridRow: `1 / span ${lanes}` }}
                      className="rounded-md border border-dashed border-slate-200 bg-slate-50/60 hover:border-indigo-300 hover:bg-indigo-50/40 cursor-pointer"
                    />
                  ))}
                  {placed.map(({ slot: s, col, span, lane }) => (
                    <Tooltip key={s.id} title={`${s.time}–${s.end || "?"} · ${s.positionRef || s.reference || "—"} · ${s.party || "—"} · ${s.status}`}>
                      <button
                        type="button"
                        onClick={() => setEditing({ slot: s })}
                        style={{ gridColumn: `${col + 2} / span ${span}`, gridRow: lane + 1 }}
                        className={`relative z-[1] text-left border rounded-md px-1.5 py-1 overflow-hidden cursor-pointer ${SLOT_CELL[s.status] ?? SLOT_CELL.Booked}`}
                      >
                        <div className="text-[10px] font-semibold leading-tight text-slate-800 truncate">
                          {s.direction} {s.time}–{s.end}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">{s.positionRef || s.reference || s.party || "—"}</div>
                      </button>
                    </Tooltip>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500">
          {SLOT_STATUSES.filter((s) => SLOT_CELL[s]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <i className={`inline-block w-2.5 h-2.5 rounded-sm border ${SLOT_CELL[s]}`} />
              {s}
            </span>
          ))}
          <span>Cancelled slots free the door and are listed below only.</span>
        </div>
      </Card>

      <AppGrid<DockSlot>
        searchPlaceholder="Search position, party, vehicle…"
        columns={columns}
        rows={daySlots}
        rowKey={(s) => s.id}
        loading={isLoading}
        onRowClick={(s) => setEditing({ slot: s })}
        storageKey="warehouse:dock-slots"
        exportFilePrefix={`dock-slots-${date}`}
        emptyText="No slots booked for this day."
        resetKey={date}
      />

      {editing && (
        <RecordFormModal<SlotForm>
          open
          title={editing.slot ? `Slot ${editing.slot.dock} · ${editing.slot.time}${editing.slot.end ? `–${editing.slot.end}` : ""}` : "Book slot"}
          note="A dock door cannot be booked twice for overlapping times. Direction, reference, party and vehicle come from the position."
          fields={fields}
          initial={initial}
          saving={isSaving}
          onCancel={() => setEditing(null)}
          onValuesChange={(changed, set) => {
            if (!("movementId" in changed)) return;
            const m = changed.movementId ? byId.get(changed.movementId) : undefined;
            if (m) set({ direction: slotDirection(m), reference: m.positionRef || m.gateRef, party: m.customer, vehicle: m.plate });
          }}
          onSubmit={(v) => (editing.slot ? update(editing.slot.id, toInput(v)) : create(toInput(v)))}
          onDelete={editing.slot ? () => remove(editing.slot!.id) : undefined}
          okText={editing.slot ? "Save" : "Book slot"}
        />
      )}
    </>
  );
}

// ---------- Yard / container park ----------

type YardFilter = "risk" | "empties" | null;

function YardPark() {
  const router = useRouter();
  const { items, isLoading, create, update, remove, isSaving } = useWarehouseContainers();
  const [filter, setFilter] = useState<YardFilter>(null);
  const [editing, setEditing] = useState<{ container?: WarehouseContainer } | null>(null);

  // On the yard = gated in and not yet gated out.
  const onYard = useMemo(() => items.filter((c) => c.gatedIn && !c.gatedOut), [items]);
  const atRisk = (c: WarehouseContainer) => {
    const d = daysUntil(c.detentionExpiry);
    return d != null && d <= 2;
  };
  const isEmpty = (c: WarehouseContainer) => /^empty/i.test(c.yardState);
  const rows = onYard.filter((c) => (filter === "risk" ? atRisk(c) : filter === "empties" ? isEmpty(c) : true));

  const fields: FieldDef[] = [
    ...(editing?.container ? [] : [{ name: "number", label: "Container number", required: true, placeholder: "TGHU 220 553-9" } as FieldDef]),
    { name: "carrier", label: "Carrier" },
    { name: "equipment", label: "Type", type: "select", options: CONTAINER_TYPES },
    { name: "yardState", label: "State", placeholder: "Full — devanning / Empty …" },
    { name: "gatedIn", label: "Gated in", type: "date", required: true },
    { name: "gatedOut", label: "Gated out", type: "date" },
    { name: "detentionExpiry", label: "Detention expiry (empty return due)", type: "date" },
    { name: "yardStatus", label: "Status", type: "select", options: YARD_STATUSES },
  ];

  const columns: AppGridColumn<WarehouseContainer>[] = [
    { key: "number", title: "Container", width: 160, text: (c) => c.number, render: (_, c) => <span className="font-mono font-bold text-indigo-500">{c.number}</span> },
    { key: "carrier", title: "Carrier", width: 140, text: (c) => c.carrier, render: (_, c) => dim(c.carrier) },
    { key: "equipment", title: "Type", width: 100, text: (c) => c.equipment, filterOptions: CONTAINER_TYPES, render: (_, c) => dim(c.equipment) },
    { key: "yardState", title: "State", width: 190, text: (c) => c.yardState, render: (_, c) => dim(c.yardState) },
    { key: "gatedIn", title: "Gated in", width: 110, text: (c) => c.gatedIn, render: (_, c) => dim(c.gatedIn) },
    { key: "detentionExpiry", title: "Detention expiry (empty return due)", width: 250, text: (c) => c.detentionExpiry, render: (_, c) => <ExpiryTag date={c.detentionExpiry} /> },
    { key: "daysOnYard", title: "Days on yard", width: 110, align: "right", text: (c) => String(c.daysOnYard ?? ""), render: (_, c) => dim(c.daysOnYard) },
    {
      key: "position",
      title: TERMS.warehouseRef,
      width: 160,
      text: (c) => c.positionRef,
      // Opens the position's Gate Log job (the old position page forwards there too).
      render: (_, c) =>
        c.positionRef && (c.movementId || c.warehouseTaskId) ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              router.push(c.movementId ? `/warehouse/gate-log/${c.movementId}` : `/warehouse/${c.warehouseTaskId}`);
            }}
            className="font-mono font-bold text-indigo-500 hover:underline cursor-pointer"
          >
            {c.positionRef}
          </span>
        ) : (
          dim("")
        ),
    },
    { key: "yardStatus", title: "Status", width: 140, text: (c) => c.yardStatus, filterOptions: YARD_STATUSES, render: (_, c) => <StatusTag value={c.yardStatus} colors={YARD_COLORS} /> },
  ];

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Kpi label="Boxes on yard" value={onYard.length} sub="full + empty" />
        <Kpi label="Detention risk ≤ 2 d" value={onYard.filter(atRisk).length} sub="last free day approaching" tone="red" />
        <Kpi label="Empties to return" value={onYard.filter(isEmpty).length} sub="awaiting drop-off" tone="amber" />
      </div>
      <AppGrid<WarehouseContainer>
        searchPlaceholder="Search container, carrier…"
        actions={
          <>
            <button className={btnPrimary} onClick={() => setEditing({})}>
              <PlusOutlined /> Gate-in container
            </button>
            <button
              onClick={() => setFilter(filter === "empties" ? null : "empties")}
              className={`flex items-center gap-1.5 shrink-0 rounded-lg border px-3 h-8 text-[13px] font-medium transition-colors ${
                filter === "empties" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Plan empty returns
            </button>
            <button
              onClick={() => setFilter(filter === "risk" ? null : "risk")}
              className={`flex items-center gap-1.5 shrink-0 rounded-lg border px-3 h-8 text-[13px] font-medium transition-colors ${
                filter === "risk" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Detention risk
            </button>
          </>
        }
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        loading={isLoading}
        onRowClick={(c) => setEditing({ container: c })}
        storageKey="warehouse:yard"
        exportFilePrefix="yard"
        emptyText={filter ? "No containers match this filter." : "No containers on the yard."}
        resetKey={filter}
      />
      {editing && (
        <RecordFormModal<interfaces.WarehouseContainerInput>
          open
          title={editing.container ? `Container ${editing.container.number}` : "Gate-in container"}
          fields={fields}
          initial={editing.container ?? { gatedIn: localDate(new Date()), yardStatus: "On site" }}
          saving={isSaving}
          onCancel={() => setEditing(null)}
          onSubmit={(v) => (editing.container ? update(editing.container.id, v) : create({ direction: "Unloading", ...v }))}
          onDelete={editing.container ? () => remove(editing.container!.id) : undefined}
          okText={editing.container ? "Save" : "Gate in"}
        />
      )}
    </>
  );
}

// ---------- Labour & equipment ----------

function Resources() {
  const staff = useStaff();
  const equipment = useEquipment();
  const [editingStaff, setEditingStaff] = useState<{ item?: StaffMember } | null>(null);
  const [editingEquipment, setEditingEquipment] = useState<{ item?: Equipment } | null>(null);

  const staffColumns: AppGridColumn<StaffMember>[] = [
    { key: "name", title: "Name", width: 160, text: (s) => s.name, render: (_, s) => <span className="font-medium text-slate-800">{s.name}</span> },
    { key: "role", title: "Role", width: 180, text: (s) => s.role, render: (_, s) => dim(s.role) },
    { key: "shift", title: "Shift", width: 130, text: (s) => s.shift, render: (_, s) => dim(s.shift) },
    { key: "area", title: "Area", width: 120, text: (s) => s.area, render: (_, s) => dim(s.area) },
    { key: "status", title: "Status", width: 130, text: (s) => s.status, render: (_, s) => <StatusTag value={s.status} colors={STAFF_COLORS} /> },
  ];
  const equipmentColumns: AppGridColumn<Equipment>[] = [
    { key: "code", title: "ID", width: 100, text: (e) => e.code, render: (_, e) => <span className="font-mono font-bold text-indigo-500">{e.code}</span> },
    { key: "kind", title: "Equipment", width: 190, text: (e) => e.kind, render: (_, e) => dim(e.kind) },
    { key: "status", title: "Status", width: 120, text: (e) => e.status, filterOptions: EQUIPMENT_STATUSES, render: (_, e) => <StatusTag value={e.status} colors={EQUIPMENT_COLORS} /> },
    { key: "operator", title: "Operator", width: 140, text: (e) => e.operator, render: (_, e) => dim(e.operator) },
    { key: "note", title: "Note", width: 240, text: (e) => e.note, render: (_, e) => dim(e.note) },
  ];

  return (
    <>
      <Card title="Shift roster — today" bodyClassName="p-4">
        <AppGrid<StaffMember>
          searchPlaceholder="Search name, role, area…"
          actions={
            <button className={btnPrimary} onClick={() => setEditingStaff({})}>
              <PlusOutlined /> Person
            </button>
          }
          columns={staffColumns}
          rows={staff.items}
          rowKey={(s) => s.id}
          loading={staff.isLoading}
          onRowClick={(s) => setEditingStaff({ item: s })}
          storageKey="warehouse:staff"
          exportFilePrefix="shift-roster"
          emptyText="Nobody on the roster yet."
        />
      </Card>
      <Card title="Equipment" bodyClassName="p-4">
        <AppGrid<Equipment>
          searchPlaceholder="Search ID, equipment, operator…"
          actions={
            <button className={btnPrimary} onClick={() => setEditingEquipment({})}>
              <PlusOutlined /> Equipment
            </button>
          }
          columns={equipmentColumns}
          rows={equipment.items}
          rowKey={(e) => e.id}
          loading={equipment.isLoading}
          onRowClick={(e) => setEditingEquipment({ item: e })}
          storageKey="warehouse:equipment"
          exportFilePrefix="equipment"
          emptyText="No equipment recorded yet."
        />
      </Card>

      {editingStaff && (
        <RecordFormModal<interfaces.WarehouseStaffInput>
          open
          title={editingStaff.item ? editingStaff.item.name : "Add to shift roster"}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "role", label: "Role", placeholder: "Receiving / WR" },
            { name: "shift", label: "Shift", placeholder: "06:00–14:00" },
            { name: "area", label: "Area", placeholder: "Dock 1–2" },
            { name: "status", label: "Status", placeholder: "On shift / Starts 14:00 / Booked" },
          ]}
          initial={editingStaff.item}
          saving={staff.isSaving}
          onCancel={() => setEditingStaff(null)}
          onSubmit={(v) => (editingStaff.item ? staff.update(editingStaff.item.id, v) : staff.create(v))}
          onDelete={editingStaff.item ? () => staff.remove(editingStaff.item!.id) : undefined}
          okText={editingStaff.item ? "Save" : "Add"}
        />
      )}
      {editingEquipment && (
        <RecordFormModal<interfaces.WarehouseEquipmentInput>
          open
          title={editingEquipment.item ? `Equipment ${editingEquipment.item.code}` : "Add equipment"}
          fields={[
            { name: "code", label: "ID", required: true, placeholder: "FL-01" },
            { name: "kind", label: "Equipment", placeholder: "Forklift 2.5 t" },
            { name: "status", label: "Status", type: "select", options: EQUIPMENT_STATUSES },
            { name: "operator", label: "Operator" },
            { name: "note", label: "Note", type: "textarea" },
          ]}
          initial={editingEquipment.item ?? { status: "Available" }}
          saving={equipment.isSaving}
          onCancel={() => setEditingEquipment(null)}
          onSubmit={(v) => (editingEquipment.item ? equipment.update(editingEquipment.item.id, v) : equipment.create(v))}
          onDelete={editingEquipment.item ? () => equipment.remove(editingEquipment.item!.id) : undefined}
          okText={editingEquipment.item ? "Save" : "Add"}
        />
      )}
    </>
  );
}
