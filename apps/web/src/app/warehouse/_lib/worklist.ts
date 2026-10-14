import type { interfaces } from "@/lib/api/client";

// The warehouse as an exception worklist: Prague dates, "expected today", the quick-filter chips
// of Positions and the scan / type box of the Gate Log. Pure helpers (tested in worklist.test.ts).

type Movement = interfaces.GateMovementItem;

const PRAGUE = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD of a moment in Prague time; "" for no / an invalid time. */
export function pragueDate(at: string | Date | null | undefined): string {
  if (!at) return "";
  const d = at instanceof Date ? at : new Date(at);
  return isNaN(d.getTime()) ? "" : PRAGUE.format(d);
}

/** Today in Prague (YYYY-MM-DD). */
export const pragueToday = (now: Date = new Date()) => pragueDate(now);

// A stored date or date-time as a Prague date: a plain YYYY-MM-DD stays as it is, a time is
// converted, anything else is "".
function dayOf(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(t)) return /[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? pragueDate(t) : t.slice(0, 10);
  return "";
}

type ExpectedFields = Pick<Movement, "status" | "gateIn" | "eta" | "slot" | "subPositions" | "dockSlots">;
type DockSlot = interfaces.GateDockSlot;

/** Dock slots that still hold their door (Cancelled and Completed ones free it). */
const liveSlot = (s: DockSlot) => s.status !== "Cancelled" && s.status !== "Completed";

/** The movement's first live dock slot on `today` (Prague date), if any. */
export function slotToday(m: Pick<Movement, "dockSlots">, today: string): DockSlot | undefined {
  return m.dockSlots.filter((s) => liveSlot(s) && s.date === today).sort((a, b) => a.time.localeCompare(b.time))[0];
}

