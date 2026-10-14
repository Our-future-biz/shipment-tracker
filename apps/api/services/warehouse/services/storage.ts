// Free time and storage: ONE calculation for the whole warehouse (gate job, positions, stock,
// reports and the "Storage settled" release-gate note). Pure functions, no imports from the
// services (no import cycle).
//
//   clock start   the receipt: inbound cargo (příjem) at its gate-in; outbound cargo (výdej, the
//                 import cargo a truck picks up) at its "Received in warehouse" date (load-in
//                 date) — the truck's gate-in is the pick-up, never the receipt.
//   clock stop    the WH release; for outbound cargo (výdej) also the gate-out. An inbound
//                 (příjem) gate-out is the delivering truck leaving, not the cargo: the status
//                 stays In Warehouse, so it never stops the clock.
//   counting      calendar days in Prague time; the arrival day is day 1.
//   free days     the position's own free days, else DEFAULT_FREE_DAYS.
//   tariff        CZK 22 per W/M per day, at least CZK 120 per day (one tariff for everyone).

export const DEFAULT_FREE_DAYS = 7;
export const STORAGE_CZK_PER_WM = 22;
export const STORAGE_MIN_CZK = 120;
/** Free time is "expiring" with this many free days left or fewer. */
export const EXPIRING_DAYS = 2;

export type StorageState = "Not started" | "Within free time" | "Expiring" | "Chargeable";

const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRAGUE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" });

/** YYYY-MM-DD of an instant in the warehouse's local time (Europe/Prague). */
export const pragueDate = (d: Date) => PRAGUE.format(d);

export const isIsoDate = (s: string | null | undefined): s is string => !!s && DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Day number of a YYYY-MM-DD date (calendar days, no time zone shifts). */
export const dayNo = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Chargeable weight/measure: the larger of cbm and tonnes. */
export const wmOf = (cbm: number, weightKg: number) => round2(Math.max(cbm || 0, (weightKg || 0) / 1000));

export interface StorageClock {
  started: boolean;
  /** YYYY-MM-DD (Prague) the clock started; "" when not started. */
  startDate: string;
  stopped: boolean;
  /** YYYY-MM-DD (Prague) the clock stopped; "" while running. */
  stopDate: string;
  /** Calendar days in the warehouse, arrival day = day 1 (0 when not started). */
  daysInWarehouse: number;
  freeDays: number;
  freeDaysLeft: number;
  /** Last day of free time; "" when not started. */
  lastFreeDay: string;
  chargeableDays: number;
  wm: number;
  /** Storage per chargeable day: max(W/M × 22, 120). */
  dailyCzk: number;
  estimatedCzk: number;
  state: StorageState;
}

/**
 * The storage clock from a start date to a stop date (or today, all YYYY-MM-DD in Prague time).
 * `freeDays` null = the default. A start that is not a date means "Not started".
 */
export function storageClock(p: { start: string | null; stop?: string | null; freeDays?: number | null; wm: number; today: string }): StorageClock {
  const freeDays = typeof p.freeDays === "number" && Number.isInteger(p.freeDays) && p.freeDays >= 0 ? p.freeDays : DEFAULT_FREE_DAYS;
  const wm = round2(Math.max(0, p.wm || 0));
  const dailyCzk = round2(Math.max(wm * STORAGE_CZK_PER_WM, STORAGE_MIN_CZK));
  if (!isIsoDate(p.start)) {
    return {
      started: false,
      startDate: "",
      stopped: false,
      stopDate: "",
      daysInWarehouse: 0,
      freeDays,
      freeDaysLeft: freeDays,
      lastFreeDay: "",
      chargeableDays: 0,
      wm,
      dailyCzk,
      estimatedCzk: 0,
      state: "Not started",
    };
  }
  const stopped = isIsoDate(p.stop);
  const end = stopped ? p.stop! : p.today;
  const daysInWarehouse = Math.max(1, dayNo(end) - dayNo(p.start) + 1);
  const freeDaysLeft = Math.max(0, freeDays - daysInWarehouse);
  const chargeableDays = Math.max(0, daysInWarehouse - freeDays);
  const state: StorageState = chargeableDays > 0 ? "Chargeable" : freeDaysLeft <= EXPIRING_DAYS ? "Expiring" : "Within free time";
  return {
    started: true,
    startDate: p.start,
    stopped,
    stopDate: stopped ? p.stop! : "",
    daysInWarehouse,
    freeDays,
    freeDaysLeft,
    lastFreeDay: addDays(p.start, freeDays - 1),
    chargeableDays,
    wm,
    dailyCzk,
    estimatedCzk: Math.round(chargeableDays * dailyCzk),
    state,
  };
}

export interface StorageInfo extends StorageClock {
  /** What started the clock: the gate-in (inbound) or the "Received in warehouse" date (outbound). */
  startSource: "gateIn" | "loadInDate" | "";
}

/** The fields of a gate movement the storage clock reads. */
export interface StorageMovement {
  visit: string;
  gateIn: Date | null;
  gateOut: Date | null;
  impRelease: Date | null;
  loadInDate: string;
  freeDays: number | null;
  measureCbm: number;
  weightKg: number;
}

/** The storage clock of a gate movement at `now`. */
export function movementStorage(m: StorageMovement, now = new Date()): StorageInfo {
  const inbound = m.visit !== "výdej";
  const start = inbound ? (m.gateIn ? pragueDate(m.gateIn) : null) : isIsoDate(m.loadInDate) ? m.loadInDate : null;
  const stopAt = inbound ? m.impRelease : (m.impRelease ?? m.gateOut);
  const clock = storageClock({
    start,
    stop: stopAt ? pragueDate(stopAt) : null,
    freeDays: m.freeDays,
    wm: wmOf(m.measureCbm, m.weightKg),
    today: pragueDate(now),
  });
  return { ...clock, startSource: clock.started ? (inbound ? "gateIn" : "loadInDate") : "" };
}

const czk = (n: number) => `CZK ${n.toLocaleString("en-GB")}`;

/** The note shown on the "Storage settled" release-gate line (display only, never stored). */
export function storageNote(s: StorageClock): string {
  if (!s.started) return `not started · ${s.freeDays} free days`;
  const head = `day ${s.daysInWarehouse} · ${s.freeDays} free`;
  if (s.chargeableDays > 0) return `${head} · ${s.chargeableDays} chargeable · est. ${czk(s.estimatedCzk)}`;
  return `${head} · ${s.freeDaysLeft} free day${s.freeDaysLeft === 1 ? "" : "s"} left`;
}