/** "Dock 2 · 14 Oct 08:00–09:00 · Booked" — a dock slot as the gate job and floor mode show it. */
export function dockSlotText(s: DockSlot): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? new Date(`${s.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : s.date;
  return `${s.dock} · ${day} ${s.time}${s.end ? `–${s.end}` : ""} · ${s.status}`;
}

/**
 * Expected at the gate today: not arrived yet (status Expected, no gate-in) and today is its ETA,
 * its dock slot (Dock & Yard; the older slot text when it has none) or the ETA warehouse (ETW) of
 * one of its sub-positions.
 */
export function isExpectedToday(m: ExpectedFields, today: string): boolean {
  if (m.status !== "Expected" || m.gateIn) return false;
  if (slotToday(m, today) || dayOf(m.eta) === today || dayOf(m.slot) === today) return true;
  return m.subPositions.some((s) => dayOf(s.etw) === today);
}

/** What made a movement expected today, for the panel ("Slot 08:00 · Dock 2", "ETA", "ETW"). */
export function expectedBecause(m: ExpectedFields, today: string): string {
  const parts: string[] = [];
  const booked = slotToday(m, today);
  if (booked) parts.push(`Slot ${booked.time} · ${booked.dock}`);
  else if (dayOf(m.slot) === today) parts.push(`Slot ${m.slot.slice(11, 16) || m.slot}`.trim());
  if (dayOf(m.eta) === today) parts.push("ETA");
  if (m.subPositions.some((s) => dayOf(s.etw) === today)) parts.push("ETW");
  return parts.join(" · ");
}

/**
 * Sort key of the Expected today list: the dock slot time today first (HH:MM), then the older slot
 * text's time, then the ETA's; without a time the position goes last ("99:99").
 */
export function expectedSortKey(m: ExpectedFields, today: string): string {
  const booked = slotToday(m, today);
  if (booked) return booked.time;
  if (dayOf(m.slot) === today && /\d{2}:\d{2}/.test(m.slot.slice(11))) return m.slot.slice(11, 16);
  const eta = (m.eta ?? "").trim();
  if (dayOf(eta) === today && /[ T]\d{2}:\d{2}/.test(eta)) {
    const zoned = /[zZ]|[+-]\d{2}:?\d{2}$/.test(eta);
    return zoned ? PRAGUE_TIME.format(new Date(eta)) : eta.slice(11, 16);
  }
  return "99:99";
}

const PRAGUE_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// ─── Positions quick filters ───────────────────────────────────

export type ChipId = "attention" | "expectedToday" | "inWarehouse" | "expiring" | "chargeable" | "onHold" | "releasedToday";

type ChipFields = Pick<
  Movement,
  "status" | "gateIn" | "gateOut" | "impRelease" | "visit" | "eta" | "slot" | "subPositions" | "dockSlots" | "needsAttention" | "openExceptions" | "overridden" | "shipmentUpdate" | "storage"
> &
  Partial<Pick<Movement, "leftAt">>;

// An inbound (příjem) gate-out is the delivering truck leaving: the cargo stays In Warehouse.
// Only an outbound (výdej) gate-out means the cargo has gone.
const goneOut = (m: Pick<Movement, "visit" | "gateOut">) => m.visit === "výdej" && !!m.gateOut;

/** The storage clock runs: received and not yet released / gone out. */
export const inWarehouse = (m: ChipFields) => (m.storage.started && !m.storage.stopped) || (m.status === "In Warehouse" && !goneOut(m) && !m.impRelease);

/**
 * The day the cargo was released: the WH release, or the gate-out of the export container it was
 * stuffed in (an inbound truck's gate-out is not a release).
 */
export const releasedOn = (m: Pick<Movement, "visit" | "impRelease" | "gateOut"> & Partial<Pick<Movement, "leftAt">>) => pragueDate(m.impRelease ?? m.leftAt ?? null);

/** An open exception holds cargo only until it leaves (WH release or its container's gate-out); after it the exception is still open but nothing is held. */
export const isOnHold = (m: Pick<Movement, "openExceptions" | "impRelease" | "overridden"> & Partial<Pick<Movement, "leftAt">>) =>
  m.openExceptions > 0 && !m.impRelease && !m.leftAt && !m.overridden;

/** The Exceptions cell / badge text: "On hold (n)" before the release, "Open exception (n)" after it, "" when none is open. */
export const exceptionText = (m: Pick<Movement, "openExceptions" | "impRelease" | "overridden"> & Partial<Pick<Movement, "leftAt">>) =>
  m.openExceptions > 0 ? `${isOnHold(m) ? "On hold" : `Open exception${m.openExceptions === 1 ? "" : "s"}`} (${m.openExceptions})` : "";

export const CHIPS: { id: ChipId; label: string; hint: string; danger?: boolean; match: (m: ChipFields, today: string) => boolean }[] = [
  {
    id: "attention",
    label: "Needs attention",
    hint: "Release gates blocked or MRN missing on outbound cargo, an open damage / short / over exception, or a shipment update that failed",
    danger: true,
    match: (m) => m.needsAttention || m.openExceptions > 0 || m.shipmentUpdate?.state === "failed",
  },
  { id: "expectedToday", label: "Expected today", hint: "Not arrived yet; ETA, dock slot or ETA warehouse is today (Prague time)", match: (m, today) => isExpectedToday(m, today) },
  { id: "inWarehouse", label: "In warehouse", hint: "Received and not yet released or gone out", match: (m) => inWarehouse(m) },
  {
    id: "expiring",
    label: "Free time expiring ≤ 2 days",
    hint: "Still in the warehouse with 2 free days left or fewer",
    match: (m) => inWarehouse(m) && m.storage.state === "Expiring",
  },
  { id: "chargeable", label: "Chargeable", hint: "Still in the warehouse and past its free days — storage is being charged", match: (m) => inWarehouse(m) && m.storage.chargeableDays > 0 },
  {
    id: "onHold",
    label: "On hold",
    hint: "An open damage / short / over exception holds the release (released cargo is not on hold)",
    danger: true,
    match: (m) => isOnHold(m),
  },
  { id: "releasedToday", label: "Released today", hint: "WH release stamped today", match: (m, today) => releasedOn(m) === today },
];

export const CHIP_IDS = CHIPS.map((c) => c.id);

export function chipMatch(id: ChipId, m: ChipFields, today: string): boolean {
  return CHIPS.find((c) => c.id === id)?.match(m, today) ?? false;
}

// ─── Scan or type ──────────────────────────────────────────────

type ScanFields = Pick<Movement, "id" | "gateRef" | "positionRef" | "jobNumber" | "containerNumber" | "plate" | "containers" | "transportLegs">;

/** A scanned or typed value as compared: trimmed, upper case, no spaces. */
export const normalizeScan = (v: string) => v.trim().toUpperCase().replace(/\s+/g, "");

export type ScanResult<M> = { kind: "open"; movement: M } | { kind: "many"; matches: M[] } | { kind: "none" };

/**
 * What a scanned label or typed value opens. The label's barcode and QR code carry the warehouse
 * ref (or the gate ref of a record without a position): an exact match opens that job. Otherwise
 * one exact match on the job no., a container number or a plate opens it; several matches are
 * listed; nothing found is "none".
 */
export function scanMatch<M extends ScanFields>(value: string, movements: M[]): ScanResult<M> {
  const q = normalizeScan(value);
  if (!q) return { kind: "none" };
  const byRef = movements.filter((m) => normalizeScan(m.positionRef) === q || normalizeScan(m.gateRef) === q);
  if (byRef.length === 1) return { kind: "open", movement: byRef[0]! };
  if (byRef.length > 1) return { kind: "many", matches: byRef };
  const other = movements.filter((m) =>
    [m.jobNumber, m.containerNumber, m.plate, ...m.containers.map((c) => c.number), ...m.transportLegs.map((l) => l.plate)].some((v) => v && normalizeScan(v) === q),
  );
  if (other.length === 1) return { kind: "open", movement: other[0]! };
  if (other.length > 1) return { kind: "many", matches: other };
  return { kind: "none" };
}

/**
 * A scanned or typed value that is the number of a container with houses (positions in it): that
 * container's id and number — floor mode opens its tally / stuffing list. Null when it is not one
 * (a position's own ref always wins: callers try it first).
 */
export function containerScanMatch(value: string, movements: Pick<Movement, "container">[]): { id: string; number: string } | null {
  const q = normalizeScan(value);
  if (!q) return null;
  const found = new Map<string, string>();
  for (const m of movements) if (m.container && normalizeScan(m.container.number) === q) found.set(m.container.id, m.container.number);
  if (found.size !== 1) return null;
  const [id, number] = [...found.entries()][0]!;
  return { id, number };
}
